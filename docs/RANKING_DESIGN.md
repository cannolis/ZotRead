# 多上下文排序设计

> Decide which paper to read next — based on **who you are** and **what you're thinking**, not just a keyword string.

## 一、需求拆解

用户当前的 research focus 只是一段静态文字，信号太单薄。实际想要的 ranking 触发来源应至少有三类：

| 信号类型 | 来源 | 特点 | 生命周期 |
|---------|------|------|----------|
| **身份信号** | 自己发表过的论文 | 稳定、能代表长期研究轨迹 | 半年-多年 |
| **意图信号** | 某个正在成形的 idea | 新、未定型、可能跨学科 | 几天-几周 |
| **默认信号** | 当前的 focus 短语 | 便捷、宽泛 | 随时改 |

不同场景要切不同信号：
- "今天读什么，推进我的主线" → **身份信号**（稳扎稳打）
- "我在想这个 idea，相关文献是谁" → **意图信号**（探索未知）
- "随便看看" → **默认信号**

核心设计原则：**ranking 不是一个固定函数，而是一个可切换上下文的函数**。

## 二、数据模型

### 2.1 新概念：`RankingContext`

一个"上下文"就是你打算拿什么去衡量候选论文。

```ts
type ContextKind = "my-papers" | "idea" | "focus";

interface RankingContext {
  id: string;                    // 稳定 id，如 "my-pubs-main" / "idea-interp-2026q2"
  name: string;                  // 显示名："我的论文 (主线)" / "可解释性 idea"
  kind: ContextKind;
  createdAt: number;             // 便于按创建顺序展示

  // kind="my-papers" 用这个：
  anchorItemIDs?: number[];      // 指向 Zotero 库里自己发过的论文
  anchorCollection?: string;     // 或指向一个 Zotero collection（自动同步）

  // kind="idea" 用这个：
  ideaText?: string;             // 自由文本，几百字描述你的想法
  seedItemIDs?: number[];        // 这个 idea 已经注意到的种子论文（可选）

  // kind="focus" 用这个：
  focusString?: string;          // 就是现在的 research focus 字段
}
```

**存储**：新建一张 SQLite 表 `zotread_contexts`（Zotero 的 DB 里），而不是堆到 prefs。prefs 只存"当前激活的 contextID"。

### 2.2 Triage 结果缓存

每次 LLM 判分贵。结果落表，避免重复消费 token：

```ts
interface TriageCache {
  itemID: number;        // Zotero 条目
  contextID: string;     // 哪个上下文下的判决
  verdict: TriageVerdict;
  itemContentHash: string;   // abstract 的 hash，用于判断论文是否变化
  contextHash: string;       // 上下文内容的 hash，用于判断上下文是否变化
  createdAt: number;
}

PRIMARY KEY (itemID, contextID)
```

→ 只要论文 abstract 没变 + 上下文没变，就命中缓存，秒出结果。

## 三、Ranking 算法（分两层）

论文库大（>100）时纯 LLM 判决成本不可忽视。两层设计：

### Layer 1 — 粗排（无需 embedding，可做可不做）

两种实现：

**A. 无 embedding（简单）**
- 用关键词匹配 + 基础规则粗筛
  - 候选论文的 `title + abstract` 和上下文文本的**词袋重合度**（BM25-ish）
  - 结合"发表年份"、"加入日期"衰减
- 取 Top-50 送到 Layer 2

**B. 加 embedding（后续迭代）**
- 用 OpenAI/Jina embedding API（OpenRouter 不支持 embedding）或本地 Ollama
- 把每篇论文和上下文各 embed 一次（缓存）
- 余弦相似度排序，Top-50 送 Layer 2

V1 先走 A，库大到 500+ 再上 B。

### Layer 2 — 精排（LLM 判决）

对 Top-50 每篇调一次 LLM，让模型看到：
- 完整的上下文材料（我的论文全文 abstract / 或 idea 文本）
- 候选论文的 title + abstract
- 要求返回结构化判决

Prompt 按 context kind 分三套模板（见下）。

### 3.1 模板：against `my-papers`

```
You are ZotRead, a research-triage assistant.

The researcher has published these papers, which represent their
identity and main research line:

==== Paper 1 ====
Title: <...>
Year: <...>
Abstract: <...>

==== Paper 2 ====
...

==== Candidate to evaluate ====
Title: <...>
Authors: <...>
Abstract: <...>

Task:
Does reading this candidate advance the same research agenda? Consider:
- Does it build on or cite the same theoretical foundations?
- Does it address the same problem family?
- Does it offer methods that could be ported into the researcher's work?
- Is it a competitor / parallel effort worth tracking?

Return JSON:
{
  "tldr": [string, string, string],
  "relevance": 0.0..5.0,
  "verdict": "must_read" | "skim" | "skip",
  "reason": "≤30 words",
  "connection": "anchor_paper_index (1-based) most similar, or null"
}
```

### 3.2 模板：against `idea`

```
You are ZotRead. The researcher is developing this research idea:
"""
<idea text — a paragraph, 100-500 words>
"""

Optional: they have already flagged these seed papers as relevant:
<titles>

==== Candidate to evaluate ====
Title: ...
Abstract: ...

Task:
Is this candidate useful for the idea? Map its role:
- prior_art: directly addresses the same question
- method_inspiration: gives a technique that could be borrowed
- supporting_evidence: provides data/findings the idea relies on
- competitor: someone is doing ~the same thing already
- irrelevant

Return JSON:
{
  "tldr": [string, string, string],
  "relevance": 0.0..5.0,
  "verdict": "must_read" | "skim" | "skip",
  "reason": "≤30 words",
  "role": "prior_art" | "method_inspiration" | "supporting_evidence" | "competitor" | "irrelevant"
}
```

### 3.3 模板：against `focus`

保持当前实现，基本不动。

## 四、公开 API

在 `Zotero.ZotRead.api` 上加：

```ts
// 上下文 CRUD
api.createMyPapersContext(name: string, itemIDs: number[])
api.createIdeaContext(name: string, ideaText: string, seedItemIDs?: number[])
api.createFocusContext(name: string, focusString: string)
api.listContexts(): RankingContext[]
api.deleteContext(id: string)

// 激活 / 使用
api.setActiveContext(id: string)
api.getActiveContext(): RankingContext | null
api.triageAgainst(contextID: string, itemIDs?: number[]): TriagedItem[]

// 缓存管理
api.invalidateContextCache(contextID: string)  // 上下文改了
api.clearTriageCache()

// 便利方法
api.importMyPapersFromArxiv(arxivIDs: string[], contextName: string)
api.importMyPapersFromCollection(collectionName: string, contextName: string)
```

## 五、UI 最小可用版

不急着做花哨面板，V1 就加两件：

1. **设置页里加一个 "Ranking Contexts" 区块**
   - 列出已有上下文
   - 新建：给名字 → 选类型 → 填内容（复用现有 Research Focus textarea 加一个"上下文类型"dropdown）
   - 删除、重命名
   - Radio 选当前激活的那个

2. **右键菜单（collection / item 上）加**
   - "ZotRead: Triage against [active context]" — 对选中项 triage
   - "ZotRead: Triage this collection" — 对整个 collection triage
   - 结果弹一个 dialog 或写到一个 "ZotRead — Top Reads" 虚拟 collection 里

右键菜单之前有注入问题，这次用 Zotero 7+ 的 `MenuManager.registerMenu()` 而非直接 DOM 操作，更稳。

## 六、隐私 & 成本

- **隐私**：用户自己的论文 + idea 都会进 prompt 送到 OpenRouter。要在文档里明确告知。敏感 idea 的用户应该用本地 LLM（Ollama chat 模型）——代码层面已经是 OpenAI-compat，换 baseURL 就行。
- **成本估算**（gpt-4o-mini，~2k tokens/请求 due to anchor papers in prompt）：
  - per paper: $0.0003
  - 100 篇：$0.03
  - 1000 篇：$0.30
  - 缓存命中率 90%+ 情况下月度约 $0.5-2

## 七、实施顺序（2 周）

### W1：核心链路打通

- Day 1-2: SQLite schema (`zotread_contexts`, `zotread_triage_cache`) + CRUD
- Day 3: `api.createIdeaContext()` + `api.createMyPapersContext()` + 激活切换
- Day 4: 按 kind 分支的 prompt 构建 + LLM 调用
- Day 5: `api.triageAgainst()` + 缓存命中逻辑
- Day 6-7: 结果写到一个 auto-maintained collection "ZotRead: Top Reads"

### W2：UI + 打磨

- Day 8-9: 设置页 Context 管理区块
- Day 10: 右键菜单（用 MenuManager 新 API）
- Day 11-12: 结果面板（item pane section 显示当前 context 下的 verdict + TL;DR）
- Day 13-14: dogfood + 修 bug

## 八、开放问题（要你拍板）

1. **"我的论文" 从哪来？**
   - (a) 你手动拖进一个 Zotero collection "My Publications"，我读那里
   - (b) 给我一个 arXiv 作者页 URL / ORCID / Google Scholar ID，我自动拉
   - (c) 手动填 DOI/arxiv ID 列表
   - 建议：(a) 最简单，(b) 最优雅但要 ORCID 接入

2. **"idea" 的形式多丰富？**
   - 只是一段纯文本？
   - 还是结构化的（problem / approach / related work 列表）？
   - 能不能附几篇"种子论文"（这个 idea 已经想到的相关文献）？
   - 建议：V1 先纯文本 + 可选种子论文；V2 再结构化

3. **多上下文怎么组合？**
   - 每次只用一个激活上下文？（简单）
   - 还是支持混合加权？（如 60% 身份 + 40% idea）
   - 建议：V1 单个；加权做进 V2

4. **同一论文不同上下文的结果是否都保留？**
   - 保留：能让你比较"这篇论文在我的'身份'下还是'idea'下更相关"
   - 不保留：简化
   - 建议：保留（反正 DB 存得下，key 是 (itemID, contextID)）

## 九、和现有代码的兼容

现在的 `researchFocus` pref 相当于一个默认的 `focus` 类型上下文。迁移路径：
- 启动时如果 `researchFocus` 非空且 `zotread_contexts` 表空 → 自动建一个 name="Default Focus" 的 context
- 用户原有工作流（直接叫 `api.triageAll()`）保持可用，等同于 "against active context"

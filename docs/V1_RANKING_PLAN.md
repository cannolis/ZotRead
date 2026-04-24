# ZotRead V1 — "我的论文 × 候选论文" 相似度排序

> 基于用户 2026-04-24 对话反馈重写。核心变化：
> 不再是一次性 LLM 判决，而是**"每篇生成 summary → anchor×candidate 成对相似度 → 聚合 + 已读降权 → 排序"**。

## 一、核心数据流

```
         ┌─────────────────────────┐
  新文献 →│ generate_summary(item)  │──┐
         └─────────────────────────┘  │
                                      ▼
                            ┌────────────────────┐
                            │  summaries table   │（每篇存一份）
                            └────────┬───────────┘
                                     │
  用户点"查看队列"                     │
     │                                │
     ▼                                │
  遍历 anchors × candidates           │
     │                                │
     ▼                                │
  ┌─────────────────────────────┐     │
  │ similarity(a, c) ─ 命中缓存? │◄────┤
  │  ├─ 是：读缓存               │     │
  │  └─ 否：调 LLM，结果入缓存    │     │
  └─────────────────────────────┘     │
                │                     │
                ▼                     │
  聚合 score(c) = agg{sim(a,c)}       │
                │                     │
                ▼                     │
  已读/归档降权 + 排序                  │
                │                     │
                ▼                     │
  呈现 Reading Queue                  │
```

## 二、功能点清单

| # | 功能 | 用户动作 | 系统动作 |
|---|------|----------|----------|
| F1 | 标记"我的论文"（anchor） | 右键一篇 → "Mark as my paper" | DB 里加一条 anchor 记录 |
| F2 | 取消 anchor | 右键一篇已 anchor → "Unmark" | 删 anchor 记录；不删 summary |
| F3 | 自动生成论文 summary | 无（后台自动） | 新条目加入或 abstract 变 → LLM 生成 summary 并缓存 |
| F4 | 手动重算 summary | 右键 → "ZotRead: Regenerate summary" | 清旧 summary + 所有相关成对相似度 |
| F5 | 计算 anchor↔候选 相似度 | 无（查看队列时按需触发） | LLM 判相似度，落库缓存 |
| F6 | 展示 Reading Queue | 打开左侧 "ZotRead: To Read" 虚拟集合 | 遍历、聚合、排序、渲染 |
| F7 | 只用部分 anchor 排序 | 设置里或 Item Pane 勾选子集 | agg 时只取勾选的 anchor |
| F8 | 标记"已读"/"跳过" | Item Pane / 右键菜单 | status 表改写，下次排序降权 |
| F9 | 标记"归档" | 右键 → "Archive" | 从队列中彻底排除 |
| F10 | 清缓存（调模型、换 anchor 后） | 设置里"Clear cache" 按钮 | 清 similarity 或 summary |

## 三、数据模型（SQLite 四张表）

```sql
-- 每篇论文的总结（一条一条加）
CREATE TABLE zotread_summary (
  itemID      INTEGER PRIMARY KEY,
  contentHash TEXT NOT NULL,   -- sha256(title + abstract) — 变了就失效
  model       TEXT NOT NULL,   -- "openai/gpt-4o-mini" 等
  summary     TEXT NOT NULL,   -- 3-5 句话，捕捉 claim/method/result/domain
  keyTerms    TEXT,            -- JSON array: 提炼出的关键概念，便于前端展示
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);

-- 用户标记为"我的论文"的 itemID
CREATE TABLE zotread_anchor (
  itemID INTEGER PRIMARY KEY,
  addedAt INTEGER NOT NULL,
  note    TEXT   -- 可选：用户给这篇 anchor 写的备注（"我的第 2 作"/"博士第三篇"）
);

-- anchor × candidate 成对相似度缓存
CREATE TABLE zotread_similarity (
  anchorItemID        INTEGER NOT NULL,
  candidateItemID     INTEGER NOT NULL,
  anchorContentHash   TEXT NOT NULL,  -- 任一侧 hash 变化则缓存失效
  candidateContentHash TEXT NOT NULL,
  method              TEXT NOT NULL,  -- "llm-judge-v1" / 未来可加 "embedding-cos-v1"
  similarity          REAL NOT NULL,  -- 0..1
  rationale           TEXT,           -- LLM 给的一句"为什么像"（用于解释性 UI）
  role                TEXT,           -- "same-problem"/"similar-method"/"shared-theory"/"unrelated"
  createdAt           INTEGER NOT NULL,
  PRIMARY KEY (anchorItemID, candidateItemID, method)
);

-- 用户对候选论文的状态（已读/跳过/归档）
CREATE TABLE zotread_status (
  itemID    INTEGER PRIMARY KEY,
  status    TEXT NOT NULL,   -- "unread" (默认) / "reading" / "read" / "skipped" / "archived"
  updatedAt INTEGER NOT NULL,
  note      TEXT
);
```

## 四、排序算法

```
输入:
  A = 选中的 anchor 集合 (默认 = 所有 anchor)
  C = 候选集 = 库内非 anchor + 非 archived 的条目
  
对每个 c ∈ C:
  1. 确保 summary(c) 存在（没有就即时生成）
  2. 对每个 a ∈ A:
     - 拿 similarity(a, c, "llm-judge-v1")
     - 命中缓存？→ 直接用
     - 没命中？→ 调 LLM，写缓存
  3. 聚合 score(c):
     方案 A (默认): top-3 mean
         取 c 对 A 中相似度最高的 3 个 anchor 的均值
         (稳健：单个 anchor 偶然很像不会把分数拉爆)
     方案 B: max
         给"强匹配"最高分；更激进
     方案 C: mean
         整体稳定，但会被不相关的 anchor 拉低
  4. 应用状态调整:
     status = "read"     → score *= 0.2
     status = "skipped"  → score *= 0.5
     status = "archived" → 直接剔除
     status = "reading"  → score *= 0.8 （正在读的不要再推）
     其余默认 unread     → 不动
  5. 排序降序

输出:
  Top N 条目的有序列表，附带：
    - 聚合分
    - 贡献最高的 anchor（"这篇最像你的论文 X"）
    - LLM 给的 rationale
    - 用户状态
```

## 五、Prompt 设计

### 5.1 Summary 生成（F3）

一篇论文生成一份"可供相似度比对的浓缩表示"。不是给用户看的 TL;DR，是给下游算法看的结构化信息。

```
Summarize this paper for downstream semantic comparison with other papers.

Title: {title}
Authors: {authors}
Year: {year}
Abstract: {abstract}

Return JSON with exactly these keys:
{
  "oneLine": "1 sentence capturing what the paper does",
  "problem": "the problem / research question",
  "method": "the technical approach / method",
  "finding": "main result / contribution",
  "domain": "the subfield, comma-separated tags (e.g. 'NLP, few-shot learning, transformer')",
  "keyTerms": [string, string, string]   // 3-6 terms that most identify this paper
}
```

存到 `zotread_summary.summary` 整个 JSON 字符串化；`keyTerms` 另存字段便于 UI。

### 5.2 成对相似度（F5）

```
You are comparing two research papers for semantic similarity.

PAPER A (researcher's own publication):
  Title: {a.title}
  Problem: {a.summary.problem}
  Method: {a.summary.method}
  Finding: {a.summary.finding}
  Domain: {a.summary.domain}

PAPER B (candidate to consider reading):
  Title: {b.title}
  Problem: {b.summary.problem}
  Method: {b.summary.method}
  Finding: {b.summary.finding}
  Domain: {b.summary.domain}

Task: assess how much reading Paper B would advance Paper A's research agenda.

Return JSON:
{
  "similarity": 0.0..1.0,   // overall
  "rationale": "one sentence, ≤25 words",
  "role": "same-problem" | "similar-method" | "shared-theory" | "adjacent-field" | "unrelated"
}
```

**注意**：传进去的是两篇的 summary JSON，**不是原始 abstract**。为什么：
- summary 是预计算+缓存的，token 少（~150 tokens vs abstract ~500 tokens）
- 成对调用 N×M 次，省下来的 token 累计很可观
- LLM 在结构化输入上更稳定

### 5.3 多 anchor 合并"为什么推荐"（展示用）

当用户悬停一篇被推荐的论文，可选再调一次 LLM 生成整体解释：

```
Given the researcher's K papers (anchors) and this candidate,
summarize in ≤40 words why they should read it.
```

可选功能，V1 先不做，留给 V2。

## 六、缓存失效逻辑

何时清缓存：

| 事件 | 清什么 |
|------|--------|
| 某篇论文的 abstract 变了 | 该篇的 summary；以及它参与的所有 similarity 行 |
| 切换 LLM 模型 | 全部 similarity（model 作为 PK 一部分，自然会重算） |
| 用户点 "Regenerate summary" | 该篇 summary + 它参与的相似度 |
| 用户 add/remove anchor | 不清；只影响当前排序用的 A 集合 |
| 用户 mark read | 不清；只影响当前排序用的打分 |

**关键**：anchor 的增减和 read 状态变化**不触发任何 LLM 调用**。那些数据已经缓存了；只是从"算哪些" + "怎么加分"里选择。这就是你说的"下次还能复用"。

## 七、场景演练（带数字）

设定：30 篇论文库，其中 3 篇是 anchor。

### 首次点开 "Reading Queue"
- 27 个候选，每个需要对 3 个 anchor 算相似度 = **81 个 LLM pair 调用** + **30 个 summary 生成**
- 总 token ≈ 111 × 1000 = 110K tokens
- gpt-4o-mini: ≈ **$0.02** 第一次
- 完成后全部落缓存

### 之后再打开，没新增文献
- 81 次都缓存命中
- **0 个 LLM 调用**
- 瞬间出结果（就是查 DB + 聚合数学）

### 加了 1 篇新论文到库里
- 1 个 summary 生成
- 1 × 3 = 3 个 pair 调用
- 其余 81 个仍命中缓存
- 增量 4 个 LLM 调用 ≈ **$0.001**

### 用户新增 1 个 anchor（把原来的某篇候选升级为 anchor）
- 那篇已经有 summary 了（已缓存）
- 其余 26 篇候选 vs 这个新 anchor = 26 个 pair 调用
- 增量约 $0.008

### 用户改了 research focus 或 idea 文本
- **不影响**，因为 V1 设计里排序只基于 anchor（不再基于 focus 字符串）
- focus/idea 如果要加进来，是 V2 再说

## 八、用户选择权（F7 partial selection）

UI 上 anchor 旁边有 checkbox。排序时只聚合被勾选的。

两种用法：
1. **聚焦当前课题**：你有 5 篇发过的论文横跨不同方向，今天想推进项目 X，就只勾和 X 相关的 2 篇，让排序偏向这个方向
2. **"反向筛选"**：不勾选你已经做完的领域，避免推荐那些方向上的论文

实现上：`api.rankReadingQueue({ anchorSubset: [id1, id2] })`

## 九、"已读"降权（F8）

用户标记已读的四种状态：

| 状态 | 含义 | 对下次排序的影响 |
|------|------|------------------|
| unread | 默认 | 无影响（1.0×） |
| reading | 正在读 | score × 0.8（不要再重复推） |
| read | 读完了 | score × 0.2（大幅降权但不消失，能看到"已读清单"） |
| skipped | 看过摘要不想读 | score × 0.5 |
| archived | 完全剔除 | 从队列移除 |

"read" 不设 0 是因为：重要论文可能需要多次读；但队列里不能被它们塞满。

另：可选功能，支持 "undo read" — 用户标错了能反悔。

## 十、首次测试工作流（30 篇 + 3 篇 anchor）

给你 dogfood：

1. `api.importArxiv([...30 个 arxiv id...])` — 导入 30 篇
2. `api.addAnchor(itemID)` × 3 — 标记其中 3 篇为 anchor
3. `api.rankReadingQueue()` — 首次触发（消耗 ~$0.02）
4. 查看前 10 名，对比 LLM 给的 rationale 合不合理
5. 标几个 "read"，重排，看排名变化
6. 切换 anchor subset（只留 1 篇 anchor），看排序怎么变

## 十一、实施路线（我建议 2 周）

### W1 — 数据层 + 算法

- **Day 1**：建 4 张 SQLite 表的 CRUD 模块（`src/services/db.ts`）
- **Day 2**：Summary 生成器（LLM 调用 + hash 校验 + 缓存）(`src/modules/summarizer.ts`)
- **Day 3**：Pairwise 相似度计算器 + 缓存 (`src/modules/similarity.ts`)
- **Day 4**：聚合 + status 加权 + 排序 (`src/modules/ranker.ts`)
- **Day 5**：API 暴露 + devHarness 自测（替换当前 triage 流水线）

### W2 — UI + Dogfood

- **Day 6-7**：Item Pane Section 显示 anchor 开关、相似度分布、当前状态；按钮支持 mark-read / archive
- **Day 8-9**：虚拟 collection "📖 ZotRead: Reading Queue" 自动维护
- **Day 10**：设置页的 anchor subset 选择器、清缓存按钮
- **Day 11-12**：右键菜单（用 Zotero 7+ MenuManager API）
- **Day 13-14**：dogfood 30 篇 + 3 anchor，修 bug、调 prompt

## 十二、几个要你最后确认的点

1. **聚合方式默认值**：我选 **top-3 mean**（稳健）。你倾向 max（激进）还是 mean（保守）？

2. **summary 粒度**：我提议只用 abstract 生成。如果你 PDF 附件有 full text，要不要让 summary 也吃正文？
   - 只 abstract：快、便宜、每篇 ~500 tokens
   - abstract + intro/conclusion：更准但每篇 ~3k tokens，成本 ×6
   - 我建议 **只 abstract** 先做；V2 再加"fallback 到正文当 abstract 缺失"

3. **relative vs absolute 打分**：输出是绝对分（0-5 星）还是相对排名（Top 20）？
   - 建议：**两者都给**。Reading Queue 显示 Top 20，Item Pane Section 显示绝对分 + rationale

4. **新文献自动 summarize**：Zotero 有 notifier 可以监听 item add 事件。要不要启动时自动给所有未总结的文献补 summary？
   - 建议：**是**，但异步后台慢慢做，别阻塞 UI
   - 用户导入 10 篇 → 后台 10 个 summary 调用逐个跑 → 每篇 1 秒左右

回复这 4 个点（或告诉我有哪里要改），我就开工实现 W1。

# ZotRead — MVP Spec v0.1

> 编制日期：2026-04-24
> 一句话定位：Zotero 读前决策助手 —— 帮你决定该读哪篇论文。
> 不是：又一个 AI 聊天框 / RAG 全库问答 / 笔记工具。

---

## 1. 用户痛点（已验证）

> "我下了很多论文，但是读过的不多，不知道该读哪篇。" —— 目标用户原话

研究者 Zotero 库 80% 是未读 PDF。现有生态全在优化"收集"和"引用"，**"决定读什么"这个上游决策环节无人覆盖**。

## 2. 核心假设

痛点不在 PDF 里，在 PDF 之前。一旦决定读，现有工具够用；但"读不读"全靠盲猜。

## 3. MVP 功能范围（砍到极致）

**只做一件事：Reading Queue 面板。**

### 3.1 自动评分（每篇未读论文）

| 维度 | 计算方式 | 权重 |
|------|---------|------|
| 🎯 相关度 | 与"正样本集合"（被 star / 多次打开 / 被笔记引用的论文）的 cosine similarity | 0.5 |
| 🔥 新颖度 | 1 - (与已读论文 embedding 最近邻相似度)；重复的降权 | 0.3 |
| ⏰ 时效性 | 发布时间 × 添加时间的指数衰减 | 0.2 |

总分 0-5，显示为 ⭐ 星级。

### 3.2 TL;DR 卡片

鼠标悬停 2 秒后弹出：
- LLM 生成的 3 行摘要（from abstract + 首页，本地或 API）
- 一句"你应该读这个吗？"（结合用户近期笔记中的关键词个性化）
- 3 个最相似的已读论文（点击跳转）

### 3.3 一键分流

每行三个按钮：
- `📖 读` → 打开 PDF + 标记为"reading"
- `⏭️ 跳过` → 降权，3 个月后再出现
- `🗑️ 移出` → 永久降权，进入负样本池

**行为数据回灌评分模型**。用户点 5 次"跳过"之后系统就学会"这类论文他不读"。

## 4. 明确不做（V1 之后再说）

- ❌ PDF 内 chat / QA（zotero-gpt 已做）
- ❌ 整库 RAG 问答（PapersGPT 已做）
- ❌ 笔记管理（Better Notes 已做）
- ❌ 翻译（zotero-pdf-translate 已做）
- ❌ 同步 / 元数据 / 引用（各有王者）
- ❌ 综述生成（V2 再做，是自然延伸）

## 5. 技术架构

```
┌─────────────────────────────────────┐
│  Zotero 7 Plugin (bootstrap.js + TS)│
└───────────────┬─────────────────────┘
                │
    ┌───────────┼──────────────┐
    ▼           ▼              ▼
┌─────────┐ ┌────────┐ ┌─────────────┐
│ UI 注入 │ │ 评分   │ │ LLM / Embed │
│ CollTree│ │ 引擎   │ │ 适配层      │
│ ItemPane│ │ SQLite │ │ Ollama+API  │
└─────────┘ └────────┘ └─────────────┘
```

**关键技术选型**：
- 脚手架：`windingwind/zotero-plugin-template` (TS + ESBuild + hot reload)
- Toolkit：`zotero-plugin-toolkit`
- 本地 embedding：默认 Ollama `bge-m3` (中英双语)；可选 OpenAI `text-embedding-3-small`
- 向量存储：复用 Zotero 的 SQLite，新建 `zotread_vectors` 表（`itemID`, `embedding BLOB`, `model`, `created`)
- LLM 调用：OpenAI-compatible API（Ollama / DeepSeek / OpenAI 都走同一协议）
- 无外部服务：全部本地运行，不上传用户数据

## 6. 数据模型

```typescript
interface PaperScore {
  itemID: number;
  relevance: number;   // 0-1
  novelty: number;     // 0-1
  recency: number;     // 0-1
  total: number;       // weighted sum, 0-5
  lastScoredAt: Date;
  userAction?: 'read' | 'skip' | 'archive';
}

interface UserPreference {
  positiveExamples: number[];   // 用户明确 read 的 itemIDs
  negativeExamples: number[];   // 用户 skip/archive 的 itemIDs
  activeKeywords: string[];     // 从近 30 天笔记抽取
  embeddingModel: string;
}
```

## 7. 里程碑

| 周 | 目标 |
|---|------|
| W1 | Fork 脚手架，hot reload 跑通，"Hello ZotRead" 出现在左侧树 |
| W2 | 接入 Ollama，批量把库内论文 embed 一遍，存进 SQLite |
| W3 | 评分引擎 v1（相关度 + 新颖度 + 时效性），Reading Queue 显示星级 |
| W4 | TL;DR 卡片 + 三按钮 + 行为回灌 |
| W5 | 内测 3-5 个博士生朋友 |
| W6 | 打包 .xpi，发 GitHub Release，提交中英文商店 |

目标：**30 天出可用 MVP**。

## 8. 成功指标

- 冷启动 2 周：50 GitHub stars，10 个用户装
- 3 个月：500 stars，中文商店上架，Zotero 官方清单收录
- 核心指标：**用户保留率**（装了一周后还在用的比例 > 40%）

## 9. 风险与开放问题

1. **冷启动评分不准**：库里无正样本时怎么办？
   → V1 用"近期添加但未读"作为弱负样本，"手动 star" 作为强正样本；引导用户用几分钟先 star 5 篇"代表作"
2. **非英文论文支持**：BGE-M3 中英双语 OK，其他语言？
   → V1 只承诺中/英，其他语言走 multilingual-e5 后备
3. **性能**：1000+ 论文 embedding 要多久？
   → BGE-M3 本地 CPU 约 0.5s/篇，1000 篇 ≈ 10 分钟首次建索引，后台跑
4. **LLM 依赖**：用户不装 Ollama 呢？
   → V1 必须有 fallback：纯 embedding 模式（相关度/新颖度仍可算），TL;DR 降级为 abstract 截断

## 10. 下一步

1. ✅ 确认产品定位（本文件）
2. ⏳ Fork `zotero-plugin-template` 起原型
3. ⏳ 2 周内跑通"embed 全库 + 评分 + 显示星级"的最小闭环
4. ⏳ 找 3 个博士生朋友做 alpha 测试

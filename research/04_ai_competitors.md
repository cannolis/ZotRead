# Zotero AI 插件生态竞品调研（本地 RAG + 中文方向）

调研日期：2026-04-23。数据源：GitHub 搜索、Zotero 中文社区、Zotero 论坛、Awesome Zotero、厂商主页。

## 一、Zotero 7/8 是否有官方 AI？

**答：没有，2026 年仍无官方 AI。** Zotero 官方团队公开表态聚焦于文献管理，拒绝内置 ChatPDF/RAG（Zotero 论坛帖 #121197）。Zotero 8 已发布，插件 API 更成熟。**第三方 AI 插件空间完全开放。**

## 二、主流 AI 插件对比

| 插件名 | 仓库 | Stars | 最新发布 | 后端 | 本地 | 中文 embed | 功能 | 商业模式 | 活跃度 |
|---|---|---|---|---|---|---|---|---|---|
| **PapersGPT**（原 zotero-chatpdf） | papersgpt/papersgpt-for-zotero | 2.3k | 2026-04 | GPT/Claude/Gemini/DeepSeek/Qwen/Ollama/MCP | ✅ 本地 embed+vector+rerank | ❌ 未专门优化 | Chat/摘要/综述/AutoPilot 批处理 | AGPL-3 + Freemium | 非常高 |
| **zotero-gpt** | MuiseDestiny/zotero-gpt | 7.1k | 2025-10 v2.2.3 | OpenAI 兼容 API | ⚠️仅通过兼容接口 | ❌ | 命令行式 Chat、注释问答 | 开源免费 | 中 |
| **Beaver** | jlegewie/beaver-zotero | 143 | 2026-04 v0.18 | OpenAI/Gemini/Claude/OpenRouter | ❌ 闭源后端 | ❌ | Agentic 搜索+阅读助手+240M 文献 | AGPL 前端+闭源后端 Freemium | 非常高 |
| **zotero-AI-Butler** | steven-jianhao-li/zotero-AI-Butler | — | 2026-04 | 主流大模型 API | ⚠️ | ✅ 中文 UI | 批量精读→Zotero 笔记 | 开源 | 高 |
| **llm-for-zotero** | yilewang/llm-for-zotero | — | 2026-04 | 多后端 | ⚠️ | — | Research agent 框架 | 开源 | 高（新） |
| **RAG Assistant for Zotero** | aahepburn/RAG-Assistant-for-Zotero | 102 | 2026-03 v0.4.5 | Ollama/LM Studio+云 | ✅ BGE/SPECTER/MiniLM | ❌ 仅英文 BGE | 混合检索+BM25+重排 | Apache-2，**Electron 独立应用** | 高 |
| **ZoteroOllama** | gchapron/ZoteroOllama | — | 2026-02 | Ollama | ✅ 纯本地 | ❌ | 单 PDF Chat | 开源 | 低 |
| **ZotExtract** | SamyAteia/ZotExtract | — | 2026-04 | 本地+云 | ✅ | ❌ | 结构化元数据抽取 | 开源 | 中 |
| **zotero-autotag** | bradykrien/zotero-autotag | — | 2026-02 | 本地 LLM+embed | ✅ | ❌ | 自动打标签 | 开源 | 低 |
| **zotero-mcp** | 54yyyu / cookjohn（两家） | — | 2026-04 | MCP 协议 | N/A | — | 把 Zotero 暴露给外部 AI | 开源 | 高 |
| **Aria** | lifan0127/ai-research-assistant | — | 2025-04 停滞 | GPT | ❌ | ❌ | 通用研究助手 | 开源 | ⚠️衰退 |
| **zotero-paper-agent** | windfollowingheart | — | 2026-04 | — | — | ✅中文 | Paper agent | 开源 | 中 |

相关但非 AI QA：PDFMathTranslate、zotero-pdf2zh、suppr-zotero-plugin、zotero-pdf-translate — 全部聚焦翻译。

## 三、已被占领的功能点

1. **单 PDF Chat/摘要** — PapersGPT、zotero-gpt、Beaver、Butler 四家覆盖
2. **多后端 API 桥接**（GPT/Claude/Gemini/DeepSeek）— 红海
3. **本地 Ollama + 英文 embedding**（BGE-en/SPECTER）— RAG Assistant、ZoteroOllama、PapersGPT 已做
4. **MCP 协议暴露** — 两个 zotero-mcp 占位
5. **中文 UI 套云端大模型** — AI Butler 占位
6. **PDF 翻译** — windingwind 垄断
7. **批量精读→笔记** — AI Butler 占位
8. **Agentic 跨库搜索** — Beaver（Harvard 背书+闭源后端壁垒）

## 四、共同短板（空白区）

1. **中文 embedding 专项** — 几乎没人用 BGE-zh / m3e / Qwen3-Embedding / Conan-embedding 作默认；现有 RAG 全是英文 BGE/SPECTER
2. **中文语义切分** — 英文按句号切，中文需按语义段落+学术术语切（0 家做）
3. **中文 reranker 本地化** — bge-reranker-v2-m3、Qwen reranker 集成空白
4. **中英双语混合检索** — 同库中英论文混查无原生方案
5. **"Zotero 原生插件形态 + 全库 RAG + 本地中文 embedding"三合一** — **0 个合格产品**。PapersGPT 有 RAG 但无中文优化；RAG Assistant 是 Electron 独立 app，不是 Zotero 插件，体验割裂；ZoteroOllama 无 RAG；Butler 无本地
6. **离线中文引文/事实核查** — 完全空白

## 五、判断：**该进**

**理由：**
- 中文学术用户基数大，但被"中文 UI 套英文 RAG"敷衍服务
- PapersGPT 已是准垄断（2.3k stars、Freemium），正面硬刚没戏
- Beaver 闭源后端+英文世界；与中文市场错位
- **"本地 RAG + 中文 embedding + Zotero 原生插件"精确交叉点目前 0 个合格产品**

**必做差异化（缺一不可）：**
1. **Zotero 原生插件形态**（非独立 Electron app），装完即用
2. **本地优先**：Ollama/LM Studio + BGE-zh/Qwen3-Embedding，零 API key 可用
3. **中文优化**：语义切分 + 中英混合检索 + 中文 reranker
4. **句级溯源**：每回答带 Zotero 条目级引用（借鉴 Beaver）

**不该做：** 再造一个 OpenAI Chat 框（饱和）；翻译（windingwind 垄断）；通用 Agent（Aria/Butler 占位）。

**窗口期：6–12 个月。** PapersGPT 一旦出中文 embedding 包或中文社区 fork，窗口即关。**建议立即启动 MVP**，首发聚焦"本地中文 RAG 问答 + 句级溯源 + Ollama 开箱"三件套。

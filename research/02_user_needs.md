# Zotero 用户需求与痛点调研

> 来源：Zotero 官方论坛（forums.zotero.org）、GitHub Issues、知乎、Obsidian 论坛、第三方博客（2023–2026）。
> 热度：**极高/高**＝多主题贴 + 插件 stars > 2k；**中**＝若干贴 + 明确受众；**低**＝细分场景。

## Top 15 未满足 / 半满足需求

### 1. 本地化 / 整库 RAG 的 AI 阅读助手 — 热度：**极高**（AI/LLM，检索增强）
"Summarise this article" 应是条目右键一等功能；论坛 `No plugin like chatpdf in zotero?` 与 `integrating AI into zotero to assist reading` 是长贴。PapersGPT/zotero-gpt/Beaver 抢滩但均要自带 key、无离线、中文嵌入差。
- https://forums.zotero.org/discussion/102320/
- https://forums.zotero.org/discussion/121197/no-plugin-like-chatpdf-in-zotero
- https://forums.zotero.org/discussion/126573/beaver-zotero-ai-plugin

### 2. PDF 双语对照翻译 + LLM 润色 — 热度：**极高**（PDF 阅读）
`zotero-pdf-translate` 10.7k stars；痛点是"整页双栏对照 + 学术口吻润色"（知乎反复推荐 ScholaRead 作为替代），原生插件做不到。
- https://github.com/windingwind/zotero-pdf-translate
- https://zhuanlan.zhihu.com/p/689468632

### 3. Notion / Obsidian 双向稳定同步 — 热度：**高**（外部同步）
Notero 升级后 sync 卡死、`TypeError: style.getCiteProc`；Better Notes→Obsidian 单向。用户要求双向 + 高亮级粒度 + 反向跳转。
- https://forums.zotero.org/discussion/125639/notero-plugin-unable-snyc-to-notion
- https://github.com/dvanoni/notero/issues/504
- https://forum.obsidian.md/t/zotero-plugin/111390

### 4. iPad / iOS 标注同步丢失 & 无自动化 API — 热度：**高**（移动端）
iPad 标注在 Mac 不显示、外部阅读器下丢失、comments 字段不显示；Shortcuts 集成无从下手。
- https://forums.zotero.org/discussion/95194/annotations-not-synced-from-ios-app
- https://forums.zotero.org/discussion/125406/ios-feature-request-integration-with-shortcuts

### 5. 批量 / 智能去重合并 — 热度：**高**（数据管理）
"can't merge all duplicates automatically"；Zoplicate、ZoteroDuplicatesMerger 补位但缺 diff 预览与字段智能补全。
- https://forums.zotero.org/discussion/40457/merge-all-duplicates
- https://chenglongma.com/zoplicate/

### 6. 本地引文网络 / Connected Papers 可视化 — 热度：**高**（数据可视化）
"Citation mapping / network map of Zotero library"、"Litmaps/Connected Papers add-ons" 反复被问，用户想要**离线**图谱。
- https://forums.zotero.org/discussion/78671/citation-mapping-network-map-of-zotero-library
- https://forums.zotero.org/discussion/96562/paper-digest-litmaps-connected-papers-feautures-integrations-add-ons

### 7. 中文文献元数据（知网/万方/CAJ）— 热度：**高（中文区）**（检索增强）
Jasminum 被列为"必装"却频繁因知网改版失效，社区盼更稳维护的继任者。
- https://zhuanlan.zhihu.com/p/508158465
- https://zotero-chinese.com/plugins/

### 8. Word / LibreOffice 写作侧边栏强化 — 热度：**高**（学术写作辅助）
近两年 feature request 密集："Go To Zotero"快捷键、可缩放常驻侧栏、搜索忽略 et al、按 DOI 搜索、读 LaTeX \cite{}。
- https://forums.zotero.org/discussion/130919/word-plugin-sticky-resizable-sidebar
- https://forums.zotero.org/discussion/125301/feature-request-add-a-go-to-zotero-shortcut-in-the-word-plugin
- https://forums.zotero.org/discussion/94507/

### 9. 文献综述 / 对比表一键生成 — 热度：**中-高**（笔记管理 + AI）
Better Notes 解决笔记，但"N 篇文献 → 综述草稿 / research gap 表"仍空白，AI×笔记交叉蓝海。
- https://github.com/windingwind/zotero-better-notes
- https://forums.zotero.org/discussion/120709/better-note-templates

### 10. 引用格式 / 期刊缩写修正 — 热度：**中**（引用格式）
APA 小错误、CrossRef 导入无 `Journal Abbr`、自定义 CSL 门槛高。
- https://forums.zotero.org/discussion/114947/some-mistakes-zotero-makes-in-apa
- https://forums.zotero.org/discussion/89740/journal-abbreviations

### 11. 团队协作 & 权限控制 — 热度：**中**（团队协作）
Group Library 与 My Library 不连通；无"只读/评论"角色，误删即丢；存储算创建者头上。实验室付费意愿明确。
- https://forums.zotero.org/discussion/85568/best-practice-for-group-collaboration
- https://forums.zotero.org/discussion/1404/collaboration-feature

### 12. 深色模式 / 高亮颜色自定义 — 热度：**中**（PDF 阅读）
Zotero 7 暗色下搜索高亮几乎不可见；用户要求自定义配色、对比度、色弱模式。
- https://github.com/zotero/zotero/issues/4949
- https://forums.zotero.org/discussion/118493/

### 13. 智能标签 / 未读队列 — 热度：**中**（数据管理）
"几百条未分类条目不知哪些没处理"；auto-tag 噪声大。机会：LLM 自动打标签 + 智能集合。
- https://forums.zotero.org/discussion/7168/how-do-people-organize-their-content
- https://forums.zotero.org/discussion/115437/tags-and-collections-best-practice

### 14. 条目一键跨库迁移 / 参考文献回灌 — 热度：**中**（数据管理）
"Fetching paper references on import" 希望导入即抓取 references 构建本地引文图。
- https://forums.zotero.org/discussion/77492/fetching-paper-references-on-import

### 15. 文献 TTS 朗读 — 热度：**中-低**（PDF 阅读）
ZoTTS + In-App Text to Speech 请求，通勤/视障用户群；易作为 AI 插件增值模块。
- https://forums.zotero.org/discussion/126017/feature-request-in-app-text-to-speech

## 按主题归类

| 主题 | 需求编号 | 综合热度 |
|---|---|---|
| AI/LLM 集成 | 1, 2, 9, 13 | 极高 |
| PDF 阅读体验 | 2, 12, 15 | 高 |
| 笔记管理 | 9 | 高 |
| 外部同步（Notion/Obsidian） | 3 | 高 |
| 团队协作 | 11 | 中 |
| 移动端 | 4 | 高 |
| 引用格式 | 8, 10 | 中-高 |
| 数据可视化/分析 | 6, 14 | 高 |
| 检索增强 | 1, 7 | 极高 |
| 学术写作辅助 | 8, 9 | 高 |

## 给开发者的机会排序

1. **本地 RAG + 隐私友好整库 AI 助手**（#1+#2+#9）——竞品全部在线 + 自备 key，本地化 + 中文嵌入是明确缺口。
2. **Notion/Obsidian 双向稳定同步器**（#3）——Notero 口碑下滑，替代窗口已开。
3. **Word 写作侧边栏强化包**（#8）——最靠近付费场景（投稿）。
4. **离线引文网络可视化**（#6）——Connected Papers 依赖网络，离线版留白。
5. **中文学术全家桶接班 Jasminum**（#7）——刚需、维护者稀缺、冷启动快。

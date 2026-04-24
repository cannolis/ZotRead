# Zotero 插件市场机会分析（决策版）

> 汇总自 `01_existing_plugins.md`（供给）、`02_user_needs.md`（需求）、`03_tech_stack.md`（可行性）
> 视角：给一位想做 Zotero 插件打入市场的开发者
> 编制日期：2026-04-23

---

## 一、市场结构速览

- **生态规模**：GitHub `topic:zotero-plugin` 仓库数百个，头部前 20 由 3 个维护者主导（windingwind、MuiseDestiny、中文基建圈 l0o0/northword/ChenglongMa/syt2）
- **用户体量**：Zotero 全球活跃用户 500 万+，中文区占相当比例（学生/科研人）。`zotero-pdf-translate` 10.7k stars、`zotero-better-notes` 7.7k stars、`zotero-gpt` 7.1k stars — 单个头部插件可渗透百万级用户
- **关键拐点**：**Zotero 7（2024 年 8 月）强制迁移到 bootstrap + WebExtension-like manifest**，大量老插件（ZotFile、Zutilo、MDNotes、QuickLook、Zotodo 等）死亡但功能未被完全替代 — 这是**过去 18 个月最大的单次洗牌**，红利窗口还没关闭
- **技术门槛**：**中低**。TypeScript + bootstrap.js 即可起步，`zotero-plugin-template` 提供 hot reload + 类型定义 + 发布流水线；**无沙箱**（能访问文件系统、XPCOM、任意 HTTP）— 比 VSCode/Chrome 扩展自由很多
- **分发短板**：**没有集中市场**，靠 GitHub Release + 官方清单 PR + 中文区 `syt2/zotero-addons` 应用内商店；意味着"冷启动靠内容营销 + KOL"，不像 VSCode 一上架就有流量

## 二、五大机会矩阵

评分 1-5，综合分 = 需求 × 0.3 + 空白 × 0.25 + 技术可行性 × 0.15 + 差异化 × 0.15 + 变现 × 0.15

| # | 方向 | 需求热度 | 供给空白 | 技术可行 | 差异化 | 变现 | 综合 | 核心论据 |
|---|------|---------|---------|---------|--------|------|------|----------|
| A | **本地 RAG + 中文嵌入的整库 AI 助手** | 5 | 4 | 3 | 5 | 4 | **4.25** | 竞品（zotero-gpt、PapersGPT、Beaver）全在线 + 自带 key + 中文嵌入差；Ollama/DeepSeek 热潮，隐私敏感用户愿付费 |
| B | **ZotFile "Send-to-Tablet" 继任者（Kindle/Boox/reMarkable + 标注回灌）** | 4 | 5 | 4 | 4 | 4 | **4.20** | ZotFile 已死 2 年，Attanger/ZotMoov 只解决重命名；电子墨水屏 + Zotero 是明确细分刚需，无人覆盖 |
| C | **Notion / Obsidian 双向稳定同步器** | 5 | 3 | 3 | 3 | 5 | **3.80** | Notero 升级后 sync 卡死、issue 堆积，用户寻替代；PKM 圈付费意愿高，但技术债深（字段映射、冲突解决） |
| D | **Word 写作侧边栏强化包（投稿场景）** | 4 | 4 | 3 | 3 | 5 | **3.75** | 论坛近两年 FR 密集；最贴近付费场景（投稿/毕业论文）；Better BibTeX 之外无人专攻写作体验 |
| E | **离线引文网络 / Connected Papers 平替** | 4 | 5 | 2 | 5 | 3 | **3.70** | Connected Papers/Litmaps 依赖在线 + 要订阅；离线 + 本地图谱需求被反复 +1，但图形与算法工作量大 |
| F | **中文学术全家桶（Jasminum 2.0）** | 4 | 3 | 4 | 2 | 2 | **3.10** | 刚需稳定，但 Jasminum 还活着，差异化较弱；适合作为"进入中文圈建立口碑"的副线 |

## 三、重点推荐：A 与 B

### 推荐 A — 本地 RAG + 中文 AI 助手（高天花板）

**做什么**：
1. 整库向量化（BGE-M3 / `gte-large-zh` 中文优先，本地 embedding）
2. 默认后端 **Ollama / LM Studio / vLLM**（零配置），可选 OpenAI-compatible
3. 三大能力：整库语义搜、单篇 QA、选中段落"追问/翻译/润色"
4. "研究综述/gap 表"一键生成（勾 N 篇 → 输出结构化对比表 → 写进 Better Notes）

**为什么能赢**：
- zotero-gpt/PapersGPT 都要 OpenAI key，中文 embedding 弱
- 中国用户对数据出境敏感，离线 = 合规卖点
- LLM 生态红利最大，占位早一年受益

**风险**：
- 本地模型性能差异大，UX 要做好降级
- 向量库选型（LanceDB / sqlite-vec 嵌入 Zotero profile）需实验

---

### 推荐 B — Tablet Bridge（低天花板高确定性）

**做什么**：
1. 条目 → 推送到墨水屏（Kindle "Send to Kindle" API / Boox Push / reMarkable Connect / KOReader）
2. 平板阅读后 **标注回灌** 到 Zotero PDF annotations（自建或复用 KOReader metadata.lua）
3. 附件重命名 + 移动（吃掉 Attanger 一部分）

**为什么能赢**：
- ZotFile 留下的空白，论坛/Reddit 反复被提
- 目标用户明确（电子墨水屏用户 = 愿意花钱的学术用户）
- 技术工作量中等，不需要 AI 基建
- 可做 Pro 版（Kindle/Boox 云端对接收费）

**风险**：
- 各家平板 API 不统一，需要逐个适配
- Kindle 生态最封闭，可能只能走 email push

## 四、冷启动与分发策略

既然没有集中市场，**内容先于产品**：

1. **开发期**：fork `zotero-plugin-template`，hot reload + Actions 流水线一天搞定
2. **曝光渠道优先级**：
   - 知乎长文（Zotero 话题下阅读量 10 万级）+ B 站教程
   - Reddit r/zotero（英文区，8 万订阅）
   - 中文区提交到 `syt2/zotero-addons` 商店 + `zotero-chinese/zotero-plugins` 清单
   - 官方 `zotero.org/support/plugins` PR
   - windingwind 维护的 "Awesome Zotero" / 插件模板 README
3. **建议双语维护**：README 中英双语，Issue 模板中英双语 — 中文圈贡献 stars，英文圈贡献 PR
4. **License + 商业模式**：核心开源（MIT/AGPL），云端/Pro 功能闭源订阅（Notion-sync 的 Pro plan、AI 的云模型转发等参考）

## 五、下一步行动建议

1. **本周**：在 A 和 B 之间二选一（建议先做 B —— 工作量可控、1 个月出 MVP、容易拿第一批种子用户；A 留作第二枪）
2. **搭建原型**：fork `zotero-plugin-template` + `zotero-plugin-toolkit`，跑通 hot reload
3. **验证需求**：在 Zotero forums 开 "Work-in-progress: [方向]" 贴收集 +1 和使用场景，同时在 r/zotero 和知乎发调研贴
4. **写 MVP Spec**：只做一个闭环场景（例如 B 的"Boox Push + KOReader 回灌"单链路），不要 scope creep
5. **2-3 个月目标**：官方插件目录收录 + 中文商店上架 + 500 stars

## 六、关键参考源

- Zotero 官方插件清单：https://www.zotero.org/support/plugins
- Zotero 7 开发者指南：https://www.zotero.org/support/dev/zotero_7_for_developers
- 插件脚手架：https://github.com/windingwind/zotero-plugin-template
- Toolkit：https://github.com/windingwind/zotero-plugin-toolkit
- 中文插件商店：https://github.com/syt2/zotero-addons
- Awesome Zotero：https://github.com/MohamedElashri/awesome-zotero
- 中文导航：https://zotero-chinese.com/plugins/

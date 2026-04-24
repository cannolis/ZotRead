# Zotero 7 插件开发：技术栈与门槛现状

## 1. Zotero 7 官方开发要点

Zotero 7 放弃旧 XUL overlay，改为 **bootstrapped plugin**，结构极简：

- **`manifest.json`**（`manifest_version: 2`，含 `applications.zotero` 声明 id 与 `strict_min_version`）
- **`bootstrap.js`**：实现 `startup/shutdown/install/uninstall` 与 `onMainWindowLoad/Unload`；主窗口可多次开关，必须在卸载钩子清掉所有注入防泄漏
- **首选项**：从 `defaults/preferences/` 迁到根目录 `prefs.js`
- **本地化**：DTD/properties → **Fluent (.ftl)**
- **新官方注册 API**（替代 monkey-patch）：`ItemTreeManager.registerColumn`、`ItemPaneManager.registerSection`、`Reader.registerEventListener`

## 2. 主流脚手架

**`windingwind/zotero-plugin-template`**
- TypeScript + ESBuild（via `zotero-plugin-scaffold`）
- 内置 **hot reload**、GitHub Actions 发布流水线、`zotero-types` 全量类型
- 流程：fork → 改 `package.json` → 配 `.env` 指向本地 Zotero → `npm start`

**`windingwind/zotero-plugin-toolkit`**（npm, MIT, TS，兼容 Z6/7/8）
- 模块：`BasicTool`、`UITool`、`ReaderTool`、`MenuManager`、`KeyboardManager`、`PromptManager`、`DialogHelper`、`ProgressWindowHelper`、`PatchHelper`、`FieldHookManager`、`ExtraFieldTool`、`LargePrefHelper`、`VirtualizedTableHelper`

## 3. 从 bootstrap → Zotero 7 迁移成本

已是 bootstrap 架构的插件**成本低**：补 `onMainWindowLoad` 钩子、换 Fluent、prefs 挪根目录、用 `*Manager.register*` 替换手工 patch。旧 XUL overlay 插件则基本等于重写。

## 4. 能力边界（关键优势）

**几乎无沙箱**。官方原话："We have no plans to make similar restrictions in Zotero"（对比 Firefox WebExtensions）。插件可：

- 直接访问 XPCOM、文件系统、Zotero DB 与内部对象
- 读写 PDF annotations（`Zotero.Annotations` + ReaderTool）
- 任意调用外部 HTTP API（`Zotero.HTTP.request`，无 CORS 限制）
- 自由注入主窗口/条目面板/Reader/右键菜单/快捷键 UI

## 5. 分发渠道

**无集中式 marketplace**（不像 VSCode/Chrome）。实际链路：

- 开发者发 GitHub Release（`.xpi` 资产）
- 用户拖 `.xpi` 进 Tools → Plugins
- 可选：PR 提交到官方社区清单 [zotero.org/support/plugins](https://www.zotero.org/support/plugins)（非审核市场）
- 社区导航 `zotero-chinese/zotero-plugins` 汇总中文插件

## 6. 推荐 fork 起点（代码简洁）

1. **windingwind/zotero-plugin-template** — 事实标准，含全套示例
2. **windingwind/zotero-format-metadata** (Linter) — 中等规模，结构清晰
3. **MuiseDestiny/zotero-style** — UI 定制 / DOM 注入范例
4. **northword/zotero-auto-backup** — 轻量单功能，适合学架构
5. **l0o0/jasminum** — 中文元数据抓取，HTTP + DOM 解析套路

## 结论

门槛：**中低**。会 TS + 基础 DOM 即可起步；无沙箱=能力上限很高；hot reload + toolkit 大幅降低体力活；唯一痛点是分发靠自传播（无统一商店）。

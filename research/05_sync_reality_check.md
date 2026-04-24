# 05. Sync Reality Check — ZotFile 继任者 / Tablet Bridge 真的还有价值吗？

**Date**: 2026-04-23
**Hypothesis**: "Zotero 同步已经够好了，Tablet Bridge 是伪需求。"
**Verdict**: **Go（细分场景）** — 官方覆盖了 iPad + 部分 Boox，但墨水屏 / reMarkable / Kindle / KOReader 仍是系统性空白。

---

## 1. Zotero 官方云同步（zotero.org storage）

- **现状**：300 MB 免费，$20/年 2GB，$60/年 6GB，$120/年无限。
- **高频吐槽（2023–2026 持续）**：
  - 300 MB 对活跃研究者 3–6 个月就爆（UW / Harvard / Bates libguide 都把"如何绕过 300MB"写进官方指南）。
  - 国内访问 zotero.org 存储链路慢，坚果云 WebDAV 已成事实标准。
- **结论**：够用但不便宜；WebDAV 生态已补齐，这一层**不需要**新插件。

## 2. 官方移动端（Zotero iOS / Android）

- **iOS**：Zotero 7 后 PDF reader + annotation 同步基本可用，**但**：
  - Annotation 存数据库、不写回 PDF → 导出到 GoodNotes / PDF Expert 仍需手动 export。
  - 官方论坛 2024–2025 仍有"iPad 标注没同步回桌面"的报修帖（discussion/95194、88843、104757）。
- **Android**：2024 年底才 GA，**不支持 linked files** → Attanger/ZotMoov 的外挂文件在 Android 上直接不可见，用户被迫二选一。
- **结论**：iPad 用户官方够用；Android + 外挂存储用户被落下。

## 3. 平板 / 墨水屏桥接（ZotFile 原场景）

跟前两者**完全不同的场景**：用户要在 **Boox / reMarkable / Kindle Scribe / Supernote / KOReader** 上读写标注。

| 设备 | 现状 | 空白 |
|---|---|---|
| **Boox** | 系统内置 Zotero 账号登录（2024 起）| 同步不自动、drawing 不回传、Zotero 自动下载的 PDF 访问不了（forums discussion/117191 确认） |
| **reMarkable** | 闭源，仅社区 `michaelmior/zotero-remarkable` + ZotMoov + rmapi hack | 无官方支持，Zotero 7 插件生态没有稳定维护者 |
| **Kindle Scribe** | 完全无 | 零方案 |
| **KOReader**（Kobo/Kindle/Boox/PB 通用）| `stelzch/zotero.koplugin` 存在但**原作者不活跃**、annotation 回传是 open issue #26 | 双向同步无人做 |
| **Supernote** | 只能 WebDAV + 手动 | 零集成 |

**ZotMoov 的 "Send to Tablet"**（2024-12 新增）只解决"把 PDF 拷到一个文件夹"，**标注回传靠用户自己拼 Syncthing**。Attanger 连 Send-to-Tablet 都没有。

## 4. 市场规模估算

- reMarkable 累计 ~250 万台，Boox 年出货 ~100 万，Kindle Scribe 是 Amazon 主推品类。
- 交集："学术用户 × 墨水屏"保守估 30–80 万活跃用户。
- 当前全是 **DIY + Syncthing + 半废插件**；reMarkable 用户本身已习惯付订阅，付费意愿高。

---

## Go / No-Go 建议

**GO — 但聚焦"电子墨水屏 + 双向标注"细分，放弃泛化 Tablet Bridge。**

- **放弃**：iPad / Android 通用 send-to-tablet（ZotMoov 已做到 80%，官方 mobile 吞噬剩余）。
- **聚焦**：
  1. **KOReader ↔ Zotero 双向标注同步**——接管 `stelzch/zotero.koplugin`，补齐 annotation 回传；开源护城河，Kindle/Kobo/Boox/PocketBook 一把抓。
  2. **reMarkable bridge v2**（rmapi + 标注 OCR 回写 Zotero annotation DB）——付费意愿最高人群。
  3. Boox 作为 bonus：用官方 sync 兜底，只补"drawing 回传 + 自动下载的 PDF 访问"两个官方缺口。
- **不做**：Kindle Scribe（Amazon 封闭，ROI 差）、iPad（官方 + ZotMoov 已覆盖）。

**一句话**：同步不是问题，**双向标注在墨水屏**才是问题。ZotFile 继任者的价值不在"传文件"，在"传回标注"。

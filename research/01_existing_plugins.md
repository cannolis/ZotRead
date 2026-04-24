# Zotero Plugin Ecosystem — Market Map

Compiled 2026-04-23. Sources: official plugins directory, GitHub `topic:zotero-plugin` (sorted by stars), awesome-zotero, Zotero forums, Chinese-community references.

## TL;DR

Ecosystem is concentrated around three maintainer hubs:

1. **windingwind** — PDF-Translate, Better Notes, Actions & Tags, plugin template. De-facto Zotero 7 infra, TypeScript-first.
2. **MuiseDestiny** — GPT, Style, Reference, Citation, Attanger. Most visible Chinese-community maintainer internationally.
3. **l0o0 / northword / ChenglongMa / syt2** — Chinese metadata (Jasminum), metadata linting, dedup, and the in-app plugin marketplace.

Zotero 7 (Aug 2024) forced migration from `install.rdf` + overlay/bootstrap to `manifest.json` + `bootstrap.js`. Plugins not updated by mid-2024 are effectively dead. Biggest casualties: **ZotFile** (last release 2022, replaced by Attanger / ZotMoov), **Zutilo** (auto-disabled), **Zotero QuickLook**, **MDNotes** (stale; displaced by Better Notes + MarkDB-Connect), **ZoteroPreview**, **OPDS Server**, **Qnotero**, **Scite / Zotodo** (stale).

Chinese community ("茉莉花" Jasminum, "青柠" zotero-style/citation, Awesome GPT) is most active in: CNKI/Chinese-source metadata, LLM integration, UI theming, Word-citation polish for Chinese theses, and Attanger-style attachment flows. It produces roughly half of the top-20 plugins by stars.

## Top Plugins (merged ranking)

| Plugin | Repo / Source | Stars / Activity | Category | One-liner | Maintenance | Z7 |
|---|---|---|---|---|---|---|
| Zotero PDF Translate | windingwind/zotero-pdf-translate | 10.7k, 2026-04 | Translate | In-reader translate of PDFs / notes / metadata, 20+ engines | Active | Yes |
| Better Notes | windingwind/zotero-better-notes | 7.7k, 2026-04 | Notes/PKM | Full note workflow: templates, export, bi-directional links | Active | Yes |
| Zotero GPT | MuiseDestiny/zotero-gpt | 7.1k, 2026-04 | AI | Chat / command-bar LLM over your library | Active | Yes |
| Jasminum (茉莉花) | l0o0/jasminum | 6.9k, 2026-04 | Data import (CN) | CNKI / Chinese-source metadata, PDF renaming | Active | Yes |
| Zotero Style (青柠) | MuiseDestiny/zotero-style | 5.0k, 2026-04 | UI/Theme | "Ethereal" reading-progress + column UI overhaul | Active | Yes |
| Notero | dvanoni/notero | 3.1k, 2026-04 | Sync | Push items + notes to Notion databases | Active | Yes |
| Zotero Reference | MuiseDestiny/zotero-reference | 2.7k, 2026-03 | PDF reading | Resolves and displays a PDF's reference list in-pane | Active | Yes |
| Actions & Tags | windingwind/zotero-actions-tags | 2.6k, 2026-04 | Automation | Scriptable rules over items/tags | Active | Yes |
| Zotero Add-ons (marketplace) | syt2/zotero-addons | 1.5k, 2026-04 | Infra | In-app plugin browser / installer | Active | Yes |
| Suppr Translate | WildDataX/suppr-zotero-plugin | 1.5k, 2026-04 | Translate | Alt PDF / document translation | Active | Yes |
| MDNotes | argenos/zotero-mdnotes | 1.4k, 2024-10 | Notes/Export | Export items + notes as Markdown | Stalled | Partial |
| ZotMoov | wileyyugioh/zotmoov | 1.3k, 2026-04 | File mgmt | Auto-move + link attachments (ZotFile successor) | Active | Yes |
| Zotero PDF Preview | windingwind/zotero-pdf-preview | 1.3k, 2024-01 | UI | Preview pane for PDFs (partly in Z7 core now) | Stalled | Partial |
| Zotero Citation (青柠) | MuiseDestiny/zotero-citation | 1.2k, 2025-09 | Citation | Inline Word citation numbering + link-back | Active | Yes |
| Zotero AI Butler | steven-jianhao-li/zotero-AI-Butler | 1.1k, 2026-04 | AI | LLM summaries + note generation | Active | Yes |
| Citation Counts Manager | eschnett/zotero-citationcounts | 926, 2023-11 | Metadata | Pull citation counts from Crossref/ADS/SemanticScholar | Stalled | Yes (forks) |
| Obsidian Zotlit | PKM-er/obsidian-zotlit | 923, 2026-04 | Sync | Obsidian-side Zotero integration | Active | Yes |
| Format Metadata | northword/zotero-format-metadata | 902, 2026-04 | Linting | Normalize/lint fields (title case, DOI, CN punctuation) | Active | Yes |
| LLM for Zotero | yilewang/llm-for-zotero | 876, 2026-04 | AI | Agentic research over your library | Active | Yes |
| Zoplicate | ChenglongMa/zoplicate | 862, 2026-04 | Data hygiene | Detect + merge duplicate items | Active | Yes |
| Better BibTeX | retorquere/zotero-better-bibtex | Flagship, active | Citation/LaTeX | Stable citekeys, auto-export .bib, LaTeX integration | Active | Yes |
| Attanger | MuiseDestiny/zotero-attanger | Active | File mgmt | ZotFile successor: rename, move, link attachments | Active | Yes |
| Chartero | volatile-static/Chartero | Active | Analytics | Reading-time + library visualizations | Active | Yes |
| arXiv Workflow | AllanChain/zotero-arxiv-workflow | Active | Data import | Pull arXiv versions, update metadata | Active | Yes |
| DOI Manager | bwiernik/zotero-shortdoi | Slow | Metadata | DOI lookup + short-DOI (Z7.1 manifest issue open) | Stalled-ish | Partial |
| Scite | scitedotai/scite-zotero-plugin | Low | Metadata | Supporting/disputing citation signals | Stalled | Unclear |
| PubPeer | PubPeerFoundation/pubpeer_zotero_plugin | Low | Metadata | PubPeer comment overlay | Semi-active | Yes |
| MarkDB-Connect | daeh/zotero-markdb-connect | Active | Notes | Link items to external Markdown (Obsidian/Logseq) | Active | Yes |
| Folder Import | retorquere/zotero-folder-import | Active | Data import | Import a folder tree as collections + attachments | Active | Yes |
| Storage Scanner | retorquere/zotero-storage-scanner | Active | Data hygiene | Flag missing / duplicate attachments | Active | Yes |
| Open-PDF | retorquere/zotero-open-pdf | Active | PDF | Open PDFs in external readers | Active | Yes |
| Report Customizer | retorquere/zotero-report-customizer | Active | Reports | Custom fields + layout in Zotero Reports | Active | Yes |
| ZotFile | jlegewie/zotfile | ~2022 frozen | File mgmt | Legacy rename/move/tablet-sync — **dead on Z7** | Abandoned | No |
| Zutilo | wshanks/Zutilo | Stalled | UI/Utilities | Extra menus + shortcuts — **auto-disabled on Z7** | Abandoned | No |
| Zotero QuickLook | mronkko/ZoteroQuickLook | Stalled | UI | macOS QuickLook preview — **dead** | Abandoned | No |

## Z7 gaps (dead, not fully replaced)

- **ZotFile "Send to Tablet"** — rename + linked-move covered by Attanger/ZotMoov, but ebook-push + annotation-pullback has no first-class Z7 successor.
- **Zutilo macros** — Actions & Tags covers rule-based automation; per-menu shortcuts + batch-edit dialogs only partially replaced.
- **Qnotero / OPDS** — no modern launcher-style or OPDS-server plugin on Z7.
- **External-signals aggregator** (Scite + PubPeer + citation counts + altmetric) — fragmented and half-maintained.
- **Task-manager bridge** (Todoist/Things/Reminders) — Zotodo stale, nothing current.
- **Calibre / e-reader bridge** — no active Z7 plugin.

## Chinese-community hot directions

1. Chinese metadata fixing: Jasminum (CNKI), northword/format-metadata, Attanger renaming rules.
2. AI / LLM: Zotero GPT, AI Butler, llm-for-zotero, plus forks wrapping Ollama / DeepSeek / Qwen.
3. UI theming + reading progress: zotero-style (青柠), Chartero.
4. Word citation polish: zotero-citation — numbered inline cites + click-through, popular in Chinese theses.
5. Marketplace: syt2/zotero-addons — de-facto plugin store for Chinese users.

## Build-target suggestions

- ZotFile "Send-to-Tablet" reborn on Z7 (Kindle/Boox/reMarkable + annotation pull-back).
- Unified external-signals pane (citations + retractions + PubPeer + altmetric).
- Task-manager bridge (Todoist / Things / Reminders / Notion-tasks).
- Local-LLM-first assistant (Ollama default, no API key).
- Calibre / ebook-library bridge for Z7.

## Sources

- [Zotero Plugins Directory](https://www.zotero.org/support/plugins)
- [GitHub topic: zotero-plugin](https://github.com/topics/zotero-plugin)
- [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Awesome Zotero (MohamedElashri)](https://github.com/MohamedElashri/awesome-zotero)
- [ZotFile alternatives for Zotero 7](https://citationstyler.com/en/knowledge/zotfile-alternatives-for-zotero-7-these-add-ons-replace-the-popular-tool/)
- [Zotero Forums — Zotero 7 Plugins thread](https://forums.zotero.org/discussion/105151/zotero-7-plugins)
- [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)

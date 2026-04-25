# ZotRead

> Triage your Zotero reading queue. Decide which paper to read next — based on
> what you've already published or a research idea you're exploring.
>
> 帮你分流 Zotero 里堆积的未读论文 —— 下一篇该读哪本，跟你发过的论文或一个研究想法对比。

[![Zotero 7](https://img.shields.io/badge/Zotero-7/9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
![status](https://img.shields.io/badge/status-alpha-orange?style=flat-square)
![license](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)

📖 **[User Guide](docs/USER_GUIDE.md)** · **[用户指南（中文）](docs/USER_GUIDE.zh-CN.md)** · [Changelog](CHANGELOG.md)

## Why

Your Zotero library has hundreds of PDFs, you've read a fraction of them, and
every time you open Zotero you stare at the list not knowing where to start.
Existing AI plugins assume you've already picked a paper and offer to "chat
with the PDF" — but the hard question is upstream: **which paper deserves
your next hour of reading?**

ZotRead answers that by ranking every unread paper against either:

- **Your own published papers** (marked as anchors), or
- **A research idea** you're currently exploring (free text).

## How it works

1. **Summarise once.** On import, each paper gets a structured LLM summary
   (one-line, problem, method, finding, domain, key terms). Cached locally.
2. **Score pairwise.** Each candidate is compared against every active anchor
   on a fixed 0.0-1.0 rubric — 0.7 "same problem, different method", 0.5
   "shared theory, different application", etc. Results cached in SQLite.
3. **Aggregate.** A paper's displayed score is the top-3 mean of its
   per-anchor similarities. Shown in a dedicated **相关度 / Relevance**
   column, click the header to sort.
4. **Explain.** The **WhyRead** item-pane section shows the verdict bucket
   ("🔥 highly relevant · must read"), the closest anchor, and the model's
   one-line reasoning plus a per-paper breakdown.

Every pairwise score is memoised: changing anchors, flipping read status,
importing new papers, or switching between "papers" and "idea" modes re-uses
the cache. Cost is paid once; subsequent ranking is free.

## Features

- **Item-tree columns** — "相关度 / Relevance" + "状态 / Status" with
  two-level sort
- **WhyRead pane** — language-aware (EN / ZH / auto-follow Zotero)
- **Right-click menu** — mark/unmark "my paper", set read / reading / unread
- **Multiple ideas** — save several research ideas, switch which one is
  active for ranking
- **Automatic scoring on import** — new items get summarised + compared in
  the background
- **arXiv import** — with retry + throttle for rate limits
- **Zero manual rescoring** — when the scoring rubric is upgraded, the
  plugin clears stale scores and recomputes in the background

## Requirements

- Zotero 7 or newer (Linux / macOS / Windows)
- An OpenAI-compatible LLM endpoint. Tested against **OpenRouter** with
  `openai/gpt-4o-mini` (≈ $0.02 to rank a 30-paper library from scratch;
  subsequent re-ranks hit cache, cost $0). Any provider exposing
  `/v1/chat/completions` works — change the base URL in settings.

## Install

- Build from source (`npm install && npm run build`) and drag the generated
  `.xpi` from `.scaffold/build/` into Zotero's plugin window, or
- Drop a proxy file `{profile}/extensions/zotread@zotread.app` containing
  the absolute path to the built plugin directory.

## Settings

Open **Edit → Settings → ZotRead**:

- **API base URL** — default `https://openrouter.ai/api/v1`
- **API key** — your LLM provider's key
- **Model** — default `openai/gpt-4o-mini`
- **WhyRead language** — Auto / English / 中文 (defaults to Zotero's locale)
- **Rank by** — "My papers" or "Idea text"
- **Active idea** — pick, add, edit, delete stored ideas
- **Maintenance** — "Rescore all now" / "Clear cached scores"

## Built with

- [`zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template)
- [`zotero-plugin-toolkit`](https://github.com/windingwind/zotero-plugin-toolkit)
- [`zotero-plugin-scaffold`](https://github.com/northword/zotero-plugin-scaffold)

## License

AGPL-3.0-or-later.

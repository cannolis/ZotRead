# ZotRead

> Triage your Zotero reading queue. Decide which paper to read next — based on
> what you've already published or a research idea you're exploring.
>
> 帮你分流 Zotero 里堆积的未读论文 —— 下一篇该读哪本，跟你发过的论文或一个研究想法对比。

[![Zotero 7](https://img.shields.io/badge/Zotero-7/9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
![status](https://img.shields.io/badge/status-alpha-orange?style=flat-square)
![license](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)

📖 **[User Guide](docs/USER_GUIDE.md)** · **[用户指南（中文）](docs/USER_GUIDE.zh-CN.md)** · [Changelog](CHANGELOG.md)

## What it does

ZotRead scores papers in your Zotero library by relevance to your own
published work or to a research-idea text, using any OpenAI-compatible LLM.

## Features

- **Two anchor modes** — mark your own papers as anchors, or write a
  research-idea text and rank against it
- **Sortable Relevance column** in the main item list
- **WhyRead sidebar pane** showing the rationale, referencing concrete
  methods and findings from both papers
- **Auto-maintained "ZotRead Top" collection** containing the highest-scoring
  papers
- **Bring your own model** — DeepSeek (default), OpenAI, OpenRouter, local
  Ollama, or any OpenAI-compatible endpoint
- **Local SQLite cache** — re-evaluation is nearly free; English and Chinese
  rationales cached independently
- **Cost-aware** — explicit scope selection, preview dialog showing the
  number of API calls, cancellable mid-run
- **Manual score override** with the original LLM rationale preserved

## Requirements

- Zotero 7 or newer (Linux / macOS / Windows)
- An OpenAI-compatible LLM endpoint. Default: **DeepSeek**
  (`https://api.deepseek.com`, model `deepseek-v4-flash`). Any provider
  exposing `/chat/completions` works — change the base URL and model in
  settings.

## Install

- Build from source (`npm install && npm run build`) and drag the generated
  `.xpi` from `.scaffold/build/` into Zotero's plugin window, or
- Drop a proxy file `{profile}/extensions/zotread@zotero.org` containing the
  absolute path to the built plugin directory.

## Settings

Open **Edit → Settings → ZotRead**:

- **API base URL** — default `https://api.deepseek.com`
- **API key** — your LLM provider's key
- **Model** — default `deepseek-v4-flash`
- **Sidebar language** — Auto / English / 中文 (defaults to Zotero's locale)
- **Ranking scope** *(required)* — pick a collection or "My library" before
  rescoring; nothing runs until you choose
- **Rank by** — "My papers" or "Research idea"
- **Active research idea** — add, edit, delete, switch
- **Recommended reading list** — auto-maintain a top-N collection after each
  rescore
- **Maintenance** — Rescore all now / Clear cached scores (with confirmation)

## Built with

- [`zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template)
- [`zotero-plugin-toolkit`](https://github.com/windingwind/zotero-plugin-toolkit)
- [`zotero-plugin-scaffold`](https://github.com/northword/zotero-plugin-scaffold)

## License

AGPL-3.0-or-later.

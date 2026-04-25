# Changelog

All notable changes to ZotRead are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-04-25

First public release.

### Added

- **Pairwise similarity scoring** via OpenAI-compatible LLM (OpenRouter
  default), cached in Zotero's SQLite database.
- **Two ranking modes**: paper anchors (your published papers) and idea
  text (free-text research direction).
- **Multiple saved ideas** with picker, edit, delete; switch active
  idea instantly with no extra LLM calls.
- **Item-tree columns** — *相关度 / Relevance* (numeric, sortable) and
  *状态 / Status* (your read/anchor state).
- **WhyRead pane** in the item view — verdict bucket, closest anchor,
  similarity, model rationale, per-paper breakdown.
- **Bilingual UI** — auto-follow Zotero's locale or pick English / 中文
  explicitly.
- **Right-click menu** for anchor toggle and read status.
- **Auto-score on import** — new items get summarised and scored in the
  background via Zotero's notifier.
- **arXiv import** with retry + throttle for 429s.
- **Discrete rubric scoring** — fixed 11-bucket 0.0-1.0 scale, the LLM
  is instructed to snap to these values for cross-paper consistency.
- **Determinism** — `temperature = 0` and `seed = 42` on every LLM call.
- **Automatic cache migration** — bumping the scoring rubric drops
  stale rows and recomputes in the background; users see only a
  progress toast.
- **Maintenance UI** — "Rescore all now" and "Clear cached scores"
  buttons in settings.
- **Error toasts** for missing API key and LLM failures (de-duplicated
  to avoid spam during batch failures).

### Notes

- Backend tested against `openai/gpt-4o-mini` via OpenRouter; any
  endpoint speaking the OpenAI `/v1/chat/completions` shape works.
- Tested on Zotero 7 and the development branch reporting itself as
  Zotero 9 (Firefox 140 ESR base).
- License: AGPL-3.0-or-later.

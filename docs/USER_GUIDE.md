# ZotRead — User Guide

> Triage your Zotero reading queue by ranking every paper against your own
> published work or a research idea you're developing.

_This guide covers installation, first-run setup, day-to-day workflows, and
advanced features. For a quick overview, see the [README](../README.md)._

---

## 1. Install

You need Zotero 7 or newer.

### Option A — Drag-and-drop (most users)

1. Download `zot-read.xpi` from the
   [latest release](https://github.com/cannolis/zotread/releases/latest).
2. In Zotero, open **Tools → Plugins**.
3. Drag the `.xpi` file into the Plugins window. Click **Install**.
4. Restart Zotero.

### Option B — Build from source

```bash
git clone https://github.com/cannolis/zotread.git
cd zotread
npm install
npm run build
# Artifact: .scaffold/build/zot-read.xpi
```

Then follow Option A with the locally built file.

---

## 2. First-run setup

### 2.1 Configure the LLM endpoint

ZotRead needs to call an LLM. It speaks the standard OpenAI API format, so
any provider that exposes `/v1/chat/completions` works.

1. Open **Edit → Settings → ZotRead**.
2. Paste your API key in **API key**.
3. Leave **API base URL** and **Model** at their defaults
   (`https://openrouter.ai/api/v1` + `openai/gpt-4o-mini`) for the cheapest
   working setup, or change them:
   - **OpenAI direct** — `https://api.openai.com/v1` + `gpt-4o-mini`
   - **Anthropic via OpenRouter** — `https://openrouter.ai/api/v1` +
     `anthropic/claude-3.5-haiku`
   - **Local Ollama** — `http://localhost:11434/v1` + any chat model you've
     pulled

![Settings pane — LLM](screenshots/settings-llm.png)

> **Cost note.** With the default `gpt-4o-mini`, scoring a fresh 30-paper
> library costs roughly $0.02. Every subsequent re-rank, mode switch, and
> anchor toggle is free because ZotRead caches every pair of scores in your
> Zotero SQLite database.

### 2.2 Pick your ranking mode

Also in the ZotRead settings, choose **Rank by**:

- **My papers (anchors)** — use the papers you've marked as "my paper" as
  reference points. Best for staying on your established research line.
- **Idea text** — use a free-text description of a new idea you're
  exploring. Best for discovering related work for a new direction.

You can switch between modes anytime. No recomputation — the cache is
per-pair, and each mode uses a different subset of pairs.

### 2.3 Mark some papers

Two ways to tell ZotRead what you care about:

**A. Mark your own papers as anchors** (for the "My papers" mode):

Right-click any item you authored → **ZotRead → 标记为「我的论文」 / Mark
as my paper**.

Repeat for a handful. Three to five anchors is typically enough.

![Right-click menu](screenshots/item-menu.png)

**B. Or add an idea** (for the "Idea text" mode):

In **Settings → ZotRead**, use the **Research ideas** section:

1. Click **New**.
2. Type a name (e.g. *Mechanistic interpretability of small LMs*).
3. Paste a paragraph describing the idea. A few sentences is fine; more
   detail gives the LLM more to work with.
4. Click **Save** — it becomes the active idea automatically.

You can keep several ideas stored and switch between them with the **Active
idea** dropdown.

### 2.4 Enable the columns

Right-click any column header in the main item list and tick:

- **相关度 / Relevance** — the aggregated score, 0.00–1.00
- **状态 / Status** — your read/unread/anchor state

Click a column header to sort by it. Sort by **相关度** to see the highest-
scoring unread papers at the top.

![Columns](screenshots/columns.png)

---

## 3. Day-to-day workflow

### 3.1 Trigger a rank

The first time you mark an anchor or save an idea, the score column will be
empty. Open **Settings → ZotRead → Rescore all now**. A progress window
shows which item is currently being scored. When it finishes, the column
fills in.

New papers imported afterward are scored automatically in the background
(auto-score via Zotero's item notifier).

### 3.2 Read the WhyRead pane

Select any non-anchor item. The right-side item pane shows a **WhyRead**
section (sidebar icon: ZotRead favicon). It contains:

- **Verdict** — one of
  - 🔥 Highly relevant · must read (≥ 0.7)
  - ✅ Relevant · worth reading (≥ 0.5)
  - 💡 Loosely related · skim (≥ 0.3)
  - ⏭ Unrelated · skip (< 0.3)
- **Closest of your papers** (or **Closest to your idea**) — the anchor
  that the candidate most resembles.
- **Similarity** — the aggregated top-3-mean score (same number as the
  column).
- **Why** — the model's one-line reasoning for the top match.
- **Per-paper breakdown** — the candidate's similarity against every
  active anchor, each with its own rationale.

The pane language follows Zotero's locale by default. Override it in
**Settings → WhyRead language**.

![WhyRead pane](screenshots/whyread.png)

### 3.3 Manage read status

Right-click any item → **ZotRead** gives you:

- **标记为已读 / Mark as read**
- **标记为在读 / Mark as reading**
- **重置为未读 / Reset to unread**

Status is tracked independently of the score so you can sort **相关度** as
primary key, and either filter or secondary-sort by **状态**.

### 3.4 Switch ranking modes

Change **Rank by** in settings. The column re-populates from the cache
immediately — no LLM calls, no waiting. Switching back uses the already-
cached scores.

### 3.5 Switch active idea

With **Rank by = Idea text**, use the **Active idea** dropdown in settings
to flip between saved ideas. The first time you switch to a new idea, its
score cache has to be built (one LLM call per candidate), and the progress
window shows up. Subsequent switches are instant.

---

## 4. Advanced

### 4.1 Rescoring rules

ZotRead only calls the LLM when it has to. Here's what triggers a fresh
call:

| Event | LLM calls |
|---|---|
| New paper added to library | 1 summary + 1 call per active anchor |
| Anchor added | 1 summary + 1 call per existing candidate |
| Anchor removed | 0 (cache entries remain — they're keyed by pair) |
| Idea content edited | 1 summary + 1 call per candidate (only for that idea) |
| Idea activated for first time | 1 summary + 1 call per candidate |
| Status change (read / reading) | 0 |
| Mode switch (papers ↔ idea) | 0 |
| Model changed in settings | All — the cache key includes the model name |

### 4.2 Manual cache operations

Still in Settings → ZotRead → **Maintenance**:

- **Rescore all now** — same as automatic, but on demand. Useful after
  editing an idea or adding several anchors at once.
- **Clear cached scores** — wipes summaries and similarities. Next rescore
  re-computes from scratch. Use this if you've changed the model or
  something looks stuck.

### 4.3 JavaScript API

For debugging or power use, open **Tools → Developer → Run JavaScript** and
try:

```javascript
// Sanity-check the LLM
await Zotero.ZotRead.api.ping()
// => true

// Import arXiv papers
await Zotero.ZotRead.api.importArxiv(["1706.03762", "2005.14165"])

// Idea CRUD
await Zotero.ZotRead.api.listIdeas()
await Zotero.ZotRead.api.createIdea("name", "text body")
await Zotero.ZotRead.api.setActiveIdea(3)

// Score operations
await Zotero.ZotRead.api.rescoreAll({ onProgress: console.log })
await Zotero.ZotRead.api.scoreOf(42)
await Zotero.ZotRead.api.clearAllCache()

// Anchor CRUD
await Zotero.ZotRead.api.markAnchor(42, "my thesis paper")
await Zotero.ZotRead.api.getAnchors()

// Read status
await Zotero.ZotRead.api.markStatus(42, "read")
```

### 4.4 Scoring rubric

Every pairwise score comes from this fixed 11-point scale. The LLM is
instructed to snap to these exact values:

| Value | Meaning |
|---|---|
| 1.0 | Near-duplicate — same paper restated or direct successor |
| 0.9 | Close extension — same method on same problem, slight variation |
| 0.8 | Same problem + closely related method |
| 0.7 | Same problem family, different method |
| 0.6 | Different problem but strongly shared methodology |
| 0.5 | Shared theoretical foundation, different application |
| 0.4 | Adjacent subfield, some overlap in concepts |
| 0.3 | Distant but same broader area |
| 0.2 | Only superficial keyword overlap |
| 0.1 | Token-level overlap only, no research substance |
| 0.0 | Unrelated |

The column value is the **top-3 mean** of a paper's similarities across
active anchors, so the column can show fractional numbers like 0.567 even
though individual pair scores are discrete.

---

## 5. Troubleshooting

### "No score yet" or empty columns

- Check **Settings → ZotRead → API key** is filled in.
- Confirm you have at least one paper anchor, or an active idea.
- Click **Rescore all now**.

### Rate limit / 429 errors during rescore

- The plugin retries with exponential backoff (3s → 10s → 30s). If it
  still fails, check your provider's rate limit dashboard.
- Reduce batch size by marking fewer anchors temporarily.

### Scores look wrong / misaligned

The rubric was bumped in a recent ZotRead release. When this happens:

- The plugin detects the version change on next startup, deletes stale
  rows automatically, and re-computes in the background. Check the
  progress window.
- If you want to force a fresh start, Settings → **Clear cached scores**
  → **Rescore all now**.

### WhyRead shows the wrong language

- Settings → WhyRead language → pick **Auto (follow Zotero)**, **English**,
  or **中文** explicitly.

### "API key not set" toast keeps appearing

Settings → ZotRead → paste a key. You can get one free from
[OpenRouter](https://openrouter.ai/keys) with $1 trial credit, which is
enough to rank several thousand papers.

---

## 6. Privacy

Every LLM call sends these to your configured provider:

- Title, authors, year, abstract, and (if available) the first few pages
  of any attached PDF
- The stored summary JSON of each active anchor or idea
- Your idea text, if in Idea mode

Nothing is sent to ZotRead itself — the plugin is a plain local Zotero
extension, not a hosted service. If you want everything to stay on your
machine, point the base URL at a local Ollama or LM Studio instance.

Scores, summaries, statuses, and anchor lists live inside your Zotero
SQLite database (`~/Zotero/zotero.sqlite` or wherever your data directory
is). They do not sync through Zotero's cloud storage unless your data dir
is on a synced drive.

---

## 7. Uninstall

**Tools → Plugins → ZotRead → Remove**.

The plugin's DB tables (`zotread_*`) remain in `zotero.sqlite` but do
nothing. If you want to purge them completely, run once in
**Tools → Developer → Run JavaScript** before removing the plugin:

```javascript
await Zotero.ZotRead.api.clearAllCache();
```

Then Remove the plugin normally.

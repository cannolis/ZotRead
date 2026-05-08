# ZotRead v0.1.1 — bug fixes

Patch release fixing two issues reported on a fresh-profile install.

## Fixes

- **Preferences pane labels blank on first install** — On a fresh profile, opening **Edit → Settings → ZotRead** the very first time would show empty rows (just controls, no labels) until the user clicked anything. The plugin now force-loads its FTL into the preferences window on entry, so labels resolve immediately.

- **Cryptic TypeError when API key contains non-ASCII characters** — If a pasted API key had a stray full-width space, smart quote, or IME-leftover Chinese character, "Rescore" would fail with `TypeError: Headers.append: Cannot convert argument 2 to ByteString`. The plugin now trims the key and validates it's pure ASCII before calling the LLM, with a clear error pointing at the offending character and position.

## Install

If you already have v0.1 installed: download the new `zot-read.xpi` below and re-install it via **Tools → Add-ons → gear icon → Install Add-on From File…** — your existing settings, anchors, and cache are preserved.

Fresh install: same process, no v0.1 needed first.

## What changed

- `src/services/llm.ts` — `readConfig()` trims the API key; `chat()` validates ASCII before fetch
- `src/modules/preferenceScript.ts` — `registerPrefsScripts()` calls `MozXULElement.insertFTLIfNeeded` for `zotread-preferences.ftl` on entry
- `package.json` — version 0.1.0 → 0.1.1; `author` reverted to npm string format

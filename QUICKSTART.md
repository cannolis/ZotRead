# ZotRead — Contributor Quickstart

## 1. One-time setup

### 1.1 Create a dev Zotero profile

Do **not** develop against your daily Zotero profile — a crash could corrupt
your real library. Launch Zotero's profile manager:

```bash
# macOS
/Applications/Zotero.app/Contents/MacOS/zotero -P
# Linux
zotero -P
# Windows
"C:\Program Files\Zotero\zotero.exe" -P
```

- Click **Create Profile**, name it `zotread-dev`
- Use **Choose Folder…** and point at any path you like, e.g. `~/zotero-dev-profile`
- Launch Zotero with this profile and add a few test papers

### 1.2 Fill `.env`

Copy `.env.example` to `.env` and set the three paths (omit trailing slashes):

```
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/Applications/Zotero.app/Contents/MacOS/zotero
ZOTERO_PLUGIN_PROFILE_PATH=/path/to/your/zotread-dev
ZOTERO_PLUGIN_DATA_DIR=
```

## 2. Install deps + run

```bash
npm install
npm start
```

What happens:

- ESBuild bundles `src/` → `.scaffold/build/addon/content/scripts/zotread.js`
- Zotero launches with the dev profile and the plugin auto-installed
- Hot reload: edit TS → save → plugin reloads inside Zotero

Expected on startup:

- A brief "ZotRead is ready" toast
- A "相关度 / Relevance" column in the item tree (right-click column header to enable)
- A "WhyRead" section in the item pane when a paper is selected

## 3. Build a release `.xpi`

```bash
npm run build
# artifact: .scaffold/build/zot-read.xpi
```

Drag the `.xpi` into Zotero → **Tools → Plugins** to install.

## 4. Directory layout

```
./
├── addon/                    static assets packaged into the .xpi
│   ├── bootstrap.js          Zotero 7 entry point (don't edit)
│   ├── manifest.json         plugin metadata (scaffold fills placeholders)
│   ├── prefs.js              default preference values
│   ├── content/              preferences XHTML, icons, CSS
│   └── locale/               en-US and zh-CN FTL strings
├── src/                      TypeScript source
│   ├── index.ts              bootstrap → addon wiring (don't edit)
│   ├── addon.ts              Addon singleton
│   ├── hooks.ts              lifecycle hooks (onStartup etc.)
│   ├── services/             stateless helpers (db, llm, arxiv, text)
│   ├── modules/              features (ranker, similarity, columns, menus, …)
│   └── utils/                zero-dep utilities
├── zotero-plugin.config.ts   ESBuild + scaffold configuration
└── package.json              plugin identity + npm scripts
```

## 5. Common gotchas

- **FTL string not picked up** — kill Zotero and relaunch; Fluent caches
  aggressively on first load.
- **`ztoolkit` is undefined** — you touched it before `onMainWindowLoad`
  fired; move the code into or after that hook.
- **Hot reload isn't reloading** — check `.env` points at the right
  profile, and that you're running `npm start` from the repo root.
- **Score column shows "【英文】"-like placeholder** — the `dataProvider`
  returned a Promise instead of a string; it must be synchronous.

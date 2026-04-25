import { config } from "../../package.json";
import {
  clearAllCache,
  deleteIdea as dbDeleteIdea,
  getIdea,
  IdeaRow,
  insertIdea,
  listIdeas,
  updateIdea,
} from "../services/db";
import {
  clearIdeaCache,
  getActiveIdeaID,
  setActiveIdeaID,
} from "./ideaAnchor";
import { refreshScoreMap } from "./scoreColumn";
import { refreshStatusMap } from "./statusColumn";
import { ProgressToast, toastError, toastSuccess } from "./toast";
import { getStats } from "./stats";
import { getPref } from "../utils/prefs";

/**
 * ZotRead preferences pane handler.
 * Wires up the multi-idea list + active selector + inline editor.
 */
export async function registerPrefsScripts(prefsWindow: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: prefsWindow,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = prefsWindow;
  }

  bindPrefEvents(prefsWindow);
  await buildIdeaUI(prefsWindow);
  bindMaintenanceButtons(prefsWindow);
  await buildScopePicker(prefsWindow);
  await renderStatsPanel(prefsWindow);
  await renderStatusBanner(prefsWindow);
}

// ── ranking scope ──────────────────────────────────────────────────

async function buildScopePicker(prefsWindow: Window): Promise<void> {
  const doc = prefsWindow.document;
  const r = config.addonRef;
  const picker = doc.getElementById(`zotero-prefpane-${r}-scope-picker`) as any;
  const popup = doc.getElementById(
    `zotero-prefpane-${r}-scope-picker-popup`,
  );
  if (!picker || !popup) return;

  while (popup.firstChild) popup.removeChild(popup.firstChild);

  const none = doc.createXULElement("menuitem");
  none.setAttribute("label", "(global — entire library)");
  none.setAttribute("value", "0");
  popup.appendChild(none);

  const libID = Zotero.Libraries.userLibraryID;
  const collections = Zotero.Collections.getByLibrary(libID, true);
  for (const c of collections) {
    const item = doc.createXULElement("menuitem");
    item.setAttribute("label", indentName(c));
    item.setAttribute("value", String(c.id));
    popup.appendChild(item);
  }

  const current = String(
    (Zotero.Prefs.get(
      `extensions.zotero.${r}.ranking.scopeCollectionID`,
      true,
    ) as number | undefined) ?? 0,
  );
  picker.value = current;

  picker.addEventListener("command", () => {
    const v = parseInt(String(picker.value ?? "0"), 10) || 0;
    Zotero.Prefs.set(
      `extensions.zotero.${r}.ranking.scopeCollectionID`,
      v,
      true,
    );
    refreshScoreMap().catch(() => undefined);
  });
}

function indentName(c: any): string {
  let depth = 0;
  let cur = c;
  while (cur?.parentID) {
    depth += 1;
    cur = Zotero.Collections.get(cur.parentID);
  }
  return "  ".repeat(depth) + (c.name ?? "(unnamed)");
}

// ── stats panel ────────────────────────────────────────────────────

async function renderStatsPanel(prefsWindow: Window): Promise<void> {
  const doc = prefsWindow.document;
  const root = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-stats-body`,
  );
  if (!root) return;
  while (root.firstChild) root.removeChild(root.firstChild);

  let stats;
  try {
    stats = await getStats();
  } catch (e) {
    const err = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    err.textContent = "Stats unavailable: " + String(e);
    root.appendChild(err);
    return;
  }

  const lang =
    ((getPref("ui.language") as string) || "").toLowerCase() === "zh"
      ? "zh"
      : "en";
  const labels =
    lang === "zh"
      ? {
          anchors: "我的论文（anchor）",
          ideas: "已保存的研究想法",
          summaries: "已生成的论文摘要",
          similarities: "已计算的成对相似度",
          read: "已读论文",
          reading: "正在读",
          week: "本周读完",
          month: "本月读完",
        }
      : {
          anchors: "Anchors (my papers)",
          ideas: "Saved ideas",
          summaries: "Cached summaries",
          similarities: "Cached pairwise scores",
          read: "Total read",
          reading: "Currently reading",
          week: "Read this week",
          month: "Read this month",
        };

  const lines: Array<[string, number]> = [
    [labels.anchors, stats.anchors],
    [labels.ideas, stats.ideas],
    [labels.summaries, stats.summaries],
    [labels.similarities, stats.similarities],
    [labels.week, stats.readThisWeek],
    [labels.month, stats.readThisMonth],
    [labels.read, stats.readTotal],
    [labels.reading, stats.readingNow],
  ];
  for (const [k, v] of lines) {
    const row = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    row.textContent = `${k}: ${v}`;
    root.appendChild(row);
  }
}

// ── status banner ──────────────────────────────────────────────────

async function renderStatusBanner(prefsWindow: Window): Promise<void> {
  const doc = prefsWindow.document;
  const root = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-status-banner`,
  );
  if (!root) return;
  while (root.firstChild) root.removeChild(root.firstChild);

  const apiKey = ((getPref("llm.apiKey") as string) || "").trim();
  let stats;
  try {
    stats = await getStats();
  } catch (_e) {
    return;
  }
  const hasAnchorOrIdea = stats.anchors > 0 || stats.ideas > 0;
  const hasScores = stats.similarities > 0;

  const ok = apiKey && hasAnchorOrIdea && hasScores;
  if (ok) {
    // Quiet success line.
    const line = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    line.setAttribute(
      "style",
      "padding: 6px 10px; background: #e9f6ec; border-left: 3px solid #3a8f3a; color: #2c6e2c; font-size: 11px;",
    );
    line.textContent = "✓ ZotRead is configured and ranking your library.";
    root.appendChild(line);
    return;
  }

  const wrap = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  wrap.setAttribute(
    "style",
    "padding: 8px 10px; background: #fff8e1; border-left: 3px solid #d6a700; color: #6a5200; font-size: 11px;",
  );
  const title = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  title.setAttribute("style", "font-weight: 700; margin-bottom: 4px;");
  title.textContent = "Get started in 3 steps";
  wrap.appendChild(title);

  const steps: Array<[boolean, string]> = [
    [Boolean(apiKey), "Paste an LLM API key below."],
    [
      hasAnchorOrIdea,
      "Right-click a paper you've authored → ZotRead → Mark as my paper, or add an idea below.",
    ],
    [hasScores, 'Click "Rescore all now" once your anchors / idea are set.'],
  ];
  for (const [done, text] of steps) {
    const s = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    s.textContent = (done ? "✓ " : "☐ ") + text;
    s.setAttribute("style", done ? "color: #3a8f3a;" : "");
    wrap.appendChild(s);
  }
  root.appendChild(wrap);
}

function bindMaintenanceButtons(prefsWindow: Window): void {
  const doc = prefsWindow.document;
  const r = config.addonRef;
  const buttons = [
    {
      rescore: doc.getElementById(`zotero-prefpane-${r}-rescore-now`),
      clear: doc.getElementById(`zotero-prefpane-${r}-clear-cache`),
      status: doc.getElementById(`zotero-prefpane-${r}-maint-status`),
    },
    {
      rescore: doc.getElementById(`zotero-prefpane-${r}-rescore-now-top`),
      clear: doc.getElementById(`zotero-prefpane-${r}-clear-cache-top`),
      status: doc.getElementById(`zotero-prefpane-${r}-maint-status-top`),
    },
  ];

  const setStatusLabel = (text: string) => {
    for (const b of buttons) {
      if (!b.status) continue;
      b.status.setAttribute("value", text);
      (b.status as any).textContent = text;
    }
  };

  // Wire both copies of the buttons (top + bottom).
  const rescoreBtn = {
    addEventListener: (
      type: string,
      handler: (ev: Event) => void,
    ) => {
      for (const b of buttons) {
        b.rescore?.addEventListener(type, handler);
      }
    },
  } as { addEventListener: (t: string, h: (ev: Event) => void) => void };
  const clearBtn = {
    addEventListener: (
      type: string,
      handler: (ev: Event) => void,
    ) => {
      for (const b of buttons) {
        b.clear?.addEventListener(type, handler);
      }
    },
  } as { addEventListener: (t: string, h: (ev: Event) => void) => void };

  rescoreBtn.addEventListener("command", async () => {
    setStatusLabel("Rescoring…");
    const pt = new ProgressToast(
      "ZotRead",
      "Rescoring all items…",
    ).start();
    try {
      const { api } = await import("../api");
      const report = await api.rescoreAll({
        onProgress: (p) =>
          pt.update(
            Math.floor((p.done / Math.max(p.total, 1)) * 100),
            `Scoring ${p.done}/${p.total}: ${truncate(p.title, 48)}`,
          ),
      });
      pt.finish(`Done — ${report.ranked} items ranked`);
      setStatusLabel(`✓ Ranked ${report.ranked} items`);
    } catch (e) {
      pt.finish(`Rescore failed: ${String(e).slice(0, 100)}`, "fail");
      setStatusLabel(`✗ ${String(e).slice(0, 120)}`);
    }
  });

  clearBtn?.addEventListener("command", async () => {
    try {
      const result = await clearAllCache();
      await Promise.all([refreshScoreMap(), refreshStatusMap()]);
      toastSuccess(
        `Cleared ${result.summaries} summaries + ${result.similarities} similarity rows`,
      );
      setStatusLabel(
        `✓ Cleared ${result.summaries} summaries, ${result.similarities} similarities`,
      );
    } catch (e) {
      toastError(`Clear cache failed: ${String(e).slice(0, 120)}`);
      setStatusLabel(`✗ ${String(e).slice(0, 120)}`);
    }
  });
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function bindPrefEvents(prefsWindow: Window) {
  const doc = prefsWindow.document;
  if (!doc) return;

  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-enable`)
    ?.addEventListener("command", (event: Event) => {
      ztoolkit.log(
        "[ZotRead] enable toggled",
        (event.target as XUL.Checkbox).checked,
      );
    });

  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-input`)
    ?.addEventListener("change", (event: Event) => {
      ztoolkit.log(
        "[ZotRead] LLM endpoint changed",
        (event.target as HTMLInputElement).value,
      );
    });
}

// ── idea picker UI ────────────────────────────────────────────────

interface IdeaUIRefs {
  picker: any;
  popup: Element;
  nameInput: HTMLInputElement;
  textInput: HTMLTextAreaElement;
  saveBtn: Element;
  newBtn: Element;
  deleteBtn: Element;
  statusLabel: Element;
}

function getIdeaRefs(doc: Document): IdeaUIRefs | null {
  const r = config.addonRef;
  const q = (sel: string) => doc.getElementById(sel);
  const picker = q(`zotero-prefpane-${r}-idea-picker`);
  const popup = q(`zotero-prefpane-${r}-idea-picker-popup`);
  const nameInput = q(`zotero-prefpane-${r}-idea-name`) as HTMLInputElement;
  const textInput = q(`zotero-prefpane-${r}-idea-text`) as HTMLTextAreaElement;
  const saveBtn = q(`zotero-prefpane-${r}-idea-save`);
  const newBtn = q(`zotero-prefpane-${r}-idea-new`);
  const deleteBtn = q(`zotero-prefpane-${r}-idea-delete`);
  const statusLabel = q(`zotero-prefpane-${r}-idea-status`);
  if (!picker || !popup || !nameInput || !textInput || !saveBtn || !newBtn || !deleteBtn || !statusLabel) {
    return null;
  }
  return { picker: picker as any, popup, nameInput, textInput, saveBtn, newBtn, deleteBtn, statusLabel };
}

async function buildIdeaUI(prefsWindow: Window): Promise<void> {
  const doc = prefsWindow.document;
  const refs = getIdeaRefs(doc);
  if (!refs) {
    Zotero.debug("[ZotRead] idea prefs UI not found, skipping");
    return;
  }

  await rebuildPicker(doc, refs);

  refs.picker.addEventListener("command", async () => {
    const value = String(refs.picker.value ?? "0");
    const id = parseInt(value, 10) || 0;
    await loadIdeaIntoEditor(refs, id);
    if (id > 0) setActiveIdeaID(id);
    else setActiveIdeaID(0);
    await refreshScoreMap();
  });

  refs.newBtn.addEventListener("command", () => {
    // Clear editor fields so user types fresh content
    refs.nameInput.value = "";
    refs.textInput.value = "";
    refs.picker.value = "0";
    setStatus(refs, "请填写名称与正文，再点「Save」保存");
    refs.nameInput.focus?.();
  });

  refs.saveBtn.addEventListener("command", async () => {
    await saveCurrentIdea(doc, refs);
  });

  refs.deleteBtn.addEventListener("command", async () => {
    await deleteCurrentIdea(doc, refs);
  });
}

async function rebuildPicker(
  doc: Document,
  refs: IdeaUIRefs,
): Promise<void> {
  const { popup, picker } = refs;
  while (popup.firstChild) popup.removeChild(popup.firstChild);

  const ideas = await listIdeas();
  const activeID = getActiveIdeaID();

  // "(none)" option
  const none = doc.createXULElement("menuitem");
  none.setAttribute("label", "(none — no active idea)");
  none.setAttribute("value", "0");
  popup.appendChild(none);

  for (const idea of ideas) {
    const item = doc.createXULElement("menuitem");
    const label = idea.ideaID === activeID ? `★ ${idea.name}` : idea.name;
    item.setAttribute("label", label);
    item.setAttribute("value", String(idea.ideaID));
    popup.appendChild(item);
  }

  // Select the active idea (or none)
  picker.value = String(activeID || 0);
  await loadIdeaIntoEditor(refs, activeID);
}

async function loadIdeaIntoEditor(
  refs: IdeaUIRefs,
  ideaID: number,
): Promise<void> {
  if (!ideaID) {
    refs.nameInput.value = "";
    refs.textInput.value = "";
    setStatus(refs, "无激活 idea。点击「New」创建。");
    return;
  }
  const idea = await getIdea(ideaID);
  if (!idea) {
    setStatus(refs, `Idea #${ideaID} 不存在`);
    return;
  }
  refs.nameInput.value = idea.name;
  refs.textInput.value = idea.text;
  setStatus(
    refs,
    `Active: #${idea.ideaID} ${idea.name} · ${idea.text.length} chars`,
  );
}

async function saveCurrentIdea(
  doc: Document,
  refs: IdeaUIRefs,
): Promise<void> {
  const name = refs.nameInput.value.trim();
  const text = refs.textInput.value.trim();
  if (!name) {
    setStatus(refs, "⚠ 名称不能为空");
    return;
  }
  if (!text) {
    setStatus(refs, "⚠ 正文不能为空");
    return;
  }
  const current = String(refs.picker.value ?? "0");
  const currentID = parseInt(current, 10) || 0;

  if (currentID > 0) {
    const existing = await getIdea(currentID);
    if (existing) {
      await updateIdea(currentID, name, text);
      await clearIdeaCache(currentID);
      setStatus(refs, `✓ 已更新 #${currentID} ${name}`);
      await rebuildPicker(doc, refs);
      await refreshScoreMap();
      return;
    }
  }
  // Create new
  const newID = await insertIdea(name, text);
  setActiveIdeaID(newID);
  setStatus(refs, `✓ 已新建 #${newID} ${name}，已设为激活`);
  await rebuildPicker(doc, refs);
  await refreshScoreMap();
}

async function deleteCurrentIdea(
  doc: Document,
  refs: IdeaUIRefs,
): Promise<void> {
  const currentID = parseInt(String(refs.picker.value ?? "0"), 10) || 0;
  if (currentID <= 0) {
    setStatus(refs, "请先选中一条 idea");
    return;
  }
  const existing = await getIdea(currentID);
  if (!existing) {
    setStatus(refs, `Idea #${currentID} 已不存在`);
    await rebuildPicker(doc, refs);
    return;
  }
  await clearIdeaCache(currentID);
  await dbDeleteIdea(currentID);
  if (getActiveIdeaID() === currentID) {
    setActiveIdeaID(0);
  }
  await rebuildPicker(doc, refs);
  await refreshScoreMap();
  setStatus(refs, `✓ 已删除 #${currentID}`);
}

function setStatus(refs: IdeaUIRefs, text: string): void {
  refs.statusLabel.setAttribute("value", text);
  (refs.statusLabel as any).textContent = text;
}

// Silence unused IdeaRow lint
void (null as unknown as IdeaRow);

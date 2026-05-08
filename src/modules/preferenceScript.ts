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
import { clearIdeaCache, getActiveIdeaID, setActiveIdeaID } from "./ideaAnchor";
import { refreshScoreMap } from "./scoreColumn";
import { refreshStatusMap } from "./statusColumn";
import { toastError, toastSuccess } from "./toast";
import { getStats } from "./stats";
import { getPref } from "../utils/prefs";

type Lang = "en" | "zh";

/**
 * Resolve display language. Priority: explicit pref → Zotero locale → en.
 * Mirrors whyReadSection.ts so the prefs pane and the WhyRead pane render
 * the same language regardless of which one the user opens first.
 */
function currentLang(): Lang {
  const v = ((getPref("ui.language") as string) || "").toLowerCase().trim();
  if (v === "zh") return "zh";
  if (v === "en") return "en";
  try {
    const loc = (Zotero.locale as string) || "";
    if (loc.toLowerCase().startsWith("zh")) return "zh";
  } catch (_e) {
    /* non-fatal */
  }
  return "en";
}

/** Pick the right string for the active language. */
function tx(zh: string, en: string): string {
  return currentLang() === "zh" ? zh : en;
}

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

  // First-install fix: on a fresh profile, the chrome:// → preferences.ftl
  // mapping isn't yet warm in Firefox's l10n cache when the prefs pane
  // first opens, so every `data-l10n-id` element renders blank until the
  // user interacts with anything (which forces a re-layout). Force the
  // FTL into this window's document so all labels resolve immediately.
  try {
    (prefsWindow as any).MozXULElement?.insertFTLIfNeeded?.(
      `${config.addonRef}-preferences.ftl`,
    );
  } catch (_e) {
    /* non-fatal */
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
  const popup = doc.getElementById(`zotero-prefpane-${r}-scope-picker-popup`);
  if (!picker || !popup) return;

  while (popup.firstChild) popup.removeChild(popup.firstChild);

  // Empty-label placeholder so the menulist shows blank when no scope is
  // selected, instead of a parenthetical instruction.
  const none = doc.createXULElement("menuitem");
  none.setAttribute("label", "");
  none.setAttribute("value", "0");
  popup.appendChild(none);

  // Whole-library option (encoded as -1 in the pref).
  const wholeLib = doc.createXULElement("menuitem");
  wholeLib.setAttribute(
    "label",
    tx("我的文库（全部论文）", "My library (all items)"),
  );
  wholeLib.setAttribute("value", "-1");
  popup.appendChild(wholeLib);

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

  const lang = currentLang();
  const labels =
    lang === "zh"
      ? {
          anchors: "我的论文",
          ideas: "研究想法",
          summaries: "论文摘要",
          similarities: "相关度对",
          read: "已读",
          reading: "在读",
          week: "本周读完",
          month: "本月读完",
        }
      : {
          anchors: "My papers",
          ideas: "Ideas",
          summaries: "Summaries",
          similarities: "Pairwise scores",
          read: "Read",
          reading: "Reading",
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

interface RescorePreview {
  scopeName: string;
  candidateCount: number;
  anchorCount: number;
  mode: "papers" | "idea";
}

async function buildRescorePreview(): Promise<
  { ok: true; preview: RescorePreview } | { ok: false; reason: string }
> {
  const lang = currentLang();
  const r = config.addonRef;
  const scopeID =
    ((Zotero.Prefs.get(
      `extensions.zotero.${r}.ranking.scopeCollectionID`,
      true,
    ) as number | undefined) ?? 0) | 0;

  if (scopeID === 0) {
    return {
      ok: false,
      reason:
        lang === "zh"
          ? "请先在上方「排序范围」选一个集合或「我的文库」，再点重新评估。"
          : 'Pick a collection or "My library" under "Ranking scope" first, then rescore.',
    };
  }

  let scopeName: string;
  let candidateCount: number;
  if (scopeID < 0) {
    // -1 means whole user library
    const libID = Zotero.Libraries.userLibraryID;
    const ids = await Zotero.Items.getAllIDs(libID);
    const items = await Zotero.Items.getAsync(ids);
    candidateCount = items.filter((it) => it && it.isRegularItem()).length;
    scopeName =
      lang === "zh" ? "我的文库（全部论文）" : "My library (all items)";
  } else {
    const coll = Zotero.Collections.get(scopeID) as
      | Zotero.Collection
      | false
      | undefined;
    if (!coll) {
      return {
        ok: false,
        reason:
          lang === "zh"
            ? `选中的集合 #${scopeID} 已不存在。请重新选择。`
            : `Selected collection #${scopeID} no longer exists. Pick another.`,
      };
    }
    const items = coll.getChildItems() ?? [];
    candidateCount = items.filter((it) => it && it.isRegularItem()).length;
    scopeName = coll.name || `Collection #${scopeID}`;
  }

  const { getActiveAnchorIDs, getRankingMode } = await import("./rankingMode");
  const anchorIDs = await getActiveAnchorIDs();
  const mode = getRankingMode();

  return {
    ok: true,
    preview: {
      scopeName,
      candidateCount,
      anchorCount: anchorIDs.length,
      mode,
    },
  };
}

function formatPreviewMessage(p: RescorePreview): string {
  const lang = currentLang();
  const calls = p.candidateCount * p.anchorCount;

  if (lang === "zh") {
    return (
      `即将对集合「${p.scopeName}」重新评估。\n\n` +
      `候选论文：${p.candidateCount} 篇\n` +
      `参照（${p.mode === "idea" ? "研究想法" : "我的论文"}）：${p.anchorCount} 个\n` +
      `最多 API 调用：${calls.toLocaleString()} 次（已缓存的对会跳过，实际更少）\n\n` +
      `评估过程中可随时点「停止评估」中断。\n\n` +
      `继续吗？`
    );
  }
  return (
    `Ready to rescore collection "${p.scopeName}".\n\n` +
    `Candidate papers: ${p.candidateCount}\n` +
    `Anchors (${p.mode === "idea" ? "research idea" : "my papers"}): ${p.anchorCount}\n` +
    `Max API calls: ${calls.toLocaleString()} (cached pairs are skipped, actual fewer)\n\n` +
    `You can press "Stop scoring" any time to interrupt.\n\n` +
    `Proceed?`
  );
}

/**
 * Close the prefs window, open a standalone modeless progress dialog, and
 * run the rescore there. The dialog has its own progress bar + stop
 * button so the user always sees them — the prefs pane was unreliable
 * because it could be obscured or the inline elements didn't repaint.
 */
function runRescoreInDialog(prefsWindow: Window): void {
  const lang = currentLang();
  const mainWin = Zotero.getMainWindow();
  const url = `chrome://${addon.data.config.addonRef}/content/rescoreProgress.xhtml`;

  // Open the dialog *before* closing prefs — prefsWindow.openDialog keeps
  // the new window alive even after prefs closes. Use main Zotero window
  // as the opener so the progress dialog persists independently.
  const progressWin = (mainWin as any).openDialog(
    url,
    "_blank",
    "chrome,centerscreen,resizable=no,dialog=no,minimizable=no,width=480,height=180",
  );
  if (!progressWin) {
    toastError(tx("无法打开进度窗口", "Could not open progress window"));
    return;
  }

  // Close prefs after the dialog exists, so user sees progress immediately.
  try {
    (prefsWindow as any).close?.();
  } catch (_e) {
    /* ignore */
  }

  const onLoad = () => {
    const pdoc = progressWin.document;
    const titleEl = pdoc.getElementById("title");
    const barEl = pdoc.getElementById("bar") as HTMLProgressElement | null;
    const statusEl = pdoc.getElementById("status");
    const stopBtn = pdoc.getElementById("stop") as HTMLButtonElement | null;
    if (titleEl) {
      titleEl.textContent =
        lang === "zh" ? "ZotRead — 评估中" : "ZotRead — Rescoring…";
    }
    if (statusEl) {
      statusEl.textContent = lang === "zh" ? "准备中…" : "Preparing…";
    }
    if (stopBtn) {
      stopBtn.textContent = lang === "zh" ? "停止评估" : "Stop";
    }
    pdoc.title = lang === "zh" ? "ZotRead 评估" : "ZotRead Rescoring";

    // AbortController is not a chrome-global in Zotero 9 / Firefox 140 ESR;
    // grab it from the Zotero main window (which is a real Web window).
    const AbortCtrl =
      (globalThis as any).AbortController ||
      (Zotero.getMainWindow() as any).AbortController ||
      (progressWin as any).AbortController;
    const controller: AbortController = new AbortCtrl();
    let finished = false;

    stopBtn?.addEventListener("click", () => {
      if (finished) {
        progressWin.close();
        return;
      }
      controller.abort();
      stopBtn.disabled = true;
      stopBtn.textContent = lang === "zh" ? "正在停止…" : "Stopping…";
    });

    // Also abort on window close (user clicks X)
    progressWin.addEventListener("unload", () => {
      if (!finished) controller.abort();
    });

    const run = async () => {
      try {
        const { api } = await import("../api");
        const report = await api.rescoreAll({
          signal: controller.signal,
          onProgress: (p) => {
            if (barEl) {
              barEl.max = 100;
              barEl.value =
                p.total > 0 ? Math.floor((p.done / p.total) * 100) : 0;
            }
            if (statusEl) {
              statusEl.textContent =
                lang === "zh"
                  ? `${p.done}/${p.total} · ${truncate(p.title, 48)}`
                  : `${p.done}/${p.total} · ${truncate(p.title, 48)}`;
            }
          },
        });
        finished = true;
        if (controller.signal.aborted) {
          if (statusEl)
            statusEl.textContent =
              lang === "zh"
                ? `■ 已停止，共评估 ${report.ranked} 篇`
                : `■ Stopped — ${report.ranked} items scored`;
        } else {
          if (barEl) barEl.value = 100;
          if (statusEl)
            statusEl.textContent =
              lang === "zh"
                ? `✓ 完成，共评估 ${report.ranked} 篇`
                : `✓ Done — ${report.ranked} items scored`;
        }
        if (stopBtn) {
          stopBtn.disabled = false;
          stopBtn.textContent = lang === "zh" ? "关闭" : "Close";
        }
      } catch (e) {
        finished = true;
        if (statusEl)
          statusEl.textContent =
            lang === "zh"
              ? `✗ 评估失败：${String(e).slice(0, 100)}`
              : `✗ Failed: ${String(e).slice(0, 100)}`;
        if (stopBtn) {
          stopBtn.disabled = false;
          stopBtn.textContent = lang === "zh" ? "关闭" : "Close";
        }
      }
    };
    run();
  };

  if (progressWin.document.readyState === "complete") {
    onLoad();
  } else {
    progressWin.addEventListener("load", onLoad, { once: true });
  }
}

function confirmDialog(prefsWindow: Window, message: string): boolean {
  try {
    const win = prefsWindow as any;
    const Services = win.Services || (globalThis as any).Services;
    if (Services?.prompt?.confirm) {
      return Services.prompt.confirm(win, "ZotRead", message);
    }
    return win.confirm(message);
  } catch (_e) {
    return (prefsWindow as any).confirm?.(message) ?? false;
  }
}

function bindMaintenanceButtons(prefsWindow: Window): void {
  const doc = prefsWindow.document;
  const r = config.addonRef;
  const rescoreBtn = doc.getElementById(`zotero-prefpane-${r}-rescore-now-top`);
  const clearBtn = doc.getElementById(`zotero-prefpane-${r}-clear-cache-top`);
  const statusLabel = doc.getElementById(
    `zotero-prefpane-${r}-maint-status-top`,
  );

  const setStatusLabel = (text: string) => {
    if (!statusLabel) return;
    statusLabel.removeAttribute("value");
    (statusLabel as any).textContent = text;
  };

  rescoreBtn?.addEventListener("command", async () => {
    const result = await buildRescorePreview();
    if (!result.ok) {
      setStatusLabel(`⚠ ${result.reason}`);
      toastError(result.reason);
      return;
    }
    if (result.preview.candidateCount === 0) {
      setStatusLabel(
        tx(
          "⚠ 所选集合内没有正式条目",
          "⚠ Selected collection has no regular items",
        ),
      );
      return;
    }
    if (result.preview.anchorCount === 0) {
      setStatusLabel(
        tx(
          "⚠ 尚未配置我的论文或研究想法，请先添加",
          "⚠ No anchors / research idea configured. Add one first.",
        ),
      );
      return;
    }
    if (!confirmDialog(prefsWindow, formatPreviewMessage(result.preview))) {
      setStatusLabel(tx("已取消评估", "Rescore canceled"));
      return;
    }

    // Close the prefs window and run the rescore in a standalone modeless
    // dialog so the user can clearly see progress and the Stop button.
    runRescoreInDialog(prefsWindow);
  });

  clearBtn?.addEventListener("command", async () => {
    // Read counts up-front so the confirm dialog can warn the user
    // exactly how much they're about to lose.
    let stats;
    try {
      stats = await getStats();
    } catch (_e) {
      stats = { summaries: 0, similarities: 0 } as Awaited<
        ReturnType<typeof getStats>
      >;
    }
    const message = tx(
      `确定要清空所有缓存吗？\n\n` +
        `这将删除 ${stats.summaries} 条论文摘要和 ${stats.similarities} 条相关度评估。\n\n` +
        `无法恢复，下次重新评估时需要重新调用 API。`,
      `Clear all cached data?\n\n` +
        `This will delete ${stats.summaries} paper summaries and ${stats.similarities} relevance scores.\n\n` +
        `Cannot be undone — the next rescore will hit the API again.`,
    );
    if (!confirmDialog(prefsWindow, message)) {
      setStatusLabel(tx("已取消", "Canceled"));
      return;
    }

    try {
      const result = await clearAllCache();
      await Promise.all([refreshScoreMap(), refreshStatusMap()]);
      toastSuccess(
        tx(
          `已清空：${result.summaries} 条摘要 + ${result.similarities} 条相关度`,
          `Cleared ${result.summaries} summaries + ${result.similarities} similarity rows`,
        ),
      );
      setStatusLabel(
        tx(
          `✓ 已清空 ${result.summaries} 条摘要、${result.similarities} 条相关度`,
          `✓ Cleared ${result.summaries} summaries, ${result.similarities} similarities`,
        ),
      );
    } catch (e) {
      toastError(
        tx(
          `清空缓存失败：${String(e).slice(0, 120)}`,
          `Clear cache failed: ${String(e).slice(0, 120)}`,
        ),
      );
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
  if (
    !picker ||
    !popup ||
    !nameInput ||
    !textInput ||
    !saveBtn ||
    !newBtn ||
    !deleteBtn ||
    !statusLabel
  ) {
    return null;
  }
  return {
    picker: picker as any,
    popup,
    nameInput,
    textInput,
    saveBtn,
    newBtn,
    deleteBtn,
    statusLabel,
  };
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
    setStatus(
      refs,
      tx("请填写名称与正文后保存。", "Fill in the name and text, then save."),
    );
    refs.nameInput.focus?.();
  });

  refs.saveBtn.addEventListener("command", async () => {
    await saveCurrentIdea(doc, refs);
  });

  refs.deleteBtn.addEventListener("command", async () => {
    await deleteCurrentIdea(doc, refs);
  });
}

async function rebuildPicker(doc: Document, refs: IdeaUIRefs): Promise<void> {
  const { popup, picker } = refs;
  while (popup.firstChild) popup.removeChild(popup.firstChild);

  const ideas = await listIdeas();
  const activeID = getActiveIdeaID();

  // Blank placeholder so the menulist shows nothing when no idea is active.
  const none = doc.createXULElement("menuitem");
  none.setAttribute("label", "");
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
    setStatus(
      refs,
      tx(
        "尚无激活的研究想法。点击「新建」创建一条。",
        'No active research idea. Click "New" to create one.',
      ),
    );
    return;
  }
  const idea = await getIdea(ideaID);
  if (!idea) {
    setStatus(
      refs,
      tx(`研究想法 #${ideaID} 不存在`, `Research idea #${ideaID} not found`),
    );
    return;
  }
  refs.nameInput.value = idea.name;
  refs.textInput.value = idea.text;
  setStatus(
    refs,
    tx(
      `已激活 #${idea.ideaID} ${idea.name} · ${idea.text.length} 字`,
      `Active: #${idea.ideaID} ${idea.name} · ${idea.text.length} chars`,
    ),
  );
}

async function saveCurrentIdea(doc: Document, refs: IdeaUIRefs): Promise<void> {
  const name = refs.nameInput.value.trim();
  const text = refs.textInput.value.trim();
  if (!name) {
    setStatus(refs, tx("⚠ 名称不能为空", "⚠ Name cannot be empty"));
    return;
  }
  if (!text) {
    setStatus(refs, tx("⚠ 正文不能为空", "⚠ Text cannot be empty"));
    return;
  }
  const current = String(refs.picker.value ?? "0");
  const currentID = parseInt(current, 10) || 0;

  if (currentID > 0) {
    const existing = await getIdea(currentID);
    if (existing) {
      await updateIdea(currentID, name, text);
      await clearIdeaCache(currentID);
      setStatus(
        refs,
        tx(`✓ 已更新 #${currentID} ${name}`, `✓ Updated #${currentID} ${name}`),
      );
      await rebuildPicker(doc, refs);
      await refreshScoreMap();
      return;
    }
  }
  // Create new
  const newID = await insertIdea(name, text);
  setActiveIdeaID(newID);
  setStatus(
    refs,
    tx(
      `✓ 已新建 #${newID} ${name}，已设为激活`,
      `✓ Created #${newID} ${name} (now active)`,
    ),
  );
  await rebuildPicker(doc, refs);
  await refreshScoreMap();
}

async function deleteCurrentIdea(
  doc: Document,
  refs: IdeaUIRefs,
): Promise<void> {
  const currentID = parseInt(String(refs.picker.value ?? "0"), 10) || 0;
  if (currentID <= 0) {
    setStatus(refs, tx("请先选中一条研究想法", "Pick a research idea first"));
    return;
  }
  const existing = await getIdea(currentID);
  if (!existing) {
    setStatus(
      refs,
      tx(
        `研究想法 #${currentID} 已不存在`,
        `Research idea #${currentID} no longer exists`,
      ),
    );
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
  setStatus(refs, tx(`✓ 已删除 #${currentID}`, `✓ Deleted #${currentID}`));
}

function setStatus(refs: IdeaUIRefs, text: string): void {
  // XUL <label> in Zotero 9 (Firefox 140 ESR) renders BOTH the `value`
  // attribute and the textContent — setting both shows the same string
  // twice. Use textContent only.
  refs.statusLabel.removeAttribute("value");
  (refs.statusLabel as any).textContent = text;
}

// Silence unused IdeaRow lint
void (null as unknown as IdeaRow);

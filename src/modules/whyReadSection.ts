/**
 * Item-pane section "WhyRead" — concise rationale in the user's chosen
 * language (English or Simplified Chinese, pref `ui.language`).
 */

import { getEffectiveSimilarities, isAnchor } from "../services/db";
import { getActiveIdea, isIdeaVirtualID } from "./ideaAnchor";
import { getActiveAnchorIDs, getRankingMode } from "./rankingMode";
import { getPref } from "../utils/prefs";
import { getSimilarityMethod } from "./similarity";

const PANE_ID = "zotread-whyread";
const SECTION_CSS_ID = "zotread-whyread-body";

type Lang = "en" | "zh";

interface Strings {
  notRegular: string;
  isAnchor: string;
  noAnchors: string;
  notCompared: string;
  closestPaperLabel: string;
  closestIdeaLabel: string;
  similarityLabel: string;
  whyLabel: string;
  breakdownLabel: string;
  quoteOpen: string;
  quoteClose: string;
  buckets: {
    high: string;
    mid: string;
    low: string;
    none: string;
  };
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    notRegular: "Attachments and notes aren't ranked.",
    isAnchor:
      "One of your own papers — used as a reference point for ranking others.",
    noAnchors:
      "No reference papers yet. Right-click a paper → Mark as my paper, or add an idea in settings.",
    notCompared: "No score yet. Open Settings → ZotRead → Rescore all now.",
    closestPaperLabel: "Closest of your papers:",
    closestIdeaLabel: "Closest to your idea:",
    similarityLabel: "Relevance:",
    whyLabel: "Why:",
    breakdownLabel: "Other reference papers of mine:",
    quoteOpen: "“",
    quoteClose: "”",
    buckets: {
      high: "🔥 Highly relevant · must read",
      mid: "✅ Relevant · worth reading",
      low: "💡 Loosely related · skim",
      none: "⏭ Unrelated · skip",
    },
  },
  zh: {
    notRegular: "附件或笔记不参与排序。",
    isAnchor: "这是你标记的「我的论文」——其他论文会以它为参照来评估。",
    noAnchors:
      "还没有参照论文。右键一篇论文选「标记为我的论文」，或在设置里填写一条研究想法。",
    notCompared: "还没评估。请在「设置 → ZotRead → 重新评估」。",
    closestPaperLabel: "我的最相关论文：",
    closestIdeaLabel: "最贴近你的研究想法：",
    similarityLabel: "相关度：",
    whyLabel: "判断依据：",
    breakdownLabel: "对其他我的论文的相关度分析：",
    quoteOpen: "《",
    quoteClose: "》",
    buckets: {
      high: "🔥 高度相关 · 建议精读",
      mid: "✅ 相关 · 值得一读",
      low: "💡 略有关联 · 随便看看",
      none: "⏭ 基本无关 · 可跳过",
    },
  },
};

function currentLang(): Lang {
  const v = ((getPref("ui.language") as string) || "").toLowerCase().trim();
  if (v === "zh") return "zh";
  if (v === "en") return "en";
  // Empty = follow Zotero's own locale.
  return detectZoteroLang();
}

function detectZoteroLang(): Lang {
  try {
    const loc = (Zotero.locale as string) || "";
    if (loc.toLowerCase().startsWith("zh")) return "zh";
    // Fall through to Mozilla services locale as a second probe.
    const services = (globalThis as any).Services;
    const tags =
      services?.locale?.requestedLocales ??
      services?.locale?.appLocalesAsBCP47?.() ??
      [];
    for (const tag of tags) {
      if (String(tag).toLowerCase().startsWith("zh")) return "zh";
    }
  } catch (_e) {
    /* non-fatal */
  }
  return "en";
}

let registered = false;

export async function registerWhyReadSection(): Promise<void> {
  if (registered) return;
  const manager = (Zotero as any).ItemPaneManager;
  if (!manager?.registerSection) {
    Zotero.debug("[ZotRead] ItemPaneManager.registerSection unavailable");
    return;
  }

  const pluginID = addon.data.config.addonID;
  const addonRef = addon.data.config.addonRef;

  try {
    await manager.registerSection({
      paneID: PANE_ID,
      pluginID,
      header: {
        l10nID: "item-section-zotread-head-text",
        icon: `chrome://${addonRef}/content/icons/favicon.svg`,
      },
      sidenav: {
        l10nID: "item-section-zotread-sidenav-tooltip",
        icon: `chrome://${addonRef}/content/icons/favicon.svg`,
      },
      onRender: (data: any) => {
        renderWhyRead(data).catch((e) =>
          Zotero.debug("[ZotRead] WhyRead onRender failed: " + String(e)),
        );
        // (Re-)attach the IntersectionObserver that keeps
        // `userPrefersZotRead` in sync with whether the user actually
        // has the section in view, regardless of item-change timing.
        ensureVisibilityObserver(data);
      },
      onItemChange: (data: any) => {
        renderWhyRead(data).catch((e) =>
          Zotero.debug("[ZotRead] WhyRead onItemChange failed: " + String(e)),
        );
        // Auto-scroll back to ZotRead only when the user was
        // demonstrably looking at it (the observer reported
        // intersecting on the previous interaction). Synchronous
        // viewport checks here race with Zotero's scroll reset, so we
        // rely on the most recently published observer state instead.
        if (userPrefersZotRead) bringSectionToFront(data);
      },
    });
    registered = true;
    Zotero.debug("[ZotRead] WhyRead section registered");
  } catch (e) {
    Zotero.debug("[ZotRead] WhyRead register failed: " + String(e));
  }
}

export async function unregisterWhyReadSection(): Promise<void> {
  if (!registered) return;
  const manager = (Zotero as any).ItemPaneManager;
  try {
    manager?.unregisterSection?.(PANE_ID);
  } catch (e) {
    Zotero.debug("[ZotRead] WhyRead unregister failed: " + String(e));
  }
  registered = false;
}

interface RenderData {
  body: HTMLElement;
  doc: Document;
  item: Zotero.Item;
}

function findSection(
  data: RenderData,
): (HTMLElement & { open?: boolean }) | null {
  if (!data?.body) return null;
  return data.body.closest("collapsible-section, item-pane-custom-section") as
    | (HTMLElement & { open?: boolean })
    | null;
}

/**
 * Tracks whether the user currently has the ZotRead section in view.
 * Updated asynchronously by an IntersectionObserver attached to the
 * section element. We can't compute this synchronously inside
 * onItemChange, because Zotero resets the item-pane scroll *before*
 * firing onItemChange, so a getBoundingClientRect check at that
 * moment always reports "not visible" even if the user was just
 * looking at it. The observer's last-reported state, in contrast,
 * reflects the user's most recent actual interaction.
 */
let userPrefersZotRead = false;
let activeObserver: IntersectionObserver | null = null;
let observedSection: HTMLElement | null = null;

function ensureVisibilityObserver(data: RenderData): void {
  try {
    const section = findSection(data);
    if (!section) return;
    if (observedSection === section && activeObserver) return; // already attached
    activeObserver?.disconnect();
    observedSection = section;

    const win = data.doc?.defaultView as
      | (Window & { IntersectionObserver?: typeof IntersectionObserver })
      | null
      | undefined;
    const Observer = win?.IntersectionObserver;
    if (!Observer) return;

    activeObserver = new Observer(
      (entries) => {
        const last = entries[entries.length - 1];
        // Treat collapsed sections (height ~ header only) as "not in
        // view" — the user has explicitly hidden the body.
        const sectionOpen = (section as any).open !== false;
        userPrefersZotRead =
          !!last && last.isIntersecting && last.intersectionRatio > 0.1 &&
          sectionOpen;
      },
      { threshold: [0, 0.1, 0.5, 1.0] },
    );
    activeObserver.observe(section);

    // Seed the flag once on attach: if the section is currently both
    // open and at least partially in view, treat the user as
    // "currently looking at ZotRead" so the very next item-change
    // follows them back. The observer's first callback will then
    // refine this within a frame.
    if ((section as any).open !== false) {
      const rect = section.getBoundingClientRect();
      const viewportH = (win as any)?.innerHeight ?? 0;
      if (viewportH > 0 && rect.bottom > 0 && rect.top < viewportH) {
        userPrefersZotRead = true;
      }
    }
  } catch (e) {
    Zotero.debug(
      "[ZotRead] ensureVisibilityObserver failed: " + String(e),
    );
  }
}

/** Force the ZotRead section open and scroll it into view. */
function bringSectionToFront(data: RenderData): void {
  if (!data?.body) return;
  const win = data.doc?.defaultView ?? Zotero.getMainWindow();
  win?.setTimeout(() => {
    try {
      const section = findSection(data);
      if (!section) return;
      if (section.open === false) section.open = true;
      section.scrollIntoView({ block: "start" });
    } catch (_e) {
      /* non-fatal */
    }
  }, 50);
}

async function renderWhyRead(data: RenderData): Promise<void> {
  const { body, doc, item } = data;
  if (!body || !item) return;
  const s = STRINGS[currentLang()];

  while (body.firstChild) body.removeChild(body.firstChild);
  const root = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  root.id = SECTION_CSS_ID;
  root.setAttribute(
    "style",
    "padding: 8px 12px; font-size: 12px; line-height: 1.5;",
  );
  body.appendChild(root);

  if (!item.isRegularItem()) {
    setText(doc, root, s.notRegular);
    return;
  }

  if (await isAnchor(item.id)) {
    setText(doc, root, s.isAnchor, "#3a7bd5");
    return;
  }

  const anchorIDs = await getActiveAnchorIDs();
  if (anchorIDs.length === 0) {
    const mode = getRankingMode();
    const msg =
      mode === "idea"
        ? currentLang() === "zh"
          ? "当前是「研究想法」模式，但还没填写内容。请到设置里填写。"
          : "Ranking mode is Idea, but no idea text is set. Add one in Settings."
        : s.noAnchors;
    setText(doc, root, msg);
    return;
  }

  const sims = await getEffectiveSimilarities(
    anchorIDs,
    item.id,
    getSimilarityMethod(),
  );
  if (sims.size === 0) {
    setText(doc, root, s.notCompared, "#a07500");
    return;
  }

  const entries = Array.from(sims.entries()).sort(
    (a, b) => b[1].similarity - a[1].similarity,
  );
  const [topAnchorID, topRow] = entries[0];

  // Match the item-tree column: maximum single-anchor similarity. The
  // top anchor's rationale below then refers to this same score.
  const aggregatedScore = entries[0][1].similarity;

  // Resolve title: paper vs idea (always the anchor with the highest single sim)
  let closestLabel: string;
  let closestValue: string;
  if (isIdeaVirtualID(topAnchorID)) {
    const idea = await getActiveIdea();
    const name =
      idea?.name || (currentLang() === "zh" ? "我的研究想法" : "My idea");
    closestLabel = s.closestIdeaLabel;
    closestValue = truncate(name, 60);
  } else {
    const a = await Zotero.Items.getAsync(topAnchorID);
    const title = (a?.getField("title") as string) || `Item ${topAnchorID}`;
    closestLabel = s.closestPaperLabel;
    closestValue = truncate(title, 80);
  }

  const verdict = bucketFromSimilarity(aggregatedScore, s);

  appendPara(
    doc,
    root,
    verdict.label,
    `font-weight: 600; font-size: 13px; color: ${verdict.color}; margin-bottom: 6px;`,
  );
  appendLabelValue(doc, root, closestLabel, closestValue, "opacity: 0.95;");
  appendScoreWithEdit(doc, root, s, topRow, topAnchorID, item, data);
  if (topRow.rationale) {
    appendLabelValue(
      doc,
      root,
      s.whyLabel,
      topRow.rationale,
      "opacity: 0.8; font-style: italic; margin-top: 4px;",
    );
  }

  // The top anchor is already shown above (closest paper + score +
  // rationale), so the breakdown only needs to list the *other* anchors.
  const otherEntries = entries.filter(([id]) => id !== topAnchorID);
  if (otherEntries.length > 0) {
    const divider = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    divider.setAttribute(
      "style",
      "margin-top: 10px; padding-top: 6px; border-top: 1px solid currentColor; border-color: rgba(128,128,128,0.3);",
    );
    const header = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    header.setAttribute(
      "style",
      "font-weight: 700; opacity: 0.7; font-size: 11px; margin-bottom: 4px;",
    );
    header.textContent = s.breakdownLabel;
    divider.appendChild(header);

    for (const [anchorID, row] of otherEntries) {
      let name: string;
      if (isIdeaVirtualID(anchorID)) {
        const idea = await getActiveIdea();
        name =
          idea?.name || (currentLang() === "zh" ? "我的研究想法" : "My idea");
      } else {
        const a = await Zotero.Items.getAsync(anchorID);
        name = (a?.getField("title") as string) || `Item ${anchorID}`;
      }
      const line = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      line.setAttribute(
        "style",
        "margin: 3px 0; opacity: 0.8; font-size: 11px;",
      );
      const scoreSpan = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      );
      scoreSpan.setAttribute(
        "style",
        "display: inline-block; min-width: 32px; font-weight: 700; opacity: 0.95;",
      );
      scoreSpan.textContent = row.similarity.toFixed(2);
      const nameSpan = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      );
      nameSpan.textContent = ` — ${truncate(name, 70)}`;
      line.appendChild(scoreSpan);
      line.appendChild(nameSpan);

      // Override / Reset link
      const overrideLink = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "a",
      );
      overrideLink.setAttribute(
        "style",
        "margin-left: 8px; font-size: 10px; cursor: pointer; color: #3a7bd5; text-decoration: underline;",
      );
      const isOverride = row.anchorContentHash === "(override)";
      overrideLink.textContent = isOverride
        ? currentLang() === "zh"
          ? "重置"
          : "reset"
        : currentLang() === "zh"
          ? "修正分数"
          : "edit";
      overrideLink.addEventListener("click", async (ev: Event) => {
        ev.preventDefault();
        if (isOverride) {
          try {
            const { api } = await import("../api");
            await api.clearScoreOverride(item.id, anchorID);
            await renderWhyRead(data);
          } catch (e) {
            Zotero.debug("[ZotRead] override reset failed: " + String(e));
          }
        } else {
          const win = (data.doc as any)?.defaultView ?? Zotero.getMainWindow();
          const promptText =
            currentLang() === "zh"
              ? `输入修正后的相关度（0.0 – 1.0），当前 ${row.similarity.toFixed(2)}：`
              : `Enter overridden relevance score (0.0 – 1.0). Current: ${row.similarity.toFixed(2)}`;
          const ans = (win as any)?.prompt?.(
            promptText,
            row.similarity.toFixed(2),
          );
          if (ans === null || ans === undefined) return;
          const num = parseFloat(String(ans).trim());
          if (!Number.isFinite(num)) return;
          try {
            const { api } = await import("../api");
            await api.setScoreOverride(item.id, anchorID, num);
            await renderWhyRead(data);
          } catch (e) {
            Zotero.debug("[ZotRead] override save failed: " + String(e));
          }
        }
      });
      line.appendChild(overrideLink);

      if (row.rationale) {
        const rat = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        rat.setAttribute(
          "style",
          "margin-left: 40px; opacity: 0.6; font-style: italic; font-size: 10px;",
        );
        rat.textContent = row.rationale;
        line.appendChild(rat);
      }
      divider.appendChild(line);
    }
    root.appendChild(divider);
  }
}

function bucketFromSimilarity(
  sim: number,
  s: Strings,
): { label: string; color: string } {
  if (sim >= 0.7) return { label: s.buckets.high, color: "#d04a35" };
  if (sim >= 0.5) return { label: s.buckets.mid, color: "#3a8f3a" };
  if (sim >= 0.3) return { label: s.buckets.low, color: "#a07500" };
  return { label: s.buckets.none, color: "#888" };
}

function appendPara(
  doc: Document,
  parent: Element,
  text: string,
  style: string,
): void {
  const p = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  p.setAttribute("style", `margin: 2px 0; ${style}`);
  p.textContent = text;
  parent.appendChild(p);
}

/**
 * Render a "Relevance: 0.85 [edit/reset]" row that lets the user override
 * the top-anchor score directly from the WhyRead pane (instead of
 * scrolling down to the breakdown).
 */
function appendScoreWithEdit(
  doc: Document,
  parent: Element,
  s: Strings,
  topRow: any,
  topAnchorID: number,
  item: Zotero.Item,
  data: RenderData,
): void {
  const lang = currentLang();
  const isOverride = topRow?.anchorContentHash === "(override)";
  const row = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  row.setAttribute("style", "margin: 2px 0; opacity: 0.8;");

  const lbl = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
  lbl.setAttribute("style", "font-weight: 700;");
  lbl.textContent = s.similarityLabel + " ";

  const val = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
  val.textContent = (topRow?.similarity ?? 0).toFixed(2);

  const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a");
  link.setAttribute(
    "style",
    "margin-left: 10px; font-size: 11px; cursor: pointer; color: #3a7bd5; text-decoration: underline;",
  );
  link.textContent = isOverride
    ? lang === "zh"
      ? "重置"
      : "reset"
    : lang === "zh"
      ? "修正分数"
      : "edit";
  link.addEventListener("click", async (ev: Event) => {
    ev.preventDefault();
    if (isOverride) {
      try {
        const { api } = await import("../api");
        await api.clearScoreOverride(item.id, topAnchorID);
        await renderWhyRead(data);
      } catch (e) {
        Zotero.debug("[ZotRead] override reset failed: " + String(e));
      }
      return;
    }
    const win = (data.doc as any)?.defaultView ?? Zotero.getMainWindow();
    const promptText =
      lang === "zh"
        ? `输入修正后的相关度（0.0 – 1.0），当前 ${(topRow?.similarity ?? 0).toFixed(2)}：`
        : `Enter overridden relevance score (0.0 – 1.0). Current: ${(topRow?.similarity ?? 0).toFixed(2)}`;
    const ans = (win as any)?.prompt?.(
      promptText,
      (topRow?.similarity ?? 0).toFixed(2),
    );
    if (ans === null || ans === undefined) return;
    const num = parseFloat(String(ans).trim());
    if (!Number.isFinite(num)) return;
    try {
      const { api } = await import("../api");
      await api.setScoreOverride(item.id, topAnchorID, num);
      await renderWhyRead(data);
    } catch (e) {
      Zotero.debug("[ZotRead] override save failed: " + String(e));
    }
  });

  row.appendChild(lbl);
  row.appendChild(val);
  row.appendChild(link);
  parent.appendChild(row);
}

function appendLabelValue(
  doc: Document,
  parent: Element,
  label: string,
  value: string,
  style: string,
): void {
  const p = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  p.setAttribute("style", `margin: 2px 0; ${style}`);
  const lbl = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
  lbl.setAttribute("style", "font-weight: 700;");
  lbl.textContent = label + " ";
  const val = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
  val.textContent = value;
  p.appendChild(lbl);
  p.appendChild(val);
  parent.appendChild(p);
}

function setText(
  doc: Document,
  parent: Element,
  text: string,
  color: string = "#888",
): void {
  const p = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  p.setAttribute("style", `color: ${color}; font-style: italic;`);
  p.textContent = text;
  parent.appendChild(p);
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

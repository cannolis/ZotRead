/**
 * Item-pane section "WhyRead" — concise rationale in the user's chosen
 * language (English or Simplified Chinese, pref `ui.language`).
 */

import {
  getEffectiveSimilarities,
  isAnchor,
} from "../services/db";
import { getActiveIdea, isIdeaVirtualID } from "./ideaAnchor";
import { getActiveAnchorIDs, getRankingMode } from "./rankingMode";
import { getPref } from "../utils/prefs";

const PANE_ID = "zotread-whyread";
const SECTION_CSS_ID = "zotread-whyread-body";
const METHOD = "llm-judge-v2";

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
    notCompared:
      "No score yet. Open Settings → ZotRead → Rescore all now.",
    closestPaperLabel: "Closest of your papers:",
    closestIdeaLabel: "Closest to your idea:",
    similarityLabel: "Similarity:",
    whyLabel: "Why:",
    breakdownLabel: "Per-paper breakdown:",
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
    isAnchor:
      "这是你标记的「我的论文」——其他论文会以它为参照来打分。",
    noAnchors:
      "还没有参照论文。右键一篇论文选「标记为我的论文」，或在设置里填写一条研究想法。",
    notCompared: "还没打分。请在「设置 → ZotRead → 重新打分」。",
    closestPaperLabel: "最相关的你的论文：",
    closestIdeaLabel: "最贴近你的研究想法：",
    similarityLabel: "相似度：",
    whyLabel: "判断依据：",
    breakdownLabel: "对每篇参照的打分：",
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
        icon: `chrome://${addonRef}/content/icons/favicon.png`,
      },
      sidenav: {
        l10nID: "item-section-zotread-sidenav-tooltip",
        icon: `chrome://${addonRef}/content/icons/favicon.png`,
      },
      onRender: (data: any) =>
        renderWhyRead(data).catch((e) =>
          Zotero.debug("[ZotRead] WhyRead onRender failed: " + String(e)),
        ),
      onItemChange: (data: any) =>
        renderWhyRead(data).catch((e) =>
          Zotero.debug("[ZotRead] WhyRead onItemChange failed: " + String(e)),
        ),
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

  const sims = await getEffectiveSimilarities(anchorIDs, item.id, METHOD);
  if (sims.size === 0) {
    setText(doc, root, s.notCompared, "#a07500");
    return;
  }

  const entries = Array.from(sims.entries()).sort(
    (a, b) => b[1].similarity - a[1].similarity,
  );
  const [topAnchorID, topRow] = entries[0];

  // Match the item-tree column: aggregated top-3 mean similarity.
  const simValues = entries.map(([, r]) => r.similarity);
  const topK = simValues.slice(0, Math.min(3, simValues.length));
  const aggregatedScore = topK.reduce((a, b) => a + b, 0) / topK.length;

  // Resolve title: paper vs idea (always the anchor with the highest single sim)
  let closestLabel: string;
  let closestValue: string;
  if (isIdeaVirtualID(topAnchorID)) {
    const idea = await getActiveIdea();
    const name =
      idea?.name || (currentLang() === "zh" ? "我的研究想法" : "My idea");
    closestLabel = s.closestIdeaLabel;
    closestValue = `${s.quoteOpen}${truncate(name, 60)}${s.quoteClose}`;
  } else {
    const a = await Zotero.Items.getAsync(topAnchorID);
    const title = (a?.getField("title") as string) || `Item ${topAnchorID}`;
    closestLabel = s.closestPaperLabel;
    closestValue = `${s.quoteOpen}${truncate(title, 80)}${s.quoteClose}`;
  }

  const verdict = bucketFromSimilarity(aggregatedScore, s);

  appendPara(
    doc,
    root,
    verdict.label,
    `font-weight: 600; font-size: 13px; color: ${verdict.color}; margin-bottom: 6px;`,
  );
  appendLabelValue(doc, root, closestLabel, closestValue, "color: #333;");
  appendLabelValue(
    doc,
    root,
    s.similarityLabel,
    aggregatedScore.toFixed(2),
    "color: #555;",
  );
  if (topRow.rationale) {
    appendLabelValue(
      doc,
      root,
      s.whyLabel,
      topRow.rationale,
      "color: #555; font-style: italic; margin-top: 4px;",
    );
  }

  if (entries.length > 1) {
    const divider = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    divider.setAttribute(
      "style",
      "margin-top: 10px; padding-top: 6px; border-top: 1px solid #ddd;",
    );
    const header = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    header.setAttribute(
      "style",
      "font-weight: 700; color: #666; font-size: 11px; margin-bottom: 4px;",
    );
    header.textContent = s.breakdownLabel;
    divider.appendChild(header);

    for (const [anchorID, row] of entries) {
      let name: string;
      if (isIdeaVirtualID(anchorID)) {
        const idea = await getActiveIdea();
        name = idea?.name || (currentLang() === "zh" ? "我的研究想法" : "My idea");
      } else {
        const a = await Zotero.Items.getAsync(anchorID);
        name = (a?.getField("title") as string) || `Item ${anchorID}`;
      }
      const line = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      );
      line.setAttribute(
        "style",
        "margin: 3px 0; color: #555; font-size: 11px;",
      );
      const scoreSpan = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      );
      scoreSpan.setAttribute(
        "style",
        "display: inline-block; min-width: 32px; font-weight: 700; color: #333;",
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
          const win =
            (data.doc as any)?.defaultView ??
            Zotero.getMainWindow();
          const promptText =
            currentLang() === "zh"
              ? `输入修正后的相似度（0.0 – 1.0），当前 ${row.similarity.toFixed(2)}：`
              : `Enter overridden similarity (0.0 – 1.0). Current: ${row.similarity.toFixed(2)}`;
          const ans = (win as any)?.prompt?.(
            promptText,
            row.similarity.toFixed(2),
          );
          if (ans === null || ans === undefined) return;
          const num = parseFloat(String(ans).trim());
          if (!Number.isFinite(num)) return;
          try {
            const { api } = await import("../api");
            await api.setScoreOverride(item.id, anchorID, num, "user");
            await renderWhyRead(data);
          } catch (e) {
            Zotero.debug("[ZotRead] override save failed: " + String(e));
          }
        }
      });
      line.appendChild(overrideLink);

      if (row.rationale) {
        const rat = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "div",
        );
        rat.setAttribute(
          "style",
          "margin-left: 40px; color: #888; font-style: italic; font-size: 10px;",
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

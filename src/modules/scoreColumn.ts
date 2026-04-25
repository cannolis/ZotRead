/**
 * Zotero item-tree column "相关度" — shows each paper's ZotRead score.
 *
 * Zotero's `dataProvider` must return synchronously, so we keep a
 * pre-populated in-memory score map and refresh it asynchronously
 * (on startup, after every readingQueue() pass, on demand).
 */

import { getEffectiveSimilarities } from "../services/db";
import { getActiveAnchorIDs } from "./rankingMode";

const COLUMN_KEY = "zotread-score";
const METHOD = "llm-judge-v2";

const scoreMap = new Map<number, number>(); // itemID → aggregated score
const tooltipMap = new Map<number, string>(); // itemID → per-anchor breakdown
let registered = false;
let registrationToken: string | null = null;

export async function registerScoreColumn(): Promise<void> {
  if (registered) return;
  const manager = (Zotero as any).ItemTreeManager;
  if (!manager || typeof manager.registerColumn !== "function") {
    Zotero.debug("[ZotRead] ItemTreeManager.registerColumn unavailable");
    return;
  }

  const pluginID = addon.data.config.addonID;

  registrationToken = await manager.registerColumn({
    dataKey: COLUMN_KEY,
    label: "相关度",
    pluginID,
    dataProvider: (item: Zotero.Item, _dataKey: string): string => {
      try {
        if (!item || !item.isRegularItem()) return "";
        const score = scoreMap.get(item.id);
        if (score === undefined || score <= 0) return "";
        return score.toFixed(3);
      } catch (_e) {
        return "";
      }
    },
    renderCell: (index: number, data: string, column: any) => {
      // Zotero passes cached XUL elements in; we build a div with a native
      // tooltip (title=) showing the per-anchor breakdown.
      const doc =
        (Zotero.getMainWindow() as any)?.document ??
        (globalThis as any).document;
      const cell = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      ) as HTMLElement;
      cell.className = `cell ${column?.className ?? ""}`;
      cell.textContent = data;
      // Pull tooltip text from the side map by row; Zotero's column API
      // doesn't expose the item directly here, so we use an alt path:
      // read the tree's rendered row.  Fallback to a generic hint.
      try {
        const tree = (Zotero as any).getActiveZoteroPane?.()?.itemsView;
        const item = tree?.getRow?.(index)?.ref;
        if (item?.id) {
          const tip = tooltipMap.get(item.id);
          if (tip) cell.setAttribute("title", tip);
        }
      } catch (_e) {
        /* non-fatal */
      }
      return cell;
    },
    flex: 1,
    minWidth: 60,
    defaultIn: ["default"],
    // zoteroPersist keys — without this Zotero may not expose column in sort UI
    zoteroPersist: ["width", "ordinal", "hidden", "sortActive", "sortDirection"],
  });

  registered = true;
  Zotero.debug("[ZotRead] score column registered: " + String(registrationToken));

  // Kick off an initial refresh asynchronously so the column isn't blank.
  refreshScoreMap().catch((e) =>
    Zotero.debug("[ZotRead] initial score refresh failed: " + String(e)),
  );
}

export async function unregisterScoreColumn(): Promise<void> {
  if (!registered) return;
  const manager = (Zotero as any).ItemTreeManager;
  try {
    if (registrationToken && typeof manager.unregisterColumn === "function") {
      await manager.unregisterColumn(registrationToken);
    }
  } catch (e) {
    Zotero.debug("[ZotRead] column unregister failed: " + String(e));
  }
  registered = false;
  registrationToken = null;
}

/**
 * Rebuild the score map from the pairwise-similarity cache + status table.
 * Applies the same top-3-mean aggregation the ranker uses, so the column
 * values match `readingQueue()`'s ordering.  Pure cache reads — no LLM.
 */
export async function refreshScoreMap(): Promise<number> {
  scoreMap.clear();
  tooltipMap.clear();
  const anchorIDs = await getActiveAnchorIDs();
  if (anchorIDs.length === 0) {
    redrawItemTrees();
    return 0;
  }

  const libID = Zotero.Libraries.userLibraryID;
  const allIDs = await Zotero.Items.getAllIDs(libID);
  const allItems = await Zotero.Items.getAsync(allIDs);
  const candidateItems = allItems.filter(
    (it) => it && it.isRegularItem() && !anchorIDs.includes(it.id),
  );

  let populated = 0;
  // Real paper anchors are the researcher's own papers — trivially 100% relevant.
  for (const anchorID of anchorIDs) {
    if (anchorID > 0) {
      scoreMap.set(anchorID, 1);
      populated += 1;
    }
  }

  // Pre-resolve anchor titles once so tooltip strings stay fast.
  const anchorTitles = new Map<number, string>();
  for (const anchorID of anchorIDs) {
    if (anchorID < 0) {
      anchorTitles.set(anchorID, "(idea)");
    } else {
      const a = await Zotero.Items.getAsync(anchorID);
      anchorTitles.set(
        anchorID,
        (a?.getField("title") as string) || `Item ${anchorID}`,
      );
    }
  }

  // Column shows PURE relevance — read/unread status is shown separately
  // via the status column, so the user can do two-level sorting.
  for (const candidate of candidateItems) {
    const rowMap = await getEffectiveSimilarities(
      anchorIDs,
      candidate.id,
      METHOD,
    );
    if (rowMap.size === 0) continue;
    const rows = Array.from(rowMap.entries()).sort(
      (a, b) => b[1].similarity - a[1].similarity,
    );
    const sims = rows.map(([, r]) => r.similarity);
    const top = sims.slice(0, Math.min(3, sims.length));
    const raw = top.reduce((s, v) => s + v, 0) / top.length;
    if (raw > 0) {
      scoreMap.set(candidate.id, raw);
      populated += 1;
      // Build tooltip: aggregate header + per-anchor lines.
      const lines: string[] = [`Aggregated: ${raw.toFixed(2)}`];
      for (const [anchorID, row] of rows) {
        const title = truncate(anchorTitles.get(anchorID) ?? "?", 50);
        lines.push(`  ${row.similarity.toFixed(2)} — ${title}`);
        if (row.rationale) lines.push(`    ${truncate(row.rationale, 80)}`);
      }
      tooltipMap.set(candidate.id, lines.join("\n"));
    }
  }

  Zotero.debug(`[ZotRead] score column refreshed: ${populated} rows populated`);
  redrawItemTrees();
  return populated;
}

export function setScoreEntry(itemID: number, score: number): void {
  if (score > 0) scoreMap.set(itemID, score);
  else scoreMap.delete(itemID);
}

export function clearScoreMap(): void {
  scoreMap.clear();
  tooltipMap.clear();
  redrawItemTrees();
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/**
 * Force the item tree to redraw so the column picks up fresh values.
 */
export function redrawItemTrees(): void {
  try {
    const panes = Zotero.getMainWindows()
      .map((win) => (win as any).ZoteroPane)
      .filter(Boolean);
    for (const pane of panes) {
      const view = pane.itemsView;
      if (view?.refreshAndMaintainSelection) {
        Promise.resolve(view.refreshAndMaintainSelection()).catch(() => undefined);
      } else if (view?.tree?.invalidate) {
        view.tree.invalidate();
      } else if (view?.refresh) {
        Promise.resolve(view.refresh()).catch(() => undefined);
      }
    }
  } catch (e) {
    Zotero.debug("[ZotRead] redrawItemTrees failed: " + String(e));
  }
}

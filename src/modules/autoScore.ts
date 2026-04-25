/**
 * Listens for new items landing in the library and automatically:
 *   1. generates a summary for the item
 *   2. computes similarity against every current anchor
 *   3. refreshes the score / status columns so the UI reflects the new row
 *
 * Throttled: new items get added to a Set and a single drain loop
 * processes them one at a time with a short gap to keep the UI
 * responsive and avoid bursting LLM calls.
 */

import { ensureSummary } from "./summarizer";
import { computeSimilarityBatchByIDs } from "./similarity";
import { refreshScoreMap } from "./scoreColumn";
import { refreshStatusMap } from "./statusColumn";
import { getActiveAnchorIDs } from "./rankingMode";

const DRAIN_GAP_MS = 500;
const NOTIFIER_ID = "zotread-autoscore";

const pending = new Set<number>();
let draining = false;
let observerHandle: string | null = null;

/**
 * Register a Zotero notifier.  Returns the handle so callers can
 * unregister on shutdown.
 */
export function registerAutoScore(): string | null {
  if (observerHandle) return observerHandle;
  try {
    observerHandle = Zotero.Notifier.registerObserver(
      {
        notify: async (
          event: string,
          type: string,
          ids: Array<string | number>,
          _extraData: Record<string, unknown>,
        ) => {
          if (type !== "item") return;
          if (event !== "add" && event !== "modify") return;
          const numeric = ids
            .map((x) => (typeof x === "number" ? x : parseInt(x, 10)))
            .filter((x) => Number.isFinite(x));
          if (!numeric.length) return;
          enqueue(numeric);
        },
      },
      ["item"],
      NOTIFIER_ID,
    );
    Zotero.debug(`[ZotRead] autoscore observer registered: ${observerHandle}`);
  } catch (e) {
    Zotero.debug("[ZotRead] autoscore register failed: " + String(e));
  }
  return observerHandle;
}

export function unregisterAutoScore(): void {
  if (!observerHandle) return;
  try {
    Zotero.Notifier.unregisterObserver(observerHandle);
  } catch (e) {
    Zotero.debug("[ZotRead] autoscore unregister failed: " + String(e));
  }
  observerHandle = null;
}

function enqueue(ids: number[]): void {
  for (const id of ids) pending.add(id);
  if (!draining) {
    drain().catch((e) =>
      Zotero.debug("[ZotRead] autoscore drain crashed: " + String(e)),
    );
  }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    let processed = 0;
    while (pending.size > 0) {
      const itemID = pending.values().next().value as number;
      pending.delete(itemID);
      try {
        await processOne(itemID);
        processed += 1;
      } catch (e) {
        Zotero.debug(
          `[ZotRead] autoscore failed for ${itemID}: ${String(e).slice(0, 200)}`,
        );
      }
      await sleep(DRAIN_GAP_MS);
    }
    if (processed > 0) {
      await refreshScoreMap();
      await refreshStatusMap();
      Zotero.debug(`[ZotRead] autoscore drain done, processed ${processed}`);
    }
  } finally {
    draining = false;
  }
}

async function processOne(itemID: number): Promise<void> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isRegularItem()) return;

  // Eagerly summarize the new item (or re-summarize if content changed).
  await ensureSummary(item);

  const anchorIDs = await getActiveAnchorIDs();
  if (!anchorIDs.length) return;

  // Skip if this item IS an anchor
  if (anchorIDs.includes(itemID)) return;

  // Honour the user-configured ranking scope: if a scope collection is
  // set and the new item is not inside it, skip pairwise scoring so
  // the ranking pipeline stays consistent with rescoreAll.
  const scopeID = readScopeCollectionID();
  if (scopeID > 0) {
    const inScope = (item.getCollections?.() ?? []).includes(scopeID);
    if (!inScope) {
      Zotero.debug(
        `[ZotRead] autoscore: item ${itemID} outside scope collection ${scopeID}, skipping`,
      );
      return;
    }
  }

  await computeSimilarityBatchByIDs(anchorIDs, item);
}

function readScopeCollectionID(): number {
  try {
    const raw = (Zotero.Prefs.get(
      "extensions.zotero.zotread.ranking.scopeCollectionID",
      true,
    ) as number | string | undefined) ?? 0;
    const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_e) {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

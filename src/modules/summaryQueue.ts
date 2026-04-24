/**
 * Background summary queue — opportunistically summarises items the
 * library contains but we don't yet have a cached summary for.
 *
 * Respects rate limits by running at most 1 LLM call at a time, with
 * a small delay between calls so Zotero UI stays responsive.
 */

import { ensureSummary } from "./summarizer";
import { getSummary } from "../services/db";

let running = false;
const DELAY_MS = 500;

export async function runBackfill(options: { maxItems?: number } = {}): Promise<{
  processed: number;
  skipped: number;
  failed: number;
}> {
  if (running) {
    return { processed: 0, skipped: 0, failed: 0 };
  }
  running = true;
  const stats = { processed: 0, skipped: 0, failed: 0 };
  try {
    const libID = Zotero.Libraries.userLibraryID;
    const ids = await Zotero.Items.getAllIDs(libID);
    const items = (await Zotero.Items.getAsync(ids)).filter((it) =>
      it && it.isRegularItem(),
    );
    const cap = options.maxItems ?? items.length;
    Zotero.debug(
      `[ZotRead] backfill: scanning ${items.length} items (cap ${cap})`,
    );

    for (let i = 0; i < items.length && stats.processed < cap; i += 1) {
      const it = items[i];
      const existing = await getSummary(it.id);
      if (existing) {
        stats.skipped += 1;
        continue;
      }
      try {
        await ensureSummary(it);
        stats.processed += 1;
        Zotero.debug(
          `[ZotRead] backfill: summarised #${it.id} "${String(
            it.getField("title"),
          ).slice(0, 60)}"`,
        );
      } catch (e) {
        stats.failed += 1;
        Zotero.debug(
          `[ZotRead] backfill: failed #${it.id}: ${String(e).slice(0, 200)}`,
        );
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  } finally {
    running = false;
  }
  Zotero.debug(
    `[ZotRead] backfill done: ${JSON.stringify(stats)}`,
  );
  return stats;
}

export function isBackfillRunning(): boolean {
  return running;
}

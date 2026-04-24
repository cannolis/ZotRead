/**
 * Startup migrations — runs once per Zotero launch.
 *
 * Currently:
 *   1. Drops rows from obsolete similarity methods (kept only current).
 *   2. If anchors exist but no similarity rows under the current method,
 *      kick off a rescoreAll in the background so the user doesn't have
 *      to trigger it manually after a rubric / model change.
 */

import { ensureSchema } from "../services/db";
import { SIMILARITY_METHOD } from "./similarity";

let migrationRan = false;

export async function runStartupMigrations(): Promise<void> {
  if (migrationRan) return;
  migrationRan = true;

  await ensureSchema();

  try {
    await dropObsoleteSimilarityRows();
  } catch (e) {
    Zotero.debug("[ZotRead] migration/drop failed: " + String(e));
  }

  // Kick off a cache warm if conditions call for it — deferred so we
  // don't block Zotero startup.
  setTimeout(() => {
    warmIfNeeded().catch((e) =>
      Zotero.debug("[ZotRead] migration/warm failed: " + String(e)),
    );
  }, 3000);
}

async function dropObsoleteSimilarityRows(): Promise<void> {
  const obsolete = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_similarity WHERE method != ?`,
    [SIMILARITY_METHOD],
  )) as number;
  if (!obsolete) return;

  await Zotero.DB.queryAsync(
    `DELETE FROM zotread_similarity WHERE method != ?`,
    [SIMILARITY_METHOD],
  );
  Zotero.debug(
    `[ZotRead] migration: dropped ${obsolete} similarity rows from obsolete methods`,
  );
}

async function warmIfNeeded(): Promise<void> {
  const anchorCount = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_anchor`,
  )) as number;
  if (!anchorCount) return;

  const freshCount = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_similarity WHERE method = ?`,
    [SIMILARITY_METHOD],
  )) as number;

  if (freshCount > 0) return; // cache has fresh rows, nothing to do

  Zotero.debug(
    `[ZotRead] migration: rubric/method changed → warming score cache`,
  );
  try {
    const { api } = await import("../api");
    const { ProgressToast } = await import("./toast");
    const pt = new ProgressToast(
      "ZotRead",
      "Rubric changed — warming score cache…",
    ).start();
    const report = await api.rescoreAll({
      onProgress: (p) =>
        pt.update(
          Math.floor((p.done / Math.max(p.total, 1)) * 100),
          `Scoring ${p.done}/${p.total}: ${truncate(p.title, 48)}`,
        ),
    });
    pt.finish(`Cache warmed — ${report.ranked} items ranked`);
    Zotero.debug(
      `[ZotRead] migration: cache warmed (${JSON.stringify(report)})`,
    );
  } catch (e) {
    Zotero.debug("[ZotRead] migration: rescoreAll failed: " + String(e));
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

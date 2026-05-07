/**
 * Startup migrations — runs once per Zotero launch.
 *
 * Drops rows from obsolete similarity methods (kept only current).
 * Does NOT auto-rescore — that would surprise users with a token-spending
 * job on every Zotero launch. The user triggers rescore manually from
 * the settings pane after reviewing the scope and item count.
 */

import { ensureSchema } from "../services/db";
import { SIMILARITY_METHOD_PREFIX } from "./similarity";
import { extractForSummary } from "../services/textExtractor";
import { sha256Hex } from "../services/hash";

let migrationRan = false;

export async function runStartupMigrations(): Promise<void> {
  if (migrationRan) return;
  migrationRan = true;

  await ensureSchema();

  try {
    await tagLegacyMethodWithLanguage();
  } catch (e) {
    Zotero.debug("[ZotRead] migration/tag-language failed: " + String(e));
  }

  try {
    await dropObsoleteSimilarityRows();
  } catch (e) {
    Zotero.debug("[ZotRead] migration/drop failed: " + String(e));
  }

  try {
    await rehashSummariesToStableAlgorithm();
  } catch (e) {
    Zotero.debug("[ZotRead] migration/rehash failed: " + String(e));
  }
}

/**
 * Pre-language-split rows used method = "llm-judge-v3" (no suffix). Their
 * rationales were always English (the prompt only had an EN template),
 * so retag them as -en to preserve cache hits for English-UI users.
 * Chinese-UI users will get an LLM re-run for the Chinese rationale, but
 * the English variant remains cached so toggling language back is free.
 */
async function tagLegacyMethodWithLanguage(): Promise<void> {
  const legacy = SIMILARITY_METHOD_PREFIX; // bare, no -zh/-en suffix
  const n = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_similarity WHERE method = ?`,
    [legacy],
  )) as number;
  if (!n) return;
  await Zotero.DB.queryAsync(
    `UPDATE zotread_similarity SET method = ? WHERE method = ?`,
    [`${legacy}-en`, legacy],
  );
  Zotero.debug(`[ZotRead] migration: tagged ${n} legacy rows as -en`);
}

async function dropObsoleteSimilarityRows(): Promise<void> {
  // Keep every row whose method starts with the current prefix — different
  // suffixes (-zh, -en, future variants) coexist as separate caches and
  // must not be dropped just because one of them is "active" right now.
  const pattern = `${SIMILARITY_METHOD_PREFIX}-%`;
  const obsolete = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_similarity WHERE method NOT LIKE ?`,
    [pattern],
  )) as number;
  if (!obsolete) return;

  await Zotero.DB.queryAsync(
    `DELETE FROM zotread_similarity WHERE method NOT LIKE ?`,
    [pattern],
  );
  Zotero.debug(
    `[ZotRead] migration: dropped ${obsolete} similarity rows from obsolete methods`,
  );
}

/**
 * One-shot migration to upgrade rows whose contentHash was computed by an
 * older algorithm (e.g. when it included PDF-extracted introduction text,
 * which is non-deterministic). For each summary row, recompute the hash
 * using the current (stable) algorithm — title + abstract only — and, if
 * different, update the row AND every similarity row whose
 * anchorContentHash / candidateContentHash referenced the old hash.
 *
 * This is idempotent: rows already on the current algorithm are skipped,
 * so the migration becomes a no-op on subsequent launches.
 */
async function rehashSummariesToStableAlgorithm(): Promise<void> {
  const rows = (await Zotero.DB.queryAsync(
    `SELECT itemID, contentHash FROM zotread_summary`,
  )) as { itemID: number; contentHash: string }[];
  if (!rows?.length) return;

  let upgraded = 0;
  for (const row of rows) {
    const item = await Zotero.Items.getAsync(row.itemID).catch(() => null);
    if (!item) continue;
    let extracted;
    try {
      extracted = await extractForSummary(item);
    } catch (_e) {
      continue;
    }
    const stable = `${extracted.title}\n${extracted.abstract}`.trim();
    const newHash = await sha256Hex(stable || extracted.full || "");
    if (newHash === row.contentHash) continue;

    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `UPDATE zotread_summary SET contentHash = ? WHERE itemID = ?`,
        [newHash, row.itemID],
      );
      await Zotero.DB.queryAsync(
        `UPDATE zotread_similarity
            SET anchorContentHash = ?
          WHERE anchorItemID = ? AND anchorContentHash = ?`,
        [newHash, row.itemID, row.contentHash],
      );
      await Zotero.DB.queryAsync(
        `UPDATE zotread_similarity
            SET candidateContentHash = ?
          WHERE candidateItemID = ? AND candidateContentHash = ?`,
        [newHash, row.itemID, row.contentHash],
      );
    });
    upgraded += 1;
  }

  if (upgraded > 0) {
    Zotero.debug(
      `[ZotRead] migration: rehashed ${upgraded}/${rows.length} summaries to stable algorithm`,
    );
  }

  // Catch-all: any similarity row whose anchorContentHash /
  // candidateContentHash disagrees with the current summary.contentHash
  // for the same itemID is stale (e.g. that summary was rehashed in a
  // PRIOR launch but the similarity row was written under the old hash
  // by an even earlier run, so the per-row update above never ran for
  // it). Force-sync them.
  const aFix = (await Zotero.DB.queryAsync(
    `SELECT COUNT(*) AS n FROM zotread_similarity sim
       JOIN zotread_summary s ON s.itemID = sim.anchorItemID
      WHERE sim.anchorContentHash <> s.contentHash`,
  )) as { n: number }[];
  const cFix = (await Zotero.DB.queryAsync(
    `SELECT COUNT(*) AS n FROM zotread_similarity sim
       JOIN zotread_summary s ON s.itemID = sim.candidateItemID
      WHERE sim.candidateContentHash <> s.contentHash`,
  )) as { n: number }[];
  const aN = (aFix?.[0]?.n as number) ?? 0;
  const cN = (cFix?.[0]?.n as number) ?? 0;
  if (aN > 0) {
    await Zotero.DB.queryAsync(
      `UPDATE zotread_similarity
          SET anchorContentHash = (
            SELECT contentHash FROM zotread_summary
             WHERE zotread_summary.itemID = zotread_similarity.anchorItemID
          )
        WHERE EXISTS (
          SELECT 1 FROM zotread_summary
           WHERE zotread_summary.itemID = zotread_similarity.anchorItemID
             AND zotread_summary.contentHash <> zotread_similarity.anchorContentHash
        )`,
    );
  }
  if (cN > 0) {
    await Zotero.DB.queryAsync(
      `UPDATE zotread_similarity
          SET candidateContentHash = (
            SELECT contentHash FROM zotread_summary
             WHERE zotread_summary.itemID = zotread_similarity.candidateItemID
          )
        WHERE EXISTS (
          SELECT 1 FROM zotread_summary
           WHERE zotread_summary.itemID = zotread_similarity.candidateItemID
             AND zotread_summary.contentHash <> zotread_similarity.candidateContentHash
        )`,
    );
  }
  if (aN + cN > 0) {
    Zotero.debug(
      `[ZotRead] migration: synced ${aN} stale anchorContentHash + ${cN} stale candidateContentHash rows in zotread_similarity`,
    );
  }
}

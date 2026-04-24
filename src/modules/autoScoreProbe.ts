/**
 * Autoscore probe — a headless test the harness can trigger over SSH.
 *
 * When the pref `debug.probeArxivID` is non-empty, we:
 *   1. snapshot current summary / similarity counts
 *   2. import the specified arXiv paper (or a default)
 *   3. wait for the autoscore notifier chain to finish
 *   4. snapshot counts again and dump the diff to a file
 *
 * This lets an SSH caller verify "import new item → automatic
 * summary + similarity computation" end-to-end without the GUI.
 */

import { getPref, setPref } from "../utils/prefs";
import { api } from "../api";

const RESULT_FILE = "zotread-autoscore-probe.json";
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_TRIES = 60; // 2 minutes

export async function maybeRunAutoscoreProbe(): Promise<void> {
  const probe = (getPref("debug.probeArxivID") as string) || "";
  if (!probe.trim()) return;

  Zotero.debug(`[ZotRead] autoscore probe starting for: ${probe}`);
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    probe,
  };

  try {
    // Count tables before
    const before = await countTables();
    report.before = before;

    const anchors = await Zotero.DB.queryAsync(
      "SELECT itemID FROM zotread_anchor",
    );
    const anchorCount = Array.isArray(anchors) ? anchors.length : 0;
    report.anchorCount = anchorCount;

    // Trigger import
    const ids = probe.split(",").map((s) => s.trim()).filter(Boolean);
    const imported = await api.importArxiv(ids);
    report.imported = imported;

    // Poll for DB growth
    let tries = 0;
    let after = before;
    while (tries < POLL_MAX_TRIES) {
      after = await countTables();
      const summaryGrew = after.summary >= before.summary + ids.length;
      const expectedSimilarity =
        before.similarity + ids.length * anchorCount;
      const similarityGrew = after.similarity >= expectedSimilarity;
      if (summaryGrew && similarityGrew) {
        Zotero.debug(
          `[ZotRead] autoscore probe: drain complete after ${tries + 1} polls`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      tries += 1;
    }
    report.after = after;
    report.summaryDelta = after.summary - before.summary;
    report.similarityDelta = after.similarity - before.similarity;
    report.polls = tries + 1;

    // Fetch what the column now shows for the imported items
    report.scores = await Promise.all(
      imported.map(async (row) => ({
        itemID: row.itemID,
        title: row.title,
        score: await api.scoreOf(row.itemID),
      })),
    );

    report.finishedAt = new Date().toISOString();
    await writeReport(report);

    // Clear the pref so probe doesn't fire again next startup
    setPref("debug.probeArxivID", "");
    Zotero.debug("[ZotRead] autoscore probe finished; pref cleared");
  } catch (e) {
    (report as Record<string, unknown>).error = String(e);
    (report as Record<string, unknown>).stack =
      e instanceof Error ? e.stack : undefined;
    await writeReport(report);
    Zotero.debug(`[ZotRead] autoscore probe failed: ${String(e)}`);
  }
}

async function countTables(): Promise<{ summary: number; similarity: number }> {
  const s = (await Zotero.DB.valueQueryAsync(
    "SELECT COUNT(*) FROM zotread_summary",
  )) as number;
  const m = (await Zotero.DB.valueQueryAsync(
    "SELECT COUNT(*) FROM zotread_similarity",
  )) as number;
  return { summary: s ?? 0, similarity: m ?? 0 };
}

async function writeReport(report: unknown): Promise<void> {
  const profileDir =
    (PathUtils as unknown as { profileDir?: string }).profileDir ??
    (Services.dirsvc.get("ProfD", Components.interfaces.nsIFile) as any).path;
  const path = PathUtils.join(profileDir, RESULT_FILE);
  await IOUtils.writeUTF8(path, JSON.stringify(report, null, 2));
  Zotero.debug(`[ZotRead] autoscore probe: wrote ${path}`);
}

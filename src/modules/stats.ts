/**
 * Read-only stats over the ZotRead tables.  Cheap aggregate queries —
 * meant to power the Settings status panel.
 */

import { ensureSchema } from "../services/db";
import { SIMILARITY_METHOD_PREFIX } from "./similarity";

export interface ZotReadStats {
  anchors: number;
  ideas: number;
  summaries: number;
  similarities: number;
  readThisWeek: number;
  readThisMonth: number;
  readTotal: number;
  readingNow: number;
  computedAt: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function getStats(): Promise<ZotReadStats> {
  await ensureSchema();
  const now = Date.now();

  const [
    anchors,
    ideas,
    summaries,
    similarities,
    readThisWeek,
    readThisMonth,
    readTotal,
    readingNow,
  ] = await Promise.all([
    countQuery("SELECT COUNT(*) FROM zotread_anchor"),
    countQuery("SELECT COUNT(*) FROM zotread_idea"),
    countQuery("SELECT COUNT(*) FROM zotread_summary"),
    countQuery("SELECT COUNT(*) FROM zotread_similarity WHERE method LIKE ?", [
      `${SIMILARITY_METHOD_PREFIX}-%`,
    ]),
    countQuery(
      "SELECT COUNT(*) FROM zotread_status WHERE status = ? AND updatedAt > ?",
      ["read", now - WEEK_MS],
    ),
    countQuery(
      "SELECT COUNT(*) FROM zotread_status WHERE status = ? AND updatedAt > ?",
      ["read", now - MONTH_MS],
    ),
    countQuery("SELECT COUNT(*) FROM zotread_status WHERE status = ?", [
      "read",
    ]),
    countQuery("SELECT COUNT(*) FROM zotread_status WHERE status = ?", [
      "reading",
    ]),
  ]);

  return {
    anchors,
    ideas,
    summaries,
    similarities,
    readThisWeek,
    readThisMonth,
    readTotal,
    readingNow,
    computedAt: new Date(now).toISOString(),
  };
}

async function countQuery(sql: string, args: unknown[] = []): Promise<number> {
  try {
    const v = (await Zotero.DB.valueQueryAsync(sql, args)) as number;
    return Number.isFinite(v) ? v : 0;
  } catch (_e) {
    return 0;
  }
}

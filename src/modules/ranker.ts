/**
 * Ranker — aggregates pairwise similarities into a per-candidate score,
 * applies read-status weighting, and returns a sorted reading queue.
 */

import {
  getAllStatuses,
  getEffectiveSimilarities,
  ItemStatus,
} from "../services/db";
import {
  computeSimilarityBatchByIDs,
  SimilarityResult,
  SimilarityRole,
} from "./similarity";
import { getActiveAnchorIDs, getRankingMode } from "./rankingMode";

export type Aggregation = "top3-mean" | "max" | "mean";

export interface RankProgress {
  done: number;
  total: number;
  itemID: number;
  title: string;
}

export interface RankOptions {
  anchorSubset?: number[]; // restrict to these anchor itemIDs
  candidates?: number[]; // optional explicit candidate list; else whole user library
  limit?: number; // default 50
  aggregation?: Aggregation; // default top3-mean
  includeRead?: boolean; // default false (still listed but at bottom)
  includeArchived?: boolean; // default false (excluded)
  onProgress?: (p: RankProgress) => void;
}

export interface AnchorBreakdown {
  anchorItemID: number;
  similarity: number;
  role: SimilarityRole;
  rationale: string;
}

export interface RankedItem {
  itemID: number;
  title: string;
  score: number; // final, status-weighted
  rawScore: number; // pre-status aggregate
  status: ItemStatus;
  topAnchors: AnchorBreakdown[]; // the anchors that contributed most
}

const STATUS_MULTIPLIER: Record<ItemStatus, number> = {
  unread: 1,
  reading: 0.8,
  skipped: 0.5,
  read: 0.2,
  archived: 0,
};

export async function rankReadingQueue(
  opts: RankOptions = {},
): Promise<RankedItem[]> {
  const aggregation: Aggregation = opts.aggregation ?? "top3-mean";
  const limit = opts.limit ?? 50;

  const allAnchorIDs = await getActiveAnchorIDs();
  const anchorIDs = opts.anchorSubset?.length
    ? opts.anchorSubset.filter((id) => allAnchorIDs.includes(id))
    : allAnchorIDs;
  if (anchorIDs.length === 0) {
    Zotero.debug(
      "[ZotRead] rankReadingQueue: no anchors for mode=" + getRankingMode(),
    );
    return [];
  }

  const candidateItems = await loadCandidates(opts, new Set(anchorIDs));
  Zotero.debug(
    `[ZotRead] rankReadingQueue: mode=${getRankingMode()} ${anchorIDs.length} anchors × ${candidateItems.length} candidates`,
  );

  const statuses = await getAllStatuses();
  const results: RankedItem[] = [];
  const total = candidateItems.length;
  let done = 0;

  for (const candidate of candidateItems) {
    done += 1;
    opts.onProgress?.({
      done,
      total,
      itemID: candidate.id,
      title: (candidate.getField("title") as string) || `Item ${candidate.id}`,
    });
    const status = statuses.get(candidate.id)?.status ?? "unread";
    if (status === "archived" && !opts.includeArchived) continue;

    let sims: SimilarityResult[] = [];
    try {
      sims = await computeSimilarityBatchByIDs(anchorIDs, candidate);
    } catch (e) {
      Zotero.debug(
        `[ZotRead] similarity failed for candidate ${candidate.id}: ${String(e)}`,
      );
      continue;
    }

    const rawScore = aggregate(sims.map((s) => s.similarity), aggregation);
    const multiplier = STATUS_MULTIPLIER[status] ?? 1;
    const finalScore = rawScore * multiplier;

    if (status === "read" && !opts.includeRead && finalScore < 0.15) continue;

    const topAnchors: AnchorBreakdown[] = [...sims]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map((s) => ({
        anchorItemID: s.anchorItemID,
        similarity: s.similarity,
        role: s.role,
        rationale: s.rationale,
      }));

    results.push({
      itemID: candidate.id,
      title: (candidate.getField("title") as string) || "(untitled)",
      score: finalScore,
      rawScore,
      status,
      topAnchors,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(1, limit));
}

function aggregate(values: number[], mode: Aggregation): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  switch (mode) {
    case "max":
      return sorted[0];
    case "mean":
      return sorted.reduce((s, v) => s + v, 0) / sorted.length;
    case "top3-mean":
    default: {
      const take = sorted.slice(0, Math.min(3, sorted.length));
      return take.reduce((s, v) => s + v, 0) / take.length;
    }
  }
}

async function loadCandidates(
  opts: RankOptions,
  anchorSet: Set<number>,
): Promise<Zotero.Item[]> {
  let items: Zotero.Item[];
  if (opts.candidates?.length) {
    items = await Zotero.Items.getAsync(
      opts.candidates.filter((id) => id > 0),
    );
  } else {
    const scopeID = readScopeCollectionID();
    if (scopeID > 0) {
      const coll = Zotero.Collections.get(scopeID) as
        | Zotero.Collection
        | false
        | undefined;
      if (coll) {
        items = coll.getChildItems() ?? [];
      } else {
        Zotero.debug(
          `[ZotRead] scope collection ${scopeID} not found, falling back to library`,
        );
        const libID = Zotero.Libraries.userLibraryID;
        const ids = await Zotero.Items.getAllIDs(libID);
        items = await Zotero.Items.getAsync(ids);
      }
    } else {
      const libID = Zotero.Libraries.userLibraryID;
      const ids = await Zotero.Items.getAllIDs(libID);
      items = await Zotero.Items.getAsync(ids);
    }
  }
  return items.filter(
    (it) => it && it.isRegularItem() && !anchorSet.has(it.id),
  );
}

function readScopeCollectionID(): number {
  // Lazy require to avoid circular import with prefs util
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

/**
 * Small helper for UI layers: map itemID → its latest score by re-running
 * a cached-only pass (no new LLM calls).  Returns 0 for items that have
 * never been compared.
 */
export async function getCachedScore(
  itemID: number,
  opts: Pick<RankOptions, "anchorSubset" | "aggregation"> = {},
): Promise<{ score: number; breakdown: AnchorBreakdown[] }> {
  const aggregation = opts.aggregation ?? "top3-mean";
  const allAnchorIDs = await getActiveAnchorIDs();
  const anchorIDs = opts.anchorSubset?.length
    ? opts.anchorSubset.filter((id) => allAnchorIDs.includes(id))
    : allAnchorIDs;
  if (anchorIDs.length === 0) return { score: 0, breakdown: [] };

  const rows = await getEffectiveSimilarities(
    anchorIDs,
    itemID,
    "llm-judge-v2",
  );
  const values: number[] = [];
  const breakdown: AnchorBreakdown[] = [];
  for (const [anchorID, row] of rows) {
    values.push(row.similarity);
    breakdown.push({
      anchorItemID: anchorID,
      similarity: row.similarity,
      role: (row.role as SimilarityRole) ?? "unrelated",
      rationale: row.rationale ?? "",
    });
  }
  return {
    score: aggregate(values, aggregation),
    breakdown: breakdown.sort((a, b) => b.similarity - a.similarity).slice(0, 3),
  };
}


/**
 * Pairwise anchor × candidate similarity — cached in SQLite.
 *
 * The LLM receives pre-computed SUMMARIES (not raw abstracts), keeping
 * per-call token footprint small and results stable.
 */

import { chatJSON } from "../services/llm";
import {
  getSimilarity,
  getSimilarityMap,
  saveSimilarity,
  SimilarityRow,
} from "../services/db";
import { ensureSummary, PaperSummary, SummaryRecord } from "./summarizer";
import {
  ensureIdeaSummary,
  ideaIDFromVirtual,
  isIdeaVirtualID,
} from "./ideaAnchor";

export const SIMILARITY_METHOD = "llm-judge-v2";
const LLM_SEED = 42;

export type SimilarityRole =
  | "same-problem"
  | "similar-method"
  | "shared-theory"
  | "adjacent-field"
  | "unrelated";

export interface SimilarityResult {
  anchorItemID: number;
  candidateItemID: number;
  similarity: number; // 0..1
  rationale: string;
  role: SimilarityRole;
  cached: boolean;
}

export async function computeSimilarity(
  anchorItem: Zotero.Item,
  candidateItem: Zotero.Item,
): Promise<SimilarityResult> {
  if (anchorItem.id === candidateItem.id) {
    return self();
  }
  const [anchorRec, candidateRec] = await Promise.all([
    ensureSummary(anchorItem),
    ensureSummary(candidateItem),
  ]);

  const cached = await getSimilarity(
    anchorItem.id,
    candidateItem.id,
    SIMILARITY_METHOD,
  );
  if (
    cached &&
    cached.anchorContentHash === anchorRec.contentHash &&
    cached.candidateContentHash === candidateRec.contentHash
  ) {
    return fromRow(cached, true);
  }

  const verdict = await askLLM(anchorRec, candidateRec);
  await saveSimilarity({
    anchorItemID: anchorItem.id,
    candidateItemID: candidateItem.id,
    anchorContentHash: anchorRec.contentHash,
    candidateContentHash: candidateRec.contentHash,
    method: SIMILARITY_METHOD,
    similarity: verdict.similarity,
    rationale: verdict.rationale,
    role: verdict.role,
  });
  return {
    anchorItemID: anchorItem.id,
    candidateItemID: candidateItem.id,
    similarity: verdict.similarity,
    rationale: verdict.rationale,
    role: verdict.role,
    cached: false,
  };

  function self(): SimilarityResult {
    return {
      anchorItemID: anchorItem.id,
      candidateItemID: candidateItem.id,
      similarity: 1,
      rationale: "identical item",
      role: "same-problem",
      cached: true,
    };
  }
}

/**
 * Batch helper: given one candidate and many anchors (by ID — may mix
 * positive Zotero item IDs and negative synthetic idea IDs), load cached
 * pairs where possible and only LLM-call the misses.
 */
export async function computeSimilarityBatch(
  anchorItems: Zotero.Item[],
  candidateItem: Zotero.Item,
): Promise<SimilarityResult[]> {
  return computeSimilarityBatchByIDs(
    anchorItems.map((a) => a.id),
    candidateItem,
  );
}

export async function computeSimilarityBatchByIDs(
  anchorIDs: number[],
  candidateItem: Zotero.Item,
): Promise<SimilarityResult[]> {
  if (anchorIDs.length === 0) return [];

  const candidateRec = await ensureSummary(candidateItem);
  const anchorRecs = new Map<number, SummaryRecord>();
  for (const id of anchorIDs) {
    const rec = await resolveAnchorSummary(id);
    if (rec) anchorRecs.set(id, rec);
  }

  const existing = await getSimilarityMap(
    Array.from(anchorRecs.keys()),
    candidateItem.id,
    SIMILARITY_METHOD,
  );

  const results: SimilarityResult[] = [];
  for (const [anchorID, anchorRec] of anchorRecs) {
    const row = existing.get(anchorID);
    if (
      row &&
      row.anchorContentHash === anchorRec.contentHash &&
      row.candidateContentHash === candidateRec.contentHash
    ) {
      results.push(fromRow(row, true));
      continue;
    }
    const verdict = await askLLM(anchorRec, candidateRec);
    await saveSimilarity({
      anchorItemID: anchorID,
      candidateItemID: candidateItem.id,
      anchorContentHash: anchorRec.contentHash,
      candidateContentHash: candidateRec.contentHash,
      method: SIMILARITY_METHOD,
      similarity: verdict.similarity,
      rationale: verdict.rationale,
      role: verdict.role,
    });
    results.push({
      anchorItemID: anchorID,
      candidateItemID: candidateItem.id,
      similarity: verdict.similarity,
      rationale: verdict.rationale,
      role: verdict.role,
      cached: false,
    });
  }
  return results;
}

async function resolveAnchorSummary(
  anchorID: number,
): Promise<SummaryRecord | null> {
  if (isIdeaVirtualID(anchorID)) {
    try {
      return await ensureIdeaSummary(ideaIDFromVirtual(anchorID));
    } catch (e) {
      Zotero.debug(
        `[ZotRead] idea anchor ${anchorID} skipped: ${String(e)}`,
      );
      return null;
    }
  }
  const item = await Zotero.Items.getAsync(anchorID);
  if (!item || !item.isRegularItem()) return null;
  return ensureSummary(item);
}

async function askLLM(
  anchor: SummaryRecord,
  candidate: SummaryRecord,
): Promise<{
  similarity: number;
  rationale: string;
  role: SimilarityRole;
}> {
  const prompt = buildPrompt(anchor.summary, candidate.summary);
  const raw = await chatJSON<{
    similarity: unknown;
    rationale: unknown;
    role: unknown;
  }>([{ role: "user", content: prompt }], {
    temperature: 0,
    maxTokens: 200,
    seed: LLM_SEED,
  });
  return normalizeVerdict(raw);
}

function buildPrompt(
  anchor: PaperSummary,
  candidate: PaperSummary,
): string {
  return [
    "You compare two papers for research-agenda similarity.",
    "",
    "PAPER A (already published by the researcher):",
    `  OneLine: ${anchor.oneLine || "(n/a)"}`,
    `  Problem: ${anchor.problem || "(n/a)"}`,
    `  Method:  ${anchor.method || "(n/a)"}`,
    `  Finding: ${anchor.finding || "(n/a)"}`,
    `  Domain:  ${anchor.domain || "(n/a)"}`,
    "",
    "PAPER B (candidate to consider reading):",
    `  OneLine: ${candidate.oneLine || "(n/a)"}`,
    `  Problem: ${candidate.problem || "(n/a)"}`,
    `  Method:  ${candidate.method || "(n/a)"}`,
    `  Finding: ${candidate.finding || "(n/a)"}`,
    `  Domain:  ${candidate.domain || "(n/a)"}`,
    "",
    "# SCORING RUBRIC (use these reference points as an absolute scale)",
    "  1.0  Near-duplicate — same paper restated or direct successor",
    "  0.9  Close extension — same method on same problem, slight variation",
    "  0.8  Same problem + closely related method",
    "  0.7  Same problem family, different method",
    "  0.6  Different problem but strongly shared methodology",
    "  0.5  Shared theoretical foundation, different application",
    "  0.4  Adjacent subfield, some overlap in concepts",
    "  0.3  Distant but same broader area",
    "  0.2  Only superficial keyword overlap",
    "  0.1  Token-level overlap only, no research substance",
    "  0.0  Unrelated",
    "",
    "Scoring discipline:",
    "  - Pick ONE rubric value; do not interpolate outside it.",
    "  - Ignore year / venue / citation count; judge content only.",
    "  - Be consistent: a paper scored 0.7 yesterday must score 0.7 today under the same rubric.",
    "",
    "Return ONLY a JSON object:",
    `{`,
    `  "similarity": number,   // one of: 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0`,
    `  "rationale":  string,   // ≤25 words, English, name the rubric bucket you chose`,
    `  "role":       "same-problem" | "similar-method" | "shared-theory" | "adjacent-field" | "unrelated"`,
    `}`,
  ].join("\n");
}

function normalizeVerdict(raw: {
  similarity: unknown;
  rationale: unknown;
  role: unknown;
}): {
  similarity: number;
  rationale: string;
  role: SimilarityRole;
} {
  const roles: SimilarityRole[] = [
    "same-problem",
    "similar-method",
    "shared-theory",
    "adjacent-field",
    "unrelated",
  ];
  let sim = Number(raw.similarity);
  if (!Number.isFinite(sim)) sim = 0;
  sim = Math.max(0, Math.min(1, sim));
  const role = roles.includes(raw.role as SimilarityRole)
    ? (raw.role as SimilarityRole)
    : "unrelated";
  const rationale = String(raw.rationale ?? "").slice(0, 300);
  return { similarity: sim, rationale, role };
}

function fromRow(row: SimilarityRow, cached: boolean): SimilarityResult {
  return {
    anchorItemID: row.anchorItemID,
    candidateItemID: row.candidateItemID,
    similarity: row.similarity,
    rationale: row.rationale ?? "",
    role: (row.role as SimilarityRole) ?? "unrelated",
    cached,
  };
}

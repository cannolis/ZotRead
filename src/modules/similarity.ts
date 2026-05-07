/**
 * Pairwise anchor × candidate similarity — cached in SQLite.
 *
 * The LLM receives pre-computed SUMMARIES (not raw abstracts), keeping
 * per-call token footprint small and results stable.
 */

import { chatJSON } from "../services/llm";
import {
  getOverridesFor,
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
import { currentLang, Lang } from "../utils/lang";

/**
 * Cache key prefix. The actual stored `method` value is suffixed with the
 * active language (`-zh` / `-en`) so Chinese and English rationales coexist
 * in the cache and never overwrite each other. Switching `ui.language`
 * reuses the matching language's cached rows; only the missing language
 * triggers fresh LLM calls.
 */
export const SIMILARITY_METHOD_PREFIX = "llm-judge-v3";
export function getSimilarityMethod(lang: Lang = currentLang()): string {
  return `${SIMILARITY_METHOD_PREFIX}-${lang}`;
}

// Kept exported for backward-compat with any external callers; resolves
// against the *currently active* language at access time.
export const SIMILARITY_METHOD = getSimilarityMethod();
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
  const lang = currentLang();
  const method = getSimilarityMethod(lang);
  const [anchorRec, candidateRec] = await Promise.all([
    ensureSummary(anchorItem),
    ensureSummary(candidateItem),
  ]);

  const cached = await getSimilarity(anchorItem.id, candidateItem.id, method);
  if (
    cached &&
    cached.anchorContentHash === anchorRec.contentHash &&
    cached.candidateContentHash === candidateRec.contentHash
  ) {
    return fromRow(cached, true);
  }

  const verdict = await askLLM(anchorRec, candidateRec, lang);
  await saveSimilarity({
    anchorItemID: anchorItem.id,
    candidateItemID: candidateItem.id,
    anchorContentHash: anchorRec.contentHash,
    candidateContentHash: candidateRec.contentHash,
    method,
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

  const lang = currentLang();
  const method = getSimilarityMethod(lang);

  const candidateRec = await ensureSummary(candidateItem);
  const anchorRecs = new Map<number, SummaryRecord>();
  for (const id of anchorIDs) {
    const rec = await resolveAnchorSummary(id);
    if (rec) anchorRecs.set(id, rec);
  }

  const existing = await getSimilarityMap(
    Array.from(anchorRecs.keys()),
    candidateItem.id,
    method,
  );
  const overrides = await getOverridesFor(candidateItem.id);

  const results: SimilarityResult[] = [];
  for (const [anchorID, anchorRec] of anchorRecs) {
    // User override always wins.
    const ov = overrides.get(anchorID);
    if (ov) {
      results.push({
        anchorItemID: anchorID,
        candidateItemID: candidateItem.id,
        similarity: ov.similarity,
        rationale: ov.note ?? "(user override)",
        role: "same-problem",
        cached: true,
      });
      continue;
    }

    const row = existing.get(anchorID);
    if (
      row &&
      row.anchorContentHash === anchorRec.contentHash &&
      row.candidateContentHash === candidateRec.contentHash
    ) {
      Zotero.debug(
        `[ZotRead/sim] HIT a=${anchorID} c=${candidateItem.id} aHash=${anchorRec.contentHash.slice(0, 12)} cHash=${candidateRec.contentHash.slice(0, 12)}`,
      );
      results.push(fromRow(row, true));
      continue;
    }
    Zotero.debug(
      `[ZotRead/sim] MISS a=${anchorID} c=${candidateItem.id} ` +
        (row
          ? `rowAHash=${row.anchorContentHash.slice(0, 12)} curAHash=${anchorRec.contentHash.slice(0, 12)} ` +
            `rowCHash=${row.candidateContentHash.slice(0, 12)} curCHash=${candidateRec.contentHash.slice(0, 12)}`
          : "no row"),
    );
    const verdict = await askLLM(anchorRec, candidateRec, lang);
    await saveSimilarity({
      anchorItemID: anchorID,
      candidateItemID: candidateItem.id,
      anchorContentHash: anchorRec.contentHash,
      candidateContentHash: candidateRec.contentHash,
      method,
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
      Zotero.debug(`[ZotRead] idea anchor ${anchorID} skipped: ${String(e)}`);
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
  lang: Lang,
): Promise<{
  similarity: number;
  rationale: string;
  role: SimilarityRole;
}> {
  const prompt = buildPrompt(anchor.summary, candidate.summary, lang);
  const raw = await chatJSON<{
    similarity: unknown;
    rationale: unknown;
    role: unknown;
  }>([{ role: "user", content: prompt }], {
    temperature: 0,
    maxTokens: 2000,
    seed: LLM_SEED,
  });
  return normalizeVerdict(raw);
}

function buildPrompt(
  anchor: PaperSummary,
  candidate: PaperSummary,
  lang: Lang,
): string {
  // Use unambiguous, user-facing labels in the prompt so the LLM's
  // rationale text references "我的论文 / 该论文" (zh) or
  // "my paper / this paper" (en) directly — avoids confusing
  // "Paper A / Paper B" wording in the WhyRead pane.
  const labels =
    lang === "zh"
      ? { anchor: "我的论文", candidate: "该论文" }
      : { anchor: "my paper", candidate: "this paper" };
  const rationaleSpec =
    lang === "zh"
      ? `string，2-3 句中文，按以下顺序：(1) 先描述「${labels.candidate}」的具体方法/发现/贡献；(2) 再描述「${labels.anchor}」的相应内容；(3) 最后说明两者如何相关（共享什么、差异在哪）。请直接使用「${labels.candidate}」「${labels.anchor}」这两个称呼，不要写"论文 A"或"论文 B"，也不要只复述 rubric 桶名。错误示例："同一问题族，不同方法。"正确示例："该论文用基于 Transformer 的序列编码器解决药物-靶点相互作用预测，强调分子序列上下文建模。我的论文用图注意力网络处理同样的问题，侧重分子结构的图表征。两者都聚焦药物-靶点交互预测，但分子特征化思路不同——序列建模 vs. 结构图建模。"`
      : `string. 2-3 sentences in English. Follow this order: (1) describe a specific method, finding, or contribution of "${labels.candidate}"; (2) then describe the corresponding aspect of "${labels.anchor}"; (3) close with how the two relate (shared ground vs. divergence). Use exactly those phrases — do not say "Paper A" or "Paper B" — and do not just restate the rubric bucket label. BAD: "Same problem family, different method." GOOD: "This paper applies transformer-based sequence encoders to drug-target interaction prediction, focusing on sequential context. My paper tackles the same task with graph attention networks, leveraging molecular graph structure. Both target drug-target interaction but differ in featurization — sequence modeling vs. structural graph modeling."`;
  return [
    "You compare two papers for research-agenda similarity.",
    "",
    `${labels.anchor.toUpperCase()} (already published by the researcher):`,
    `  OneLine: ${anchor.oneLine || "(n/a)"}`,
    `  Problem: ${anchor.problem || "(n/a)"}`,
    `  Method:  ${anchor.method || "(n/a)"}`,
    `  Finding: ${anchor.finding || "(n/a)"}`,
    `  Domain:  ${anchor.domain || "(n/a)"}`,
    "",
    `${labels.candidate.toUpperCase()} (candidate to consider reading):`,
    `  OneLine: ${candidate.oneLine || "(n/a)"}`,
    `  Problem: ${candidate.problem || "(n/a)"}`,
    `  Method:  ${candidate.method || "(n/a)"}`,
    `  Finding: ${candidate.finding || "(n/a)"}`,
    `  Domain:  ${candidate.domain || "(n/a)"}`,
    "",
    "# SCORING RUBRIC (use these reference points as an absolute scale)",
    "  1.0  Near-duplicate — same paper restated, direct successor, or one paper directly cites/extends the other on the SAME contribution",
    "  0.9  Both research target AND method are closely aligned (same task family, same methodological family). E.g. both apply transformer-based models to drug-target interaction.",
    "  0.8  Both research target AND method are clearly related (same task or near-twin task; methods share core technique even if details differ). E.g. one uses GAT, the other uses GraphSAGE, on the same prediction problem.",
    "  0.7  Either the target OR the method is shared; the other is in an adjacent neighborhood. E.g. same task, very different method paradigm; or same method paradigm applied to a related problem.",
    "  0.6  Shared methodology applied to a DIFFERENT problem within the same broad area.",
    "  0.5  Shared theoretical foundation, different application.",
    "  0.4  Adjacent subfield, some overlap in concepts.",
    "  0.3  Distant but same broader area.",
    "  0.2  Only superficial keyword overlap.",
    "  0.1  Token-level overlap only, no research substance.",
    "  0.0  Unrelated.",
    "",
    "Scoring discipline:",
    "  - Pick ONE rubric value; do not interpolate outside it.",
    "  - Ignore year / venue / citation count; judge content only.",
    "  - Be consistent: a paper scored 0.7 yesterday must score 0.7 today under the same rubric.",
    "  - Do NOT default to 0.7 as a 'safe middle'. If both research target AND method are clearly related, you must use 0.8 or 0.9. 0.7 is reserved for the case where exactly one of them is shared and the other is only adjacent.",
    "",
    "Return ONLY a JSON object:",
    `{`,
    `  "similarity": number,   // one of: 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0`,
    `  "rationale":  ${rationaleSpec}`,
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
  const rationale = String(raw.rationale ?? "").slice(0, 500);
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

/**
 * Paper summarizer — produces a structured per-paper record that the
 * similarity engine consumes.  Caches by (itemID, contentHash, model).
 */

import { chatJSON, readConfig } from "../services/llm";
import { extractForSummary } from "../services/textExtractor";
import { sha256Hex } from "../services/hash";
import {
  deleteSimilaritiesFor,
  getSummary,
  saveSummary,
  SummaryRow,
} from "../services/db";

export interface PaperSummary {
  oneLine: string;
  problem: string;
  method: string;
  finding: string;
  domain: string;
  keyTerms: string[];
}

export interface SummaryRecord {
  itemID: number;
  title: string;
  source: "pdf" | "abstract-only" | "title-only";
  summary: PaperSummary;
  contentHash: string;
  model: string;
  cached: boolean;
}

export async function ensureSummary(
  item: Zotero.Item,
  opts: { force?: boolean } = {},
): Promise<SummaryRecord> {
  const extracted = await extractForSummary(item);
  const contentHash = await sha256Hex(extracted.full || extracted.title || "");
  const { model } = readConfig();

  if (!opts.force) {
    const cached = await getSummary(item.id);
    if (cached && cached.contentHash === contentHash && cached.model === model) {
      return {
        itemID: item.id,
        title: extracted.title,
        source: extracted.source,
        summary: parseSummary(cached),
        contentHash,
        model,
        cached: true,
      };
    }
  }

  if (!extracted.full) {
    throw new Error(
      `Item ${item.id} has no summarizable text (no title, abstract, or PDF).`,
    );
  }

  const summary = await generateSummary(extracted.full);

  await saveSummary({
    itemID: item.id,
    contentHash,
    model,
    summary: JSON.stringify(summary),
    keyTerms: JSON.stringify(summary.keyTerms),
  });
  // Content changed → any prior similarity rows referencing this item are stale
  if (opts.force) {
    await deleteSimilaritiesFor(item.id);
  }

  return {
    itemID: item.id,
    title: extracted.title,
    source: extracted.source,
    summary,
    contentHash,
    model,
    cached: false,
  };
}

function parseSummary(row: SummaryRow): PaperSummary {
  try {
    const parsed = JSON.parse(row.summary) as Partial<PaperSummary>;
    return normalizeSummary(parsed);
  } catch (_e) {
    // Legacy or corrupted row — return an empty skeleton
    return {
      oneLine: "",
      problem: "",
      method: "",
      finding: "",
      domain: "",
      keyTerms: [],
    };
  }
}

function normalizeSummary(raw: Partial<PaperSummary>): PaperSummary {
  return {
    oneLine: trim(raw.oneLine),
    problem: trim(raw.problem),
    method: trim(raw.method),
    finding: trim(raw.finding),
    domain: trim(raw.domain),
    keyTerms: Array.isArray(raw.keyTerms)
      ? raw.keyTerms.slice(0, 8).map((t) => String(t).trim()).filter(Boolean)
      : [],
  };
}

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function generateSummary(sourceText: string): Promise<PaperSummary> {
  const prompt = [
    "Summarize this paper for DOWNSTREAM semantic comparison against other papers.",
    "Be terse and specific; prefer concrete nouns over generic phrasing.",
    "",
    "INPUT:",
    sourceText.slice(0, 12_000), // cap roughly by char budget
    "",
    "Return ONLY a JSON object with these keys:",
    `{`,
    `  "oneLine":  string,       // 1 sentence capturing what the paper does`,
    `  "problem":  string,       // the research question / gap it addresses`,
    `  "method":   string,       // technical approach / key technique`,
    `  "finding":  string,       // main result / contribution`,
    `  "domain":   string,       // subfield(s), comma-separated`,
    `  "keyTerms": [string, ...] // 3-6 terms that uniquely identify this paper`,
    `}`,
    `Do not include any other keys. Do not wrap in markdown.`,
  ].join("\n");

  const raw = await chatJSON<Partial<PaperSummary>>(
    [{ role: "user", content: prompt }],
    { temperature: 0, maxTokens: 500, seed: 42 },
  );
  return normalizeSummary(raw);
}

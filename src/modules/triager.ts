import { chatJSON } from "../services/llm";

/**
 * Triager — ask the LLM to judge whether a paper deserves the user's
 * next reading hour.
 *
 * Input: a Zotero item (title + abstract + year + authors) + the user's
 *        current research-focus string.
 * Output: a triage verdict:
 *          {
 *            tldr: ["line 1", "line 2", "line 3"],
 *            relevance: 0..5 (float),
 *            verdict: "must_read" | "skim" | "skip",
 *            reason: "one-sentence justification"
 *          }
 *
 * This is V0-style "LLM-as-judge". Scales poorly over a large library
 * (one LLM call per paper) but proves the loop end-to-end.  A future
 * release will add local embeddings for cheap batch ranking.
 */

export interface TriageVerdict {
  tldr: string[];
  relevance: number;
  verdict: "must_read" | "skim" | "skip";
  reason: string;
}

export interface ItemSnapshot {
  itemID: number;
  title: string;
  abstract: string;
  year: string;
  authors: string;
}

export function snapshotItem(item: Zotero.Item): ItemSnapshot {
  const title = (item.getField("title") as string) || "(no title)";
  const abstract = (item.getField("abstractNote") as string) || "";
  const year = (item.getField("date") as string) || "";
  const creators = item
    .getCreators()
    .slice(0, 4)
    .map((c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
  return {
    itemID: item.id,
    title,
    abstract: abstract.slice(0, 3000),
    year,
    authors: creators,
  };
}

function buildPrompt(snap: ItemSnapshot, focus: string): string {
  const safeFocus = focus.trim() || "general research interest";
  return [
    `You are ZotRead, a reading-triage assistant for a researcher.`,
    `The researcher's CURRENT focus is:`,
    `  """${safeFocus}"""`,
    ``,
    `Below is a paper they just added to Zotero. Decide whether reading this paper right now would advance their focus.`,
    ``,
    `Paper:`,
    `  Title: ${snap.title}`,
    `  Authors: ${snap.authors || "n/a"}`,
    `  Year: ${snap.year || "n/a"}`,
    `  Abstract: ${snap.abstract || "(no abstract)"}`,
    ``,
    `Return ONLY a JSON object with this exact shape:`,
    `{`,
    `  "tldr": [string, string, string],              // three one-line bullets capturing the paper's claim, method, result`,
    `  "relevance": number,                           // 0.0 to 5.0 — how directly the paper advances the stated focus`,
    `  "verdict": "must_read" | "skim" | "skip",`,
    `  "reason": string                               // one sentence, <=30 words, in the researcher's language`,
    `}`,
    `Write the "tldr" and "reason" fields in the SAME language as the researcher's focus paragraph above — if the focus is in Chinese use Simplified Chinese, if it's in English use English. Never switch to a third language.`,
    `Do not include any other keys. Do not wrap in markdown.`,
  ].join("\n");
}

export async function triageItem(item: Zotero.Item): Promise<TriageVerdict> {
  const snap = snapshotItem(item);
  // researchFocus pref was removed — pass empty focus. The triager API is
  // only used from dev console; if you need it, re-add the pref or pass
  // focus explicitly when calling triageItem.
  const focus = "";
  const prompt = buildPrompt(snap, focus);
  Zotero.debug(
    `[ZotRead] triageItem ${snap.itemID} "${snap.title.slice(0, 80)}"`,
  );
  const verdict = await chatJSON<TriageVerdict>(
    [{ role: "user", content: prompt }],
    { temperature: 0.2, maxTokens: 400 },
  );
  return normalize(verdict);
}

function normalize(v: Partial<TriageVerdict>): TriageVerdict {
  const allowed: TriageVerdict["verdict"][] = ["must_read", "skim", "skip"];
  return {
    tldr: Array.isArray(v.tldr) ? v.tldr.slice(0, 3).map(String) : [],
    relevance: clamp(Number(v.relevance ?? 0), 0, 5),
    verdict:
      v.verdict && allowed.includes(v.verdict as TriageVerdict["verdict"])
        ? (v.verdict as TriageVerdict["verdict"])
        : "skip",
    reason: String(v.reason ?? "").slice(0, 300),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

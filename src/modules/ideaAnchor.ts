/**
 * Idea anchors — any number of saved research ideas, one "active" at a time.
 *
 * Each idea lives in `zotread_idea(ideaID, name, text, ...)`.
 * The active idea is tracked by pref `idea.activeID` (0 = none).
 *
 * In cache tables we use the virtual itemID  `-ideaID`  so ideas reuse
 * every existing summary/similarity mechanism without schema change.
 */

import { chatJSON, readConfig } from "../services/llm";
import { sha256Hex } from "../services/hash";
import { getPref, setPref } from "../utils/prefs";
import {
  deleteSimilaritiesFor,
  getIdea,
  getSummary,
  IdeaRow,
  saveSummary,
} from "../services/db";
import type { PaperSummary, SummaryRecord } from "./summarizer";

export function virtualItemIDForIdea(ideaID: number): number {
  return -Math.abs(ideaID);
}

export function ideaIDFromVirtual(virtualItemID: number): number {
  return Math.abs(virtualItemID);
}

export function isIdeaVirtualID(itemID: number): boolean {
  return itemID < 0;
}

export function getActiveIdeaID(): number {
  const raw = getPref("idea.activeID");
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setActiveIdeaID(ideaID: number): void {
  setPref("idea.activeID", ideaID > 0 ? ideaID : 0);
}

export async function getActiveIdea(): Promise<IdeaRow | null> {
  const id = getActiveIdeaID();
  if (!id) return null;
  return getIdea(id);
}

export async function isIdeaActive(): Promise<boolean> {
  const idea = await getActiveIdea();
  return Boolean(idea && idea.text.trim().length > 0);
}

/** Virtual itemID for the currently active idea, or null if none. */
export async function getActiveIdeaVirtualID(): Promise<number | null> {
  const idea = await getActiveIdea();
  if (!idea || !idea.text.trim()) return null;
  return virtualItemIDForIdea(idea.ideaID);
}

export async function ensureIdeaSummary(
  ideaID?: number,
): Promise<SummaryRecord> {
  const id = ideaID ?? getActiveIdeaID();
  if (!id) throw new Error("No active idea — pick one in settings");
  const idea = await getIdea(id);
  if (!idea || !idea.text.trim()) {
    throw new Error(`Idea ${id} is empty`);
  }

  const virtualID = virtualItemIDForIdea(idea.ideaID);
  const { model } = readConfig();
  const fullText = `Idea: ${idea.name}\n\n${idea.text}`;
  const contentHash = await sha256Hex(fullText);

  const cached = await getSummary(virtualID);
  if (cached && cached.contentHash === contentHash && cached.model === model) {
    return {
      itemID: virtualID,
      title: idea.name || "My Idea",
      source: "abstract-only",
      summary: parseSummary(cached.summary),
      contentHash,
      model,
      cached: true,
    };
  }

  const summary = await generateIdeaSummary(idea.name, idea.text);
  await saveSummary({
    itemID: virtualID,
    contentHash,
    model,
    summary: JSON.stringify(summary),
    keyTerms: JSON.stringify(summary.keyTerms),
  });
  await deleteSimilaritiesFor(virtualID);

  return {
    itemID: virtualID,
    title: idea.name || "My Idea",
    source: "abstract-only",
    summary,
    contentHash,
    model,
    cached: false,
  };
}

async function generateIdeaSummary(
  name: string,
  text: string,
): Promise<PaperSummary> {
  const prompt = [
    "Summarize this RESEARCH IDEA for downstream semantic comparison with published papers.",
    "The idea may be half-formed. Extract what the researcher WANTS to explore.",
    "",
    `Idea name: ${name || "(no name)"}`,
    `Idea text:`,
    text.slice(0, 8000),
    "",
    "Return ONLY a JSON object with these keys:",
    `{`,
    `  "oneLine":  string,        // 1 sentence capturing what the idea proposes`,
    `  "problem":  string,        // the problem / research question`,
    `  "method":   string,        // intended or anticipated approach`,
    `  "finding":  string,        // expected / hypothesized result (or 'to be determined')`,
    `  "domain":   string,        // relevant subfield(s), comma-separated`,
    `  "keyTerms": [string, ...]  // 3-6 terms`,
    `}`,
    "Do not include any other keys. Do not wrap in markdown.",
  ].join("\n");

  const raw = await chatJSON<Partial<PaperSummary>>(
    [{ role: "user", content: prompt }],
    { temperature: 0, maxTokens: 500, seed: 42 },
  );
  return normalizeSummary(raw);
}

function parseSummary(json: string): PaperSummary {
  try {
    return normalizeSummary(JSON.parse(json) as Partial<PaperSummary>);
  } catch (_e) {
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
  const trim = (v: unknown): string =>
    typeof v === "string" ? v.trim() : "";
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

export async function clearIdeaCache(ideaID: number): Promise<void> {
  await deleteSimilaritiesFor(virtualItemIDForIdea(ideaID));
}

/** Compatibility stub — display name of the active idea, if any. */
export async function getActiveIdeaName(): Promise<string> {
  const idea = await getActiveIdea();
  return idea?.name ?? "";
}

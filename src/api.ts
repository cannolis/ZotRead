import { triageItem, TriageVerdict } from "./modules/triager";
import { chat, ping, readConfig } from "./services/llm";
import { importArxivIntoZotero } from "./services/arxiv";
import {
  addAnchor,
  clearAllCache,
  deleteIdea as dbDeleteIdea,
  getIdea,
  IdeaRow,
  insertIdea,
  isAnchor,
  listAnchors,
  listIdeas,
  removeAnchor,
  setStatus,
  getStatus,
  ItemStatus,
  updateIdea as dbUpdateIdea,
} from "./services/db";
import { ensureSummary } from "./modules/summarizer";
import {
  Aggregation,
  getCachedScore,
  rankReadingQueue,
  RankedItem,
} from "./modules/ranker";
import { runBackfill } from "./modules/summaryQueue";
import { computeSimilarityBatch } from "./modules/similarity";
import { refreshScoreMap } from "./modules/scoreColumn";
import { refreshStatusMap } from "./modules/statusColumn";
import {
  clearIdeaCache,
  ensureIdeaSummary,
  getActiveIdea,
  getActiveIdeaID,
  isIdeaActive,
  setActiveIdeaID,
} from "./modules/ideaAnchor";

/**
 * Public API surface of ZotRead, exposed as `Zotero.ZotRead.api.*`.
 *
 * Usage from Zotero's Tools → Developer → Run JavaScript:
 *   await Zotero.ZotRead.api.ping()
 *   await Zotero.ZotRead.api.importArxiv(["1706.03762"])
 *   await Zotero.ZotRead.api.markAnchor(<itemID>)
 *   await Zotero.ZotRead.api.readingQueue()
 */

// ── legacy triage (kept for backward compat) ────────────────────────

interface TriagedItem {
  itemID: number;
  title: string;
  verdict: TriageVerdict;
}

async function triageItemById(itemID: number): Promise<TriagedItem> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isRegularItem()) {
    throw new Error(`Item ${itemID} is not a regular item`);
  }
  const verdict = await triageItem(item);
  return {
    itemID,
    title: (item.getField("title") as string) || "",
    verdict,
  };
}

// ── arxiv import ────────────────────────────────────────────────────

async function importArxiv(ids: string[]): Promise<
  Array<{ arxivID: string; itemID: number; title: string }>
> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("Pass an array of arXiv IDs, e.g. ['1706.03762']");
  }
  const out: Array<{ arxivID: string; itemID: number; title: string }> = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    try {
      const item = await importArxivIntoZotero(id);
      out.push({
        arxivID: id,
        itemID: item.id,
        title: (item.getField("title") as string) || "",
      });
      Zotero.debug(`[ZotRead] imported arXiv ${id} → itemID ${item.id}`);
    } catch (e) {
      Zotero.debug(`[ZotRead] arXiv import failed for ${id}: ${String(e)}`);
    }
    // Gentle throttle so arxiv.org doesn't 429 us on the next call.
    if (i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return out;
}

// ── anchor management ──────────────────────────────────────────────

async function markAnchor(itemID: number, note?: string): Promise<void> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isRegularItem()) {
    throw new Error(`Item ${itemID} is not a regular item`);
  }
  await addAnchor(itemID, note);
  // Eager-summarise so the anchor is immediately comparable
  await ensureSummary(item).catch((e) =>
    Zotero.debug(`[ZotRead] summarise new anchor failed: ${String(e)}`),
  );
}

async function unmarkAnchor(itemID: number): Promise<void> {
  await removeAnchor(itemID);
}

async function getAnchors(): Promise<
  Array<{ itemID: number; title: string; note: string | null; addedAt: number }>
> {
  const rows = await listAnchors();
  const ids = rows.map((r) => r.itemID);
  const items = await Zotero.Items.getAsync(ids);
  return rows.map((r) => {
    const item = items.find((it) => it && it.id === r.itemID);
    return {
      itemID: r.itemID,
      title: item ? (item.getField("title") as string) || "" : "(missing)",
      note: r.note,
      addedAt: r.addedAt,
    };
  });
}

// ── status tracking ────────────────────────────────────────────────

async function markStatus(itemID: number, status: ItemStatus): Promise<void> {
  await setStatus(itemID, status);
}

// ── core reading queue ─────────────────────────────────────────────

async function readingQueue(opts: {
  limit?: number;
  aggregation?: Aggregation;
  anchorSubset?: number[];
  includeRead?: boolean;
} = {}): Promise<RankedItem[]> {
  const queue = await rankReadingQueue(opts);
  // Fresh scores may be in the similarity table — repopulate column.
  await Promise.all([refreshScoreMap(), refreshStatusMap()]);
  return queue;
}

/**
 * Run ranking across the whole library with zero UI friction: after
 * compute, the score column reflects the latest values.
 */
async function rescoreAll(opts: {
  limit?: number;
  onProgress?: (p: { done: number; total: number; title: string }) => void;
} = {}): Promise<{ ranked: number }> {
  const queue = await rankReadingQueue({
    limit: opts.limit ?? 500,
    onProgress: (p) =>
      opts.onProgress?.({ done: p.done, total: p.total, title: p.title }),
  });
  await Promise.all([refreshScoreMap(), refreshStatusMap()]);
  return { ranked: queue.length };
}

/**
 * Refresh the active idea's cached summary (re-runs LLM if content changed).
 * No-op if no active idea.
 */
async function refreshIdea(): Promise<{
  active: boolean;
  name: string;
  regenerated: boolean;
}> {
  if (!(await isIdeaActive())) {
    return { active: false, name: "", regenerated: false };
  }
  const rec = await ensureIdeaSummary();
  await Promise.all([refreshScoreMap(), refreshStatusMap()]);
  return { active: true, name: rec.title, regenerated: !rec.cached };
}

// ── idea CRUD ──────────────────────────────────────────────────────

export interface IdeaWithActive extends IdeaRow {
  isActive: boolean;
}

async function allIdeas(): Promise<IdeaWithActive[]> {
  const activeID = getActiveIdeaID();
  const rows = await listIdeas();
  return rows.map((r) => ({ ...r, isActive: r.ideaID === activeID }));
}

async function createIdea(
  name: string,
  text: string,
  setActive = true,
): Promise<{ ideaID: number; isActive: boolean }> {
  if (!name || !name.trim()) throw new Error("Idea name required");
  const ideaID = await insertIdea(name.trim(), (text ?? "").trim());
  if (setActive) setActiveIdeaID(ideaID);
  await refreshScoreMap();
  return { ideaID, isActive: setActive };
}

async function updateIdeaContent(
  ideaID: number,
  name: string,
  text: string,
): Promise<void> {
  const existing = await getIdea(ideaID);
  if (!existing) throw new Error(`No idea ${ideaID}`);
  await dbUpdateIdea(ideaID, name.trim(), (text ?? "").trim());
  // Content changed → clear this idea's cached summary & similarity rows
  await clearIdeaCache(ideaID);
  if (ideaID === getActiveIdeaID()) {
    await refreshScoreMap();
  }
}

async function deleteIdea(ideaID: number): Promise<void> {
  await clearIdeaCache(ideaID);
  await dbDeleteIdea(ideaID);
  if (getActiveIdeaID() === ideaID) {
    setActiveIdeaID(0);
  }
  await refreshScoreMap();
}

async function setActiveIdea(
  ideaID: number,
): Promise<IdeaWithActive | null> {
  if (ideaID && ideaID > 0) {
    const existing = await getIdea(ideaID);
    if (!existing) throw new Error(`No idea ${ideaID}`);
    setActiveIdeaID(ideaID);
  } else {
    setActiveIdeaID(0);
  }
  // Cache-only refresh — no LLM.  Idea's summary pre-computed or will
  // be regenerated on next rank pass.
  await refreshScoreMap();
  const idea = await getActiveIdea();
  return idea ? { ...idea, isActive: true } : null;
}

async function currentIdea(): Promise<IdeaWithActive | null> {
  const idea = await getActiveIdea();
  if (!idea) return null;
  return { ...idea, isActive: true };
}

async function refreshColumn(): Promise<{ scores: number; statuses: number }> {
  const [scores, statuses] = await Promise.all([
    refreshScoreMap(),
    refreshStatusMap(),
  ]);
  return { scores, statuses };
}

async function scoreOf(itemID: number): Promise<number> {
  const { score } = await getCachedScore(itemID);
  return score;
}

// ── summary ────────────────────────────────────────────────────────

async function summariseItem(itemID: number): Promise<unknown> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item) throw new Error(`No item ${itemID}`);
  return ensureSummary(item);
}

async function backfillSummaries(cap?: number): Promise<unknown> {
  return runBackfill({ maxItems: cap });
}

// ── misc ───────────────────────────────────────────────────────────

async function echo(message = "hello"): Promise<string> {
  return await chat(
    [{ role: "user", content: `Repeat this back: ${message}` }],
    { maxTokens: 40 },
  );
}

async function warmSimilaritiesFor(itemID: number): Promise<number> {
  const anchors = await listAnchors();
  const anchorItems = (await Zotero.Items.getAsync(
    anchors.map((a) => a.itemID),
  )).filter((it) => it && it.isRegularItem());
  const candidate = await Zotero.Items.getAsync(itemID);
  if (!candidate || !candidate.isRegularItem()) {
    throw new Error(`Item ${itemID} not a regular item`);
  }
  const sims = await computeSimilarityBatch(anchorItems, candidate);
  return sims.length;
}

export const api = {
  // connectivity
  ping,
  echo,
  config: readConfig,

  // import
  importArxiv,

  // anchors
  markAnchor,
  unmarkAnchor,
  isAnchor,
  getAnchors,

  // status
  markStatus,
  getStatus,

  // reading queue
  readingQueue,
  rescoreAll,
  refreshColumn,
  refreshIdea,
  scoreOf,
  warmSimilaritiesFor,

  // idea CRUD
  listIdeas: allIdeas,
  createIdea,
  updateIdea: updateIdeaContent,
  deleteIdea,
  setActiveIdea,
  getCurrentIdea: currentIdea,

  // summaries
  summariseItem,
  backfillSummaries,

  // cache
  clearAllCache,

  // legacy
  triageItem: triageItemById,
};

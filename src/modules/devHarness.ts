import { api } from "../api";
import { getPref } from "../utils/prefs";

/**
 * Dev harness — runs the new V1 pipeline end-to-end when
 * `debug.testOnStartup` is true.  Writes a JSON report to the profile dir
 * so headless callers can inspect results over SSH.
 */

const RESULT_FILE = "zotread-test-result.json";

// 30 arXiv papers + first 3 are "my papers" (anchors)
const TEST_ARXIV_IDS = [
  "1706.03762", // Attention Is All You Need              ← anchor
  "1810.04805", // BERT                                   ← anchor
  "2005.14165", // GPT-3                                  ← anchor
  // rest are candidates
  "1512.03385", // ResNet
  "1409.0473",  // Bahdanau Attention
  "1901.11117", // Evolved Transformer
  "2010.11929", // ViT
  "2104.09864", // RoFormer
  "2203.02155", // InstructGPT
  "2302.13971", // LLaMA
  "2307.09288", // Llama 2
  "2302.08107", // Toolformer
  "2303.08774", // GPT-4 technical report
  "2212.10560", // Self-Instruct
  "2112.09332", // WebGPT
  "2211.05100", // BLOOM
  "2201.11903", // Chain-of-Thought
  "2203.11171", // Self-Consistency
  "2305.10601", // Tree of Thoughts
  "2205.11916", // Zero-shot CoT
  "2310.06825", // Mistral 7B
  "2106.09685", // LoRA
  "2305.14314", // QLoRA
  "2101.03961", // Switch Transformer
  "2112.06905", // GLaM
  "1907.11692", // RoBERTa
  "2108.07258", // Foundation Models
  "2001.08361", // Scaling Laws
  "2203.15556", // Chinchilla
  "2211.09085", // Holistic evaluation of LMs
];

export async function maybeRunStartupSelfTest(): Promise<void> {
  const shouldRun = Boolean(getPref("debug.testOnStartup"));
  if (!shouldRun) return;

  Zotero.debug("[ZotRead] self-test: starting");
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    steps: [] as unknown[],
  };
  const steps = report.steps as Array<Record<string, unknown>>;

  try {
    steps.push({ step: "config", ...redactConfig() });

    const alive = await api.ping();
    steps.push({ step: "ping", alive });
    if (!alive) {
      await writeReport({ ...report, error: "ping failed" });
      return;
    }

    // Import all 30 papers
    const imported = await api.importArxiv(TEST_ARXIV_IDS);
    steps.push({ step: "importArxiv", count: imported.length });

    // First 3 become anchors
    const anchorSlice = imported.slice(0, 3);
    for (const row of anchorSlice) {
      await api.markAnchor(row.itemID, "seed anchor");
    }
    steps.push({
      step: "markAnchor",
      anchors: anchorSlice.map((r) => ({ id: r.itemID, title: r.title })),
    });

    // Summarize the rest in the background (blocking here so the report
    // captures the real final state)
    const backfill = await api.backfillSummaries();
    steps.push({ step: "backfillSummaries", ...(backfill as object) });

    // Rank
    const queue = await api.readingQueue({ limit: 20 });
    steps.push({
      step: "readingQueue",
      count: queue.length,
      top: queue.slice(0, 10).map((q) => ({
        itemID: q.itemID,
        title: q.title,
        score: Number(q.score.toFixed(3)),
        rawScore: Number(q.rawScore.toFixed(3)),
        status: q.status,
        topAnchors: q.topAnchors.map((a) => ({
          id: a.anchorItemID,
          sim: Number(a.similarity.toFixed(3)),
          role: a.role,
          rationale: a.rationale,
        })),
      })),
    });

    (report as Record<string, unknown>).finishedAt = new Date().toISOString();
    await writeReport(report);
    Zotero.debug(
      `[ZotRead] self-test: finished; queue has ${queue.length} ranked items`,
    );
  } catch (e) {
    (report as Record<string, unknown>).error = String(e);
    (report as Record<string, unknown>).stack =
      e instanceof Error ? e.stack : undefined;
    await writeReport(report);
    Zotero.debug(`[ZotRead] self-test failed: ${String(e)}`);
  }
}

function redactConfig(): Record<string, unknown> {
  const cfg = api.config();
  return {
    baseURL: cfg.baseURL,
    model: cfg.model,
    apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 10)}…` : "(missing)",
  };
}

async function writeReport(report: unknown): Promise<void> {
  const profileDir =
    (PathUtils as unknown as { profileDir?: string }).profileDir ??
    (Services.dirsvc.get("ProfD", Components.interfaces.nsIFile) as any).path;
  const path = PathUtils.join(profileDir, RESULT_FILE);
  await IOUtils.writeUTF8(path, JSON.stringify(report, null, 2));
  Zotero.debug(`[ZotRead] self-test: wrote ${path}`);
}

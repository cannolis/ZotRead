/**
 * SQLite schema + low-level query helpers for ZotRead.
 *
 * All four tables live inside Zotero's own SQLite (zotero.sqlite). We add
 * them lazily on first use; they are idempotent (CREATE TABLE IF NOT EXISTS).
 */

export interface SummaryRow {
  itemID: number;
  contentHash: string;
  model: string;
  summary: string; // JSON string — see summarizer.ts for schema
  keyTerms: string; // JSON array string
  createdAt: number;
  updatedAt: number;
}

export interface AnchorRow {
  itemID: number;
  addedAt: number;
  note: string | null;
}

export interface SimilarityRow {
  anchorItemID: number;
  candidateItemID: number;
  anchorContentHash: string;
  candidateContentHash: string;
  method: string;
  similarity: number;
  rationale: string | null;
  role: string | null;
  createdAt: number;
}

export type ItemStatus = "unread" | "reading" | "read" | "skipped" | "archived";

export interface StatusRow {
  itemID: number;
  status: ItemStatus;
  updatedAt: number;
  note: string | null;
}

const CREATE_SQL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS zotread_summary (
     itemID      INTEGER PRIMARY KEY,
     contentHash TEXT NOT NULL,
     model       TEXT NOT NULL,
     summary     TEXT NOT NULL,
     keyTerms    TEXT NOT NULL DEFAULT '[]',
     createdAt   INTEGER NOT NULL,
     updatedAt   INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS zotread_anchor (
     itemID  INTEGER PRIMARY KEY,
     addedAt INTEGER NOT NULL,
     note    TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS zotread_similarity (
     anchorItemID         INTEGER NOT NULL,
     candidateItemID      INTEGER NOT NULL,
     anchorContentHash    TEXT NOT NULL,
     candidateContentHash TEXT NOT NULL,
     method               TEXT NOT NULL,
     similarity           REAL NOT NULL,
     rationale            TEXT,
     role                 TEXT,
     createdAt            INTEGER NOT NULL,
     PRIMARY KEY (anchorItemID, candidateItemID, method)
   )`,
  `CREATE TABLE IF NOT EXISTS zotread_status (
     itemID    INTEGER PRIMARY KEY,
     status    TEXT NOT NULL,
     updatedAt INTEGER NOT NULL,
     note      TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS zotread_idea (
     ideaID    INTEGER PRIMARY KEY AUTOINCREMENT,
     name      TEXT NOT NULL,
     text      TEXT NOT NULL,
     createdAt INTEGER NOT NULL,
     updatedAt INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS zotread_override (
     anchorItemID    INTEGER NOT NULL,
     candidateItemID INTEGER NOT NULL,
     similarity      REAL NOT NULL,
     note            TEXT,
     updatedAt       INTEGER NOT NULL,
     PRIMARY KEY (anchorItemID, candidateItemID)
   )`,
  `CREATE INDEX IF NOT EXISTS zotread_similarity_candidate_idx
     ON zotread_similarity(candidateItemID, method)`,
];

let initPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      for (const sql of CREATE_SQL) {
        await Zotero.DB.queryAsync(sql);
      }
      Zotero.debug("[ZotRead] SQLite schema ready");
    })();
  }
  await initPromise;
}

// ── summary ────────────────────────────────────────────────────────

export async function getSummary(itemID: number): Promise<SummaryRow | null> {
  await ensureSchema();
  const row = (await Zotero.DB.rowQueryAsync(
    `SELECT * FROM zotread_summary WHERE itemID = ?`,
    [itemID],
  )) as SummaryRow | false | undefined;
  return row || null;
}

export async function saveSummary(
  row: Omit<SummaryRow, "createdAt" | "updatedAt"> & {
    createdAt?: number;
    updatedAt?: number;
  },
): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await Zotero.DB.queryAsync(
    `INSERT OR REPLACE INTO zotread_summary
       (itemID, contentHash, model, summary, keyTerms, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.itemID,
      row.contentHash,
      row.model,
      row.summary,
      row.keyTerms,
      row.createdAt ?? now,
      now,
    ],
  );
}

export async function deleteSummary(itemID: number): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(`DELETE FROM zotread_summary WHERE itemID = ?`, [
    itemID,
  ]);
}

// ── anchor ─────────────────────────────────────────────────────────

export async function listAnchors(): Promise<AnchorRow[]> {
  await ensureSchema();
  const rows = (await Zotero.DB.queryAsync(
    `SELECT itemID, addedAt, note FROM zotread_anchor ORDER BY addedAt ASC`,
  )) as AnchorRow[];
  return rows ?? [];
}

export async function isAnchor(itemID: number): Promise<boolean> {
  await ensureSchema();
  const n = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_anchor WHERE itemID = ?`,
    [itemID],
  )) as number;
  return (n ?? 0) > 0;
}

export async function addAnchor(itemID: number, note?: string): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    `INSERT OR REPLACE INTO zotread_anchor (itemID, addedAt, note)
     VALUES (?, ?, ?)`,
    [itemID, Date.now(), note ?? null],
  );
}

export async function removeAnchor(itemID: number): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(`DELETE FROM zotread_anchor WHERE itemID = ?`, [
    itemID,
  ]);
}

// ── similarity ─────────────────────────────────────────────────────

export async function getSimilarity(
  anchorItemID: number,
  candidateItemID: number,
  method: string,
): Promise<SimilarityRow | null> {
  await ensureSchema();
  const row = (await Zotero.DB.rowQueryAsync(
    `SELECT * FROM zotread_similarity
      WHERE anchorItemID = ? AND candidateItemID = ? AND method = ?`,
    [anchorItemID, candidateItemID, method],
  )) as SimilarityRow | false | undefined;
  return row || null;
}

export async function saveSimilarity(
  row: Omit<SimilarityRow, "createdAt"> & {
    createdAt?: number;
  },
): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    `INSERT OR REPLACE INTO zotread_similarity
       (anchorItemID, candidateItemID, anchorContentHash, candidateContentHash,
        method, similarity, rationale, role, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.anchorItemID,
      row.candidateItemID,
      row.anchorContentHash,
      row.candidateContentHash,
      row.method,
      row.similarity,
      row.rationale ?? null,
      row.role ?? null,
      row.createdAt ?? Date.now(),
    ],
  );
}

export async function getSimilarityMap(
  anchorItemIDs: number[],
  candidateItemID: number,
  method: string,
): Promise<Map<number, SimilarityRow>> {
  await ensureSchema();
  if (anchorItemIDs.length === 0) return new Map();
  const placeholders = anchorItemIDs.map(() => "?").join(",");
  const rows = (await Zotero.DB.queryAsync(
    `SELECT * FROM zotread_similarity
      WHERE candidateItemID = ? AND method = ?
        AND anchorItemID IN (${placeholders})`,
    [candidateItemID, method, ...anchorItemIDs],
  )) as SimilarityRow[];
  const map = new Map<number, SimilarityRow>();
  for (const r of rows ?? []) map.set(r.anchorItemID, r);
  return map;
}

export async function deleteSimilaritiesFor(itemID: number): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    `DELETE FROM zotread_similarity
      WHERE anchorItemID = ? OR candidateItemID = ?`,
    [itemID, itemID],
  );
}

// ── status ─────────────────────────────────────────────────────────

export async function getStatus(itemID: number): Promise<StatusRow | null> {
  await ensureSchema();
  const row = (await Zotero.DB.rowQueryAsync(
    `SELECT itemID, status, updatedAt, note FROM zotread_status WHERE itemID = ?`,
    [itemID],
  )) as StatusRow | false | undefined;
  return row || null;
}

export async function setStatus(
  itemID: number,
  status: ItemStatus,
  note?: string,
): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    `INSERT OR REPLACE INTO zotread_status (itemID, status, updatedAt, note)
     VALUES (?, ?, ?, ?)`,
    [itemID, status, Date.now(), note ?? null],
  );
}

export async function getAllStatuses(): Promise<Map<number, StatusRow>> {
  await ensureSchema();
  const rows = (await Zotero.DB.queryAsync(
    `SELECT itemID, status, updatedAt, note FROM zotread_status`,
  )) as StatusRow[];
  const map = new Map<number, StatusRow>();
  for (const r of rows ?? []) map.set(r.itemID, r);
  return map;
}

// ── override CRUD ─────────────────────────────────────────────────

export interface OverrideRow {
  anchorItemID: number;
  candidateItemID: number;
  similarity: number;
  note: string | null;
  updatedAt: number;
}

export async function setOverride(
  anchorItemID: number,
  candidateItemID: number,
  similarity: number,
  note?: string,
): Promise<void> {
  await ensureSchema();
  const clamped = Math.max(0, Math.min(1, similarity));
  await Zotero.DB.queryAsync(
    `INSERT OR REPLACE INTO zotread_override
       (anchorItemID, candidateItemID, similarity, note, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [anchorItemID, candidateItemID, clamped, note ?? null, Date.now()],
  );
}

export async function clearOverride(
  anchorItemID: number,
  candidateItemID: number,
): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    "DELETE FROM zotread_override WHERE anchorItemID = ? AND candidateItemID = ?",
    [anchorItemID, candidateItemID],
  );
}

export async function getOverridesFor(
  candidateItemID: number,
): Promise<Map<number, OverrideRow>> {
  await ensureSchema();
  const rows = (await Zotero.DB.queryAsync(
    "SELECT anchorItemID, candidateItemID, similarity, note, updatedAt FROM zotread_override WHERE candidateItemID = ?",
    [candidateItemID],
  )) as OverrideRow[];
  const map = new Map<number, OverrideRow>();
  for (const r of rows ?? []) map.set(r.anchorItemID, r);
  return map;
}

export async function deleteOverridesInvolving(itemID: number): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    "DELETE FROM zotread_override WHERE anchorItemID = ? OR candidateItemID = ?",
    [itemID, itemID],
  );
}

/**
 * Read effective per-anchor similarities for a candidate.
 *
 * Lookup is keyed by **content hash**, not item ID, so true duplicates
 * (e.g. the same arXiv paper imported twice into different Zotero
 * collections) always read the same score even if past LLM calls drifted.
 * When the same hash pair has multiple rows we pick the most recent, so
 * a freshly recomputed score wins over a stale one.
 *
 * User overrides (zotread_override) always win over the cached LLM row.
 */
export async function getEffectiveSimilarities(
  anchorItemIDs: number[],
  candidateItemID: number,
  method: string,
): Promise<Map<number, SimilarityRow>> {
  await ensureSchema();
  if (anchorItemIDs.length === 0) return new Map();

  // Pull all content hashes (anchor + candidate) in a single query.
  const idList = [candidateItemID, ...anchorItemIDs];
  const placeholders = idList.map(() => "?").join(",");
  const hashRows = (await Zotero.DB.queryAsync(
    `SELECT itemID, contentHash FROM zotread_summary WHERE itemID IN (${placeholders})`,
    idList,
  )) as Array<{ itemID: number; contentHash: string }>;
  const hashMap = new Map<number, string>();
  for (const r of hashRows ?? []) hashMap.set(r.itemID, r.contentHash);

  const candidateHash = hashMap.get(candidateItemID);
  const map = new Map<number, SimilarityRow>();

  if (candidateHash) {
    for (const anchorID of anchorItemIDs) {
      const anchorHash = hashMap.get(anchorID);
      if (!anchorHash) continue;
      const row = (await Zotero.DB.rowQueryAsync(
        `SELECT anchorItemID, candidateItemID, anchorContentHash, candidateContentHash,
                method, similarity, rationale, role, createdAt
           FROM zotread_similarity
          WHERE anchorContentHash = ? AND candidateContentHash = ? AND method = ?
       ORDER BY createdAt DESC
          LIMIT 1`,
        [anchorHash, candidateHash, method],
      )) as SimilarityRow | false | undefined;
      if (row) map.set(anchorID, row);
    }
  } else {
    // Fallback: candidate has no summary yet; use the legacy itemID-keyed
    // lookup so a partially populated DB still returns something.
    const legacy = await getSimilarityMap(
      anchorItemIDs,
      candidateItemID,
      method,
    );
    for (const [k, v] of legacy) map.set(k, v);
  }

  // Apply user overrides on top — but only the *score* changes; the
  // rationale and role stay from the original LLM evaluation. The
  // user is correcting our number, not rewriting the explanation.
  const overrides = await getOverridesFor(candidateItemID);
  for (const [anchorID, ov] of overrides) {
    if (!anchorItemIDs.includes(anchorID)) continue;
    const existing = map.get(anchorID);
    map.set(anchorID, {
      anchorItemID: anchorID,
      candidateItemID,
      // "(override)" sentinel kept so the UI can mark this row as
      // user-modified (e.g. swap "edit" → "reset" link).
      anchorContentHash: "(override)",
      candidateContentHash: "(override)",
      method,
      similarity: ov.similarity,
      rationale:
        existing?.rationale && existing.rationale.trim()
          ? existing.rationale
          : (ov.note ?? ""),
      role: existing?.role ?? "same-problem",
      createdAt: ov.updatedAt,
    });
  }
  return map;
}

// ── cache maintenance ─────────────────────────────────────────────

// ── idea CRUD ──────────────────────────────────────────────────────

export interface IdeaRow {
  ideaID: number;
  name: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export async function listIdeas(): Promise<IdeaRow[]> {
  await ensureSchema();
  const rows = (await Zotero.DB.queryAsync(
    `SELECT ideaID, name, text, createdAt, updatedAt FROM zotread_idea
       ORDER BY updatedAt DESC`,
  )) as IdeaRow[];
  return rows ?? [];
}

export async function getIdea(ideaID: number): Promise<IdeaRow | null> {
  await ensureSchema();
  const row = (await Zotero.DB.rowQueryAsync(
    `SELECT ideaID, name, text, createdAt, updatedAt FROM zotread_idea WHERE ideaID = ?`,
    [ideaID],
  )) as IdeaRow | false | undefined;
  return row || null;
}

export async function insertIdea(name: string, text: string): Promise<number> {
  await ensureSchema();
  const now = Date.now();
  await Zotero.DB.queryAsync(
    `INSERT INTO zotread_idea (name, text, createdAt, updatedAt) VALUES (?, ?, ?, ?)`,
    [name, text, now, now],
  );
  const newID = (await Zotero.DB.valueQueryAsync(
    `SELECT ideaID FROM zotread_idea ORDER BY ideaID DESC LIMIT 1`,
  )) as number;
  return newID;
}

export async function updateIdea(
  ideaID: number,
  name: string,
  text: string,
): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(
    `UPDATE zotread_idea SET name = ?, text = ?, updatedAt = ? WHERE ideaID = ?`,
    [name, text, Date.now(), ideaID],
  );
}

export async function deleteIdea(ideaID: number): Promise<void> {
  await ensureSchema();
  await Zotero.DB.queryAsync(`DELETE FROM zotread_idea WHERE ideaID = ?`, [
    ideaID,
  ]);
}

export async function clearAllCache(): Promise<{
  summaries: number;
  similarities: number;
}> {
  await ensureSchema();
  const sumCount = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_summary`,
  )) as number;
  const simCount = (await Zotero.DB.valueQueryAsync(
    `SELECT COUNT(*) FROM zotread_similarity`,
  )) as number;
  await Zotero.DB.queryAsync(`DELETE FROM zotread_summary`);
  await Zotero.DB.queryAsync(`DELETE FROM zotread_similarity`);
  return { summaries: sumCount ?? 0, similarities: simCount ?? 0 };
}

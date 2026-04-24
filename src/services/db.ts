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

export type ItemStatus =
  | "unread"
  | "reading"
  | "read"
  | "skipped"
  | "archived";

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

export async function saveSummary(row: Omit<SummaryRow, "createdAt" | "updatedAt"> & {
  createdAt?: number;
  updatedAt?: number;
}): Promise<void> {
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
  await Zotero.DB.queryAsync(
    `DELETE FROM zotread_summary WHERE itemID = ?`,
    [itemID],
  );
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
  await Zotero.DB.queryAsync(
    `DELETE FROM zotread_anchor WHERE itemID = ?`,
    [itemID],
  );
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

export async function saveSimilarity(row: Omit<SimilarityRow, "createdAt"> & {
  createdAt?: number;
}): Promise<void> {
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

/**
 * Tiny arXiv fetcher — grabs abstract metadata and creates a Zotero item.
 * Uses the public Atom export API. Intended for dev-time seeding only.
 */

export interface ArxivRecord {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  primaryCategory: string;
}

const MAX_RETRIES = 3;
const BACKOFF_MS = [3000, 10000, 30000]; // exponential-ish

export async function fetchArxiv(id: string): Promise<ArxivRecord> {
  const cleanId = id.trim().replace(/^arxiv:/i, "");
  const url = `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await Zotero.HTTP.request("GET", url, {
        responseType: "text",
        timeout: 30000,
      });
      const xml = res.responseText as string;
      return parseAtom(xml, cleanId);
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      const retryable =
        msg.includes("timed out") ||
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("ECONN");
      if (!retryable || attempt === MAX_RETRIES) break;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      Zotero.debug(
        `[ZotRead] arxiv ${cleanId} attempt ${attempt + 1} failed (${msg.slice(0, 80)}), retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr ?? new Error("arxiv fetch failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseAtom(xml: string, fallbackId: string): ArxivRecord {
  const entry = between(xml, "<entry>", "</entry>");
  if (!entry) throw new Error(`arXiv returned no entry for ${fallbackId}`);

  const id = (between(entry, "<id>", "</id>") || fallbackId)
    .replace(/^https?:\/\/arxiv\.org\/abs\//, "")
    .trim();
  const title = collapseWhitespace(between(entry, "<title>", "</title>") || "");
  const abstract = collapseWhitespace(
    between(entry, "<summary>", "</summary>") || "",
  );
  const published = (between(entry, "<published>", "</published>") || "").trim();

  const authors: string[] = [];
  const authorRe = /<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g;
  let m: RegExpExecArray | null;
  while ((m = authorRe.exec(entry))) {
    authors.push(collapseWhitespace(m[1]));
  }

  const primaryCategoryMatch = entry.match(
    /<arxiv:primary_category[^>]*term="([^"]+)"/,
  );
  const primaryCategory = primaryCategoryMatch ? primaryCategoryMatch[1] : "";

  return { id, title, authors, abstract, published, primaryCategory };
}

function between(
  text: string,
  start: string,
  end: string,
): string | null {
  const i = text.indexOf(start);
  if (i < 0) return null;
  const j = text.indexOf(end, i + start.length);
  if (j < 0) return null;
  return text.slice(i + start.length, j);
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function importArxivIntoZotero(
  id: string,
): Promise<Zotero.Item> {
  const record = await fetchArxiv(id);

  const item = new Zotero.Item("preprint");
  item.setField("title", record.title);
  item.setField("abstractNote", record.abstract);
  if (record.published) item.setField("date", record.published.slice(0, 10));
  item.setField("url", `https://arxiv.org/abs/${record.id}`);
  item.setField("repository", "arXiv");
  item.setField("archiveID", record.id);
  if (record.primaryCategory) {
    item.setField("archive", record.primaryCategory);
  }
  try {
    item.setField("DOI", `10.48550/arXiv.${record.id}`);
  } catch (_e) {
    // DOI may not be a valid field on every item type — non-fatal
  }

  record.authors.forEach((fullName, index) => {
    const { firstName, lastName } = splitName(fullName);
    item.setCreator(index, {
      creatorType: "author",
      firstName,
      lastName,
    });
  });

  await item.saveTx();
  return item;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const tokens = full.trim().split(/\s+/);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: "", lastName: tokens[0] };
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1],
  };
}

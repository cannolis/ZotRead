/**
 * Build the text blob that gets fed to the summarizer.
 *
 * Preference order:
 *   1. title + abstract + introduction (from attached PDF full text)
 *   2. title + abstract (if no PDF text available)
 *   3. title alone (desperate fallback)
 */

export interface ExtractedText {
  itemID: number;
  title: string;
  abstract: string;
  introduction: string; // may be empty
  full: string; // the concatenated blob used by the summarizer
  source: "pdf" | "abstract-only" | "title-only";
}

const INTRO_MAX_CHARS = 4000;

export async function extractForSummary(
  item: Zotero.Item,
): Promise<ExtractedText> {
  const title = ((item.getField("title") as string) || "").trim();
  const abstract = ((item.getField("abstractNote") as string) || "").trim();
  let introduction = "";
  let source: ExtractedText["source"] = abstract
    ? "abstract-only"
    : "title-only";

  if (abstract) {
    try {
      introduction = await extractIntroFromPDF(item);
      if (introduction) source = "pdf";
    } catch (e) {
      Zotero.debug(`[ZotRead] PDF intro extraction failed: ${String(e)}`);
    }
  }

  const pieces: string[] = [];
  if (title) pieces.push(`# ${title}`);
  if (abstract) pieces.push(`## Abstract\n${abstract}`);
  if (introduction) pieces.push(`## Introduction\n${introduction}`);
  return {
    itemID: item.id,
    title,
    abstract,
    introduction,
    full: pieces.join("\n\n"),
    source,
  };
}

async function extractIntroFromPDF(item: Zotero.Item): Promise<string> {
  const attachmentIDs = item.getAttachments?.() ?? [];
  if (!attachmentIDs.length) return "";

  for (const aid of attachmentIDs) {
    const att = await Zotero.Items.getAsync(aid);
    if (!att) continue;
    const isPdf =
      att.attachmentContentType === "application/pdf" ||
      (typeof (att as any).isPDFAttachment === "function" &&
        (att as any).isPDFAttachment());
    if (!isPdf) continue;

    const text = await readAttachmentText(att).catch(() => "");
    if (!text) continue;

    const intro = sliceIntro(text);
    if (intro) return intro;
  }
  return "";
}

async function readAttachmentText(att: Zotero.Item): Promise<string> {
  // Try Zotero's indexed full-text first
  try {
    const indexed = await Zotero.Fulltext.getIndexedState?.(att);
    if (indexed && indexed > 0) {
      const content =
        (await (Zotero.Fulltext as any).getItemContent?.(att.id)) ||
        "";
      if (content) return String(content);
    }
  } catch (_e) {
    // fallthrough
  }

  // Fallback: read the .zotero-ft-cache sibling file
  try {
    const attPath = (await att.getFilePathAsync?.()) as string | false;
    if (typeof attPath === "string" && attPath) {
      const cachePath = attPath.replace(/\.pdf$/i, ".zotero-ft-cache");
      const exists = await IOUtils.exists(cachePath).catch(() => false);
      if (exists) {
        const buf = await IOUtils.read(cachePath);
        const decoded = new TextDecoder().decode(buf);
        return decoded;
      }
    }
  } catch (_e) {
    // fallthrough
  }
  return "";
}

/**
 * Heuristic: pull everything between "Introduction" and the next numbered
 * section header, OR the first ~4000 chars after the abstract ends.
 */
export function sliceIntro(fullText: string): string {
  if (!fullText) return "";

  const normalized = fullText.replace(/\r\n/g, "\n");

  // Try to find a literal "Introduction" heading
  const introHeadingRe =
    /(?:^|\n)\s*(?:1\.?\s*)?(?:I\.?\s+)?INTRODUCTION\s*\n+/i;
  const headingMatch = normalized.match(introHeadingRe);
  let start = 0;
  if (headingMatch && typeof headingMatch.index === "number") {
    start = headingMatch.index + headingMatch[0].length;
  } else {
    // No heading — skip past typical abstract block (first ~1000 chars often header/abstract)
    start = Math.min(normalized.length, 800);
  }

  // Stop at the next plausible section heading
  const remainder = normalized.slice(start);
  const nextSectionRe =
    /\n\s*(?:2\.?\s*|II\.?\s+|Related\s+Work|Background|Preliminaries|Method|Methodology|Approach|Model|System|Architecture|Experiments?|Evaluation|Results)(?:\s|\n)/i;
  const next = remainder.match(nextSectionRe);
  let end = next && typeof next.index === "number" ? next.index : remainder.length;
  end = Math.min(end, INTRO_MAX_CHARS);

  return remainder.slice(0, end).trim();
}

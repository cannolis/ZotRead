/**
 * Single source of truth for "which anchors are currently active".
 *
 * Mode `papers` — every paper anchor the user has marked.
 * Mode `idea`   — the single active idea (if any).
 */

import { getPref } from "../utils/prefs";
import { listAnchors } from "../services/db";
import { getActiveIdeaVirtualID } from "./ideaAnchor";

export type RankingMode = "papers" | "idea";

export function getRankingMode(): RankingMode {
  const v = ((getPref("ranking.mode") as string) || "papers").toLowerCase();
  return v === "idea" ? "idea" : "papers";
}

export async function getActiveAnchorIDs(): Promise<number[]> {
  const mode = getRankingMode();
  if (mode === "idea") {
    const vid = await getActiveIdeaVirtualID();
    return vid ? [vid] : [];
  }
  const rows = await listAnchors();
  return rows.map((a) => a.itemID);
}

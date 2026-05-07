/**
 * Resolve the active display language for ZotRead.
 * Priority: explicit pref → Zotero locale → en.
 *
 * Used everywhere the user-facing language matters: prompt direction
 * for the LLM, FTL fallback strings, similarity cache keys (method).
 */
import { config } from "../../package.json";

export type Lang = "en" | "zh";

export function currentLang(): Lang {
  try {
    const v = (
      (Zotero.Prefs.get(
        `extensions.zotero.${config.addonRef}.ui.language`,
        true,
      ) as string) || ""
    )
      .toLowerCase()
      .trim();
    if (v === "zh") return "zh";
    if (v === "en") return "en";
    const loc = (Zotero.locale as string) || "";
    if (loc.toLowerCase().startsWith("zh")) return "zh";
  } catch (_e) {
    /* non-fatal */
  }
  return "en";
}

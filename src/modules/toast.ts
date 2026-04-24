/**
 * Unified toast/progress helpers — thin wrapper over ztoolkit.ProgressWindow.
 * Use these instead of calling ztoolkit directly so the UX stays consistent.
 */

import { getPref } from "../utils/prefs";

export interface ToastOpts {
  title?: string;
  text: string;
  type?: "default" | "success" | "fail";
  closeTime?: number;
}

export function toast(opts: ToastOpts): void {
  try {
    new ztoolkit.ProgressWindow(opts.title ?? addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: opts.closeTime ?? 4000,
    })
      .createLine({
        text: opts.text,
        type: opts.type ?? "default",
        progress: 100,
      })
      .show();
  } catch (e) {
    Zotero.debug("[ZotRead] toast failed: " + String(e));
  }
}

export function toastError(text: string, title?: string): void {
  toast({ title, text, type: "fail", closeTime: 8000 });
}

export function toastSuccess(text: string, title?: string): void {
  toast({ title, text, type: "success", closeTime: 4000 });
}

/**
 * Long-running progress window with an update() method and finish()/fail().
 */
export class ProgressToast {
  private pw: any = null;
  private lineIndex = 0;
  private closed = false;

  constructor(
    private title: string,
    private initialText: string,
  ) {}

  start(): ProgressToast {
    try {
      this.pw = new ztoolkit.ProgressWindow(this.title, {
        closeOnClick: false,
        closeTime: -1,
      })
        .createLine({
          text: this.initialText,
          type: "default",
          progress: 0,
        })
        .show();
    } catch (e) {
      Zotero.debug("[ZotRead] progress start failed: " + String(e));
    }
    return this;
  }

  update(progress: number, text: string): void {
    if (!this.pw || this.closed) return;
    try {
      this.pw.changeLine({
        progress: Math.max(0, Math.min(100, progress)),
        text,
        idx: this.lineIndex,
      });
    } catch (e) {
      Zotero.debug("[ZotRead] progress update failed: " + String(e));
    }
  }

  finish(text: string, type: "success" | "fail" = "success"): void {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.pw) {
        this.pw.changeLine({
          progress: 100,
          type,
          text,
          idx: this.lineIndex,
        });
        this.pw.startCloseTimer(type === "fail" ? 8000 : 4000);
      }
    } catch (e) {
      Zotero.debug("[ZotRead] progress finish failed: " + String(e));
    }
  }
}

/**
 * Startup check — flag if the LLM configuration looks broken so the user
 * notices before spending clicks.
 */
export function warnIfLLMMisconfigured(): void {
  const key = (getPref("llm.apiKey") as string) || "";
  if (!key.trim()) {
    toastError(
      "ZotRead: no LLM API key set. Open Settings → ZotRead and add one to enable ranking.",
      "ZotRead",
    );
  }
}

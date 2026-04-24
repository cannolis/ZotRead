/**
 * Right-click menu on Zotero items: anchor management + read status.
 *
 * We inject a single submenu "ZotRead" into `#zotero-itemmenu`; its items
 * act on whatever is currently selected in ZoteroPane.  To stay simple
 * and robust we rebuild the submenu's contents on every popupshowing so
 * that labels reflect the current anchor / status state.
 */

import {
  addAnchor,
  getStatus,
  isAnchor,
  ItemStatus,
  removeAnchor,
  setStatus,
} from "../services/db";
import { ensureSummary } from "./summarizer";
import { refreshScoreMap } from "./scoreColumn";
import { refreshStatusMap } from "./statusColumn";

const SUBMENU_ID = "zotread-itemmenu-submenu";
const ITEM_IDS = {
  toggleAnchor: "zotread-item-toggle-anchor",
  markRead: "zotread-item-mark-read",
  markReading: "zotread-item-mark-reading",
  resetStatus: "zotread-item-reset-status",
} as const;

const installedWindows = new WeakSet<Window>();

export function registerItemMenu(win: Window): void {
  if (installedWindows.has(win)) return;
  const doc = win.document;
  const itemMenu = doc.getElementById("zotero-itemmenu");
  if (!itemMenu) {
    Zotero.debug("[ZotRead] zotero-itemmenu not found — skipping menu install");
    return;
  }

  // Outer <menu> (creates a flyout submenu)
  const menu = doc.createXULElement("menu") as XULElement;
  menu.id = SUBMENU_ID;
  menu.setAttribute("label", "ZotRead");

  const popup = doc.createXULElement("menupopup") as XULElement;
  popup.id = SUBMENU_ID + "-popup";
  popup.addEventListener("popupshowing", () => {
    rebuildMenu(win, popup).catch((e) =>
      Zotero.debug("[ZotRead] menu rebuild failed: " + String(e)),
    );
  });

  menu.appendChild(popup);
  itemMenu.appendChild(menu);
  installedWindows.add(win);
  Zotero.debug("[ZotRead] item submenu installed");
}

export function unregisterItemMenu(win: Window): void {
  try {
    const doc = win.document;
    const el = doc.getElementById(SUBMENU_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (e) {
    Zotero.debug("[ZotRead] item submenu remove failed: " + String(e));
  }
}

function getSelectedItems(win: Window): Zotero.Item[] {
  const pane = (win as any).ZoteroPane;
  if (!pane?.getSelectedItems) return [];
  const selected = pane.getSelectedItems() as Zotero.Item[];
  return selected.filter((it) => it && it.isRegularItem());
}

async function rebuildMenu(win: Window, popup: Element): Promise<void> {
  const doc = win.document;
  while (popup.firstChild) popup.removeChild(popup.firstChild);

  const selected = getSelectedItems(win);
  if (selected.length === 0) {
    popup.appendChild(makeItem(doc, "zotread-empty", "(select one or more items)", null));
    return;
  }

  // Anchor toggle — label depends on state of the single-/first-selected item
  const firstID = selected[0].id;
  const anchored = await isAnchor(firstID);
  const anchorLabel =
    selected.length === 1
      ? anchored
        ? "取消标记为「我的论文」"
        : "标记为「我的论文」"
      : "切换「我的论文」状态（多选）";
  popup.appendChild(
    makeItem(doc, ITEM_IDS.toggleAnchor, anchorLabel, async () => {
      await toggleAnchors(selected);
      await refreshScoreMap();
      await refreshStatusMap();
    }),
  );

  popup.appendChild(doc.createXULElement("menuseparator"));

  // Status actions
  const currentStatus = (await getStatus(firstID))?.status ?? "unread";
  popup.appendChild(
    makeItem(doc, ITEM_IDS.markRead, checkmark("标记为已读", currentStatus === "read"), () =>
      applyStatus(selected, "read"),
    ),
  );
  popup.appendChild(
    makeItem(
      doc,
      ITEM_IDS.markReading,
      checkmark("标记为在读", currentStatus === "reading"),
      () => applyStatus(selected, "reading"),
    ),
  );
  popup.appendChild(
    makeItem(doc, ITEM_IDS.resetStatus, "重置为未读", () =>
      applyStatus(selected, "unread"),
    ),
  );
}

function makeItem(
  doc: Document,
  id: string,
  label: string,
  handler: ((ev: Event) => void | Promise<void>) | null,
): Element {
  const item = doc.createXULElement("menuitem") as XULElement;
  item.id = id;
  item.setAttribute("label", label);
  if (handler) {
    item.addEventListener("command", (ev: Event) => {
      Promise.resolve(handler(ev)).catch((e) =>
        Zotero.debug("[ZotRead] menu handler failed: " + String(e)),
      );
    });
  } else {
    item.setAttribute("disabled", "true");
  }
  return item;
}

function checkmark(label: string, on: boolean): string {
  return on ? `✓ ${label}` : label;
}

async function toggleAnchors(items: Zotero.Item[]): Promise<void> {
  // For a mixed selection, toggle each based on its own state
  for (const it of items) {
    if (await isAnchor(it.id)) {
      await removeAnchor(it.id);
    } else {
      await addAnchor(it.id);
      // Eagerly summarize the new anchor so it's ready for comparison
      ensureSummary(it).catch((e) =>
        Zotero.debug(`[ZotRead] anchor summarise failed: ${String(e)}`),
      );
    }
  }
}

async function applyStatus(items: Zotero.Item[], status: ItemStatus): Promise<void> {
  for (const it of items) await setStatus(it.id, status);
  // Score no longer depends on status, but status column does.
  await refreshStatusMap();
}

/**
 * Zotero item-tree column "状态" — shows a Chinese label for the
 * user-managed read status so the user can two-key sort:
 *   primary = 相关度 (pure)
 *   secondary = 状态 (未读 / 已读 / ...)
 *
 * Values come from the same in-memory map the score column uses
 * (populated from SQLite).  dataProvider is synchronous — see the
 * commentary in scoreColumn.ts for why.
 */

import { getAllStatuses, ItemStatus, isAnchor, listAnchors } from "../services/db";
import { redrawItemTrees } from "./scoreColumn";

const COLUMN_KEY = "zotread-status";

const LABEL: Record<ItemStatus, string> = {
  unread: "未读",
  reading: "在读",
  read: "已读",
  skipped: "跳过",
  archived: "归档",
};

const statusMap = new Map<number, ItemStatus | "anchor">();
let registered = false;
let registrationToken: string | null = null;

export async function registerStatusColumn(): Promise<void> {
  if (registered) return;
  const manager = (Zotero as any).ItemTreeManager;
  if (!manager?.registerColumn) {
    Zotero.debug("[ZotRead] ItemTreeManager.registerColumn unavailable (status)");
    return;
  }

  const pluginID = addon.data.config.addonID;
  registrationToken = await manager.registerColumn({
    dataKey: COLUMN_KEY,
    label: "状态",
    pluginID,
    dataProvider: (item: Zotero.Item, _dataKey: string): string => {
      try {
        if (!item || !item.isRegularItem()) return "";
        const state = statusMap.get(item.id);
        if (state === "anchor") return "我的";
        if (!state) return "";
        return LABEL[state];
      } catch (_e) {
        return "";
      }
    },
    flex: 1,
    minWidth: 60,
    defaultIn: ["default"],
    zoteroPersist: ["width", "ordinal", "hidden", "sortActive", "sortDirection"],
  });

  registered = true;
  Zotero.debug("[ZotRead] status column registered: " + String(registrationToken));

  refreshStatusMap().catch((e) =>
    Zotero.debug("[ZotRead] initial status refresh failed: " + String(e)),
  );
}

export async function unregisterStatusColumn(): Promise<void> {
  if (!registered) return;
  const manager = (Zotero as any).ItemTreeManager;
  try {
    if (registrationToken && typeof manager.unregisterColumn === "function") {
      await manager.unregisterColumn(registrationToken);
    }
  } catch (e) {
    Zotero.debug("[ZotRead] status column unregister failed: " + String(e));
  }
  registered = false;
  registrationToken = null;
}

export async function refreshStatusMap(): Promise<number> {
  statusMap.clear();
  const anchors = await listAnchors();
  for (const a of anchors) statusMap.set(a.itemID, "anchor");
  const statuses = await getAllStatuses();
  for (const [id, row] of statuses) {
    if (!statusMap.has(id)) statusMap.set(id, row.status);
  }
  Zotero.debug(`[ZotRead] status column refreshed: ${statusMap.size} rows`);
  redrawItemTrees();
  return statusMap.size;
}

export function setStatusEntry(itemID: number, status: ItemStatus): void {
  statusMap.set(itemID, status);
}

export async function isItemAnchor(itemID: number): Promise<boolean> {
  return isAnchor(itemID);
}

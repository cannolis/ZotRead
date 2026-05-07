/**
 * Auto-maintained "ZotRead Top" Zotero collection.
 *
 * After every successful ranking pass, we (re)populate a real Zotero
 * collection with the top-N highest-scoring candidate items. The user can
 * then click the collection in their library tree and see their reading
 * queue without having to sort the relevance column manually.
 *
 * The collection is identified by name (default "📖 ZotRead Top") under
 * the user library root. We never delete it; we just sync membership.
 */

import { getPref } from "../utils/prefs";
import { listAnchors } from "../services/db";
import { rankReadingQueue } from "./ranker";

export async function syncTopCollection(): Promise<{
  collectionID: number | null;
  count: number;
  enabled: boolean;
}> {
  const enabled = readEnabled();
  if (!enabled) return { collectionID: null, count: 0, enabled: false };

  // No anchors / no idea → nothing to populate.
  const anchors = await listAnchors();
  if (anchors.length === 0) {
    return { collectionID: null, count: 0, enabled: true };
  }

  const limit = readSize();
  const queue = await rankReadingQueue({ limit });
  if (queue.length === 0) {
    return { collectionID: null, count: 0, enabled: true };
  }

  const collection = await getOrCreateCollection(readName());
  if (!collection) return { collectionID: null, count: 0, enabled: true };

  await syncMembership(
    collection,
    queue.map((q) => q.itemID),
  );
  return { collectionID: collection.id, count: queue.length, enabled: true };
}

function readEnabled(): boolean {
  const v = getPref("topCollection.enabled");
  // Default true.
  if (v === undefined || v === null) return true;
  return Boolean(v);
}

function readSize(): number {
  const raw = getPref("topCollection.size");
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "20"), 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(200, Math.max(1, n));
}

function readName(): string {
  const v = getPref("topCollection.name");
  return ((v as string) ?? "").toString().trim() || "📖 ZotRead Top";
}

async function getOrCreateCollection(
  name: string,
): Promise<Zotero.Collection | null> {
  const libID = Zotero.Libraries.userLibraryID;
  const all = Zotero.Collections.getByLibrary(libID, true);
  // Zotero's `parentID` for a root-level collection is `false`, not `null`,
  // so `parentID == null` (loose) does NOT match — it would silently fail
  // and create a new collection on every rescore. Use `!c.parentID` to
  // accept all falsy values (false / null / undefined / 0).
  const found = all.find((c) => c.name === name && !c.parentID);
  if (found) return found;

  // Create at user library root.
  const c = new Zotero.Collection({
    libraryID: libID,
    name,
  } as any);
  await c.saveTx();
  return c;
}

async function syncMembership(
  collection: Zotero.Collection,
  desiredItemIDs: number[],
): Promise<void> {
  const desired = new Set(desiredItemIDs);
  const existing = new Set(
    (collection.getChildItems() ?? []).map((it) => it.id),
  );

  const toRemove: number[] = [];
  for (const id of existing) {
    if (!desired.has(id)) toRemove.push(id);
  }
  const toAdd: number[] = [];
  for (const id of desired) {
    if (!existing.has(id)) toAdd.push(id);
  }

  if (toAdd.length === 0 && toRemove.length === 0) return;

  // Use Zotero.DB.executeTransaction so the user library only sees a
  // single notifier batch.
  await Zotero.DB.executeTransaction(async () => {
    for (const id of toRemove) {
      const it = await Zotero.Items.getAsync(id);
      if (it) {
        it.removeFromCollection(collection.id);
        await it.save({ skipNotifier: false });
      }
    }
    for (const id of toAdd) {
      const it = await Zotero.Items.getAsync(id);
      if (it) {
        it.addToCollection(collection.id);
        await it.save({ skipNotifier: false });
      }
    }
  });

  Zotero.debug(
    `[ZotRead] top collection synced: +${toAdd.length} / -${toRemove.length}`,
  );
}

/**
 * IndexedDB wrapper for Acostator annotation data.
 *
 * DB name:    acostator-{projectId}
 * Stores:
 *   csv_rows    — { row_index: number, text: string }                  (keyPath: "row_index")
 *   progress    — { key: "progress", last_row_index: number }          (keyPath: "key")
 *   statuses    — { row_index: number, status: RowLocalStatus }        (keyPath: "row_index")
 *   annotations — LocalAnnotationRecord[]                              (keyPath: "local_id")
 *                 index: "by_row" on row_index
 */

export type RowLocalStatus = "pending" | "completed" | "skipped";

export interface CsvRow {
  row_index: number;
  text: string;
}

export interface ProgressRecord {
  key: "progress";
  last_row_index: number;
}

export interface RowStatusRecord {
  row_index: number;
  status: RowLocalStatus;
}

/** Local annotation record — mirrors server shape but keyed by local_id (aspect used as natural key). */
export interface LocalAnnotationRecord {
  /** local_id = aspect (unique per row) — used as IndexedDB keyPath */
  local_id: string;
  row_index: number;
  aspect: string;
  category_id: string;
  category: string;
  opinion: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  aspect_implicit: boolean;
  aspect_start: number | null;
  aspect_end: number | null;
  opinion_implicit: boolean;
  opinion_start: number | null;
  opinion_end: number | null;
  /** server-assigned id once synced; undefined while only local */
  server_id?: string;
}

const DB_VERSION = 2;

function dbName(projectId: string): string {
  return `acostator-${projectId}`;
}

function openDB(projectId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(projectId), DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("csv_rows")) {
        db.createObjectStore("csv_rows", { keyPath: "row_index" });
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("statuses")) {
        db.createObjectStore("statuses", { keyPath: "row_index" });
      }
      // v2: local annotation cache keyed by aspect (natural unique key per row)
      if (!db.objectStoreNames.contains("annotations")) {
        const store = db.createObjectStore("annotations", { keyPath: "local_id" });
        store.createIndex("by_row", "row_index", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbPutBulk(db: IDBDatabase, storeName: string, values: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const value of values) {
      store.put(value);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbCount(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns true if csv_rows store is already populated for this project. */
export async function hasCachedCSV(projectId: string): Promise<boolean> {
  const db = await openDB(projectId);
  const count = await idbCount(db, "csv_rows");
  db.close();
  return count > 0;
}

/** Persist all CSV rows for a project into IndexedDB. */
export async function saveCSVRows(projectId: string, rows: CsvRow[]): Promise<void> {
  const db = await openDB(projectId);
  await idbPutBulk(db, "csv_rows", rows);
  db.close();
}

/** Retrieve all CSV rows, sorted by row_index ascending. */
export async function getCSVRows(projectId: string): Promise<CsvRow[]> {
  const db = await openDB(projectId);
  const rows = await idbGetAll<CsvRow>(db, "csv_rows");
  db.close();
  return rows.sort((a, b) => a.row_index - b.row_index);
}

/** Get a single CSV row by index. */
export async function getCSVRow(projectId: string, rowIndex: number): Promise<CsvRow | undefined> {
  const db = await openDB(projectId);
  const row = await idbGet<CsvRow>(db, "csv_rows", rowIndex);
  db.close();
  return row;
}

/** Save the last-visited row index for resume-on-reload. */
export async function saveProgress(projectId: string, lastRowIndex: number): Promise<void> {
  const db = await openDB(projectId);
  await idbPut(db, "progress", { key: "progress", last_row_index: lastRowIndex });
  db.close();
}

/** Load the last-visited row index, or null if none saved. */
export async function loadProgress(projectId: string): Promise<number | null> {
  const db = await openDB(projectId);
  const rec = await idbGet<ProgressRecord>(db, "progress", "progress");
  db.close();
  return rec?.last_row_index ?? null;
}

/** Mark a row as completed or skipped locally. */
export async function setRowStatus(
  projectId: string,
  rowIndex: number,
  status: RowLocalStatus
): Promise<void> {
  const db = await openDB(projectId);
  await idbPut(db, "statuses", { row_index: rowIndex, status });
  db.close();
}

/** Get local status of a row (undefined means never touched = "pending"). */
export async function getRowStatus(projectId: string, rowIndex: number): Promise<RowLocalStatus> {
  const db = await openDB(projectId);
  const rec = await idbGet<RowStatusRecord>(db, "statuses", rowIndex);
  db.close();
  return rec?.status ?? "pending";
}

/** Get all row statuses as a map of row_index → status. */
export async function getAllRowStatuses(projectId: string): Promise<Map<number, RowLocalStatus>> {
  const db = await openDB(projectId);
  const records = await idbGetAll<RowStatusRecord>(db, "statuses");
  db.close();
  const map = new Map<number, RowLocalStatus>();
  for (const r of records) {
    map.set(r.row_index, r.status);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Annotation cache helpers
// ---------------------------------------------------------------------------

/** Get all locally-cached annotations for a specific row. */
export async function getLocalAnnotations(
  projectId: string,
  rowIndex: number
): Promise<LocalAnnotationRecord[]> {
  const db = await openDB(projectId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("annotations", "readonly");
    const index = tx.objectStore("annotations").index("by_row");
    const req = index.getAll(rowIndex);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as LocalAnnotationRecord[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Overwrite all locally-cached annotations for a row (replaces existing). */
export async function saveLocalAnnotations(
  projectId: string,
  rowIndex: number,
  records: LocalAnnotationRecord[]
): Promise<void> {
  const db = await openDB(projectId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("annotations", "readwrite");
    const store = tx.objectStore("annotations");
    // Delete all existing records for this row first
    const index = store.index("by_row");
    const cursorReq = index.openCursor(rowIndex);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        // All deleted — now put the new records
        for (const rec of records) {
          store.put(rec);
        }
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Delete a single local annotation by its local_id (aspect). */
export async function deleteLocalAnnotation(projectId: string, localId: string): Promise<void> {
  const db = await openDB(projectId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("annotations", "readwrite");
    const req = tx.objectStore("annotations").delete(localId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/**
 * Clear all data for a project from IndexedDB — all stores are wiped.
 * Call this after a dataset is deleted or replaced so stale local data is gone.
 */
export async function clearProjectData(projectId: string): Promise<void> {
  const db = await openDB(projectId);
  await new Promise<void>((resolve, reject) => {
    const stores = ["csv_rows", "progress", "statuses", "annotations"] as const;
    const tx = db.transaction(stores, "readwrite");
    for (const store of stores) {
      tx.objectStore(store).clear();
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

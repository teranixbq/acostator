/**
 * IndexedDB wrapper for Acostator annotation data.
 *
 * DB name:    acostator-{projectId}
 * Stores:
 *   csv_rows  — { row_index: number, text: string }         (keyPath: "row_index")
 *   progress  — { key: "progress", last_row_index: number } (keyPath: "key")
 *   statuses  — { row_index: number, status: RowLocalStatus }(keyPath: "row_index")
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

const DB_VERSION = 1;

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

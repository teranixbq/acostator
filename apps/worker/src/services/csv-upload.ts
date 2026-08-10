import { eq } from "drizzle-orm";
import { projects } from "../db/schema.ts";
import type { AppDb } from "../lib/db.ts";
import type { Env } from "../lib/db.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitUploadResult {
  uploadId: string;
  /** Worker-hosted endpoint the client PUTs the raw CSV body to */
  uploadUrl: string;
}

// ---------------------------------------------------------------------------
// initUpload
// ---------------------------------------------------------------------------

/**
 * Reserves an upload slot and returns an uploadId + a worker-hosted URL
 * the client can PUT the raw CSV body to.
 *
 * We store a small metadata JSON in R2 so completeUpload can verify that
 * the upload belongs to this project before processing.
 */
export async function initUpload(
  env: Env,
  projectId: string,
  fileName: string,
  fileSize: number,
  baseUrl: string
): Promise<InitUploadResult> {
  const uploadId = crypto.randomUUID();

  // Store metadata so completeUpload can validate ownership
  const meta = JSON.stringify({ projectId, fileName, fileSize });
  await env.BUCKET.put(`uploads/${projectId}/${uploadId}.meta.json`, meta, {
    httpMetadata: { contentType: "application/json" },
  });

  // The client PUTs the CSV to this worker endpoint
  const uploadUrl = `${baseUrl}/projects/${projectId}/upload/${uploadId}`;

  return { uploadId, uploadUrl };
}

// ---------------------------------------------------------------------------
// storeUploadedFile
// ---------------------------------------------------------------------------

/**
 * Receives the raw CSV bytes the client PUT to the worker and persists them
 * in R2 for completeUpload to process.
 */
export async function storeUploadedFile(
  env: Env,
  projectId: string,
  uploadId: string,
  body: ReadableStream | ArrayBuffer
): Promise<void> {
  // Verify the meta file exists (i.e. init was called)
  const meta = await env.BUCKET.head(`uploads/${projectId}/${uploadId}.meta.json`);
  if (!meta) {
    throw new Error("Upload not initialised — call init first");
  }

  await env.BUCKET.put(`uploads/${projectId}/${uploadId}.csv`, body, {
    httpMetadata: { contentType: "text/csv" },
  });
}

// ---------------------------------------------------------------------------
// completeUpload
// ---------------------------------------------------------------------------

// D1 batch API limit: max 100 statements per env.DB.batch() call.
const D1_BATCH_SIZE = 100;

/**
 * Reads the CSV previously stored in R2, parses it, inserts dataset_rows via
 * D1's native batch API (each row is a separate prepared statement, so there
 * is no risk of hitting D1/SQLite's 999 SQL-variable limit), optionally
 * shuffles the annotation queue, and updates the project record.
 */
export async function completeUpload(
  env: Env,
  db: AppDb,
  projectId: string,
  uploadId: string,
  _userId: string
): Promise<void> {
  // --- 1. Verify project ownership ---
  const [project] = await db
    .select({
      id: projects.id,
      annotation_order: projects.annotation_order,
      file_name: projects.file_name,
    })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) throw new Error("Project not found");

  // --- 2. Load meta ---
  const metaObj = await env.BUCKET.get(`uploads/${projectId}/${uploadId}.meta.json`);
  if (!metaObj) throw new Error("Upload metadata not found — was init called?");

  type UploadMeta = { projectId: string; fileName: string; fileSize: number };
  const meta = (await metaObj.json()) as UploadMeta;

  if (meta.projectId !== projectId) throw new Error("Upload does not belong to this project");

  // --- 3. Fetch CSV from R2 ---
  const csvObj = await env.BUCKET.get(`uploads/${projectId}/${uploadId}.csv`);
  if (!csvObj) throw new Error("CSV file not found — was the file uploaded?");

  const csvText = await csvObj.text();

  // --- 4. Parse CSV (no external libraries — pure TextDecoder approach) ---
  const lines = splitCsvLines(csvText);

  if (lines.length < 2) {
    // Clean up R2 artefacts before throwing so we don't leave orphans
    await cleanupR2(env, projectId, uploadId);
    throw new Error("CSV must have a header row and at least one data row");
  }

  // lines[0] is safe: we checked lines.length >= 2 above
  const headers = parseCSVRow(lines[0] as string);
  if (headers.length === 0) {
    await cleanupR2(env, projectId, uploadId);
    throw new Error("CSV header row is empty");
  }

  // Find the `text` column; fall back to the first column
  const textColIndex = (() => {
    const idx = headers.findIndex((h) => h.toLowerCase() === "text");
    return idx === -1 ? 0 : idx;
  })();

  const dataLines = lines.slice(1).filter((l) => l.trim() !== "");
  if (dataLines.length === 0) {
    await cleanupR2(env, projectId, uploadId);
    throw new Error("CSV contains no data rows");
  }

  // --- 5. Batch insert dataset_rows via D1 native batch API ---
  // Each row becomes its own prepared statement so there is no risk of
  // exceeding D1/SQLite's 999 SQL-variable limit regardless of CSV size.
  const now = new Date().toISOString();
  const rowIds: string[] = [];

  const stmts = dataLines.map((line, i) => {
    const cols = parseCSVRow(line);
    const text = cols[textColIndex] ?? "";
    const id = crypto.randomUUID();
    rowIds.push(id);
    return env.DB.prepare(
      "INSERT INTO dataset_rows (id, project_id, row_index, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, projectId, i, text, "pending", now, now);
  });

  // D1 batch accepts at most 100 statements per call
  for (let i = 0; i < stmts.length; i += D1_BATCH_SIZE) {
    await env.DB.batch(stmts.slice(i, i + D1_BATCH_SIZE));
  }

  // --- 6. Build annotation queue for random order ---
  let annotationQueue: string | null = null;
  if ((await getAnnotationOrder(db, projectId)) === "random") {
    const indices = rowIds.map((_, i) => i);
    fisherYatesShuffle(indices);
    annotationQueue = JSON.stringify(indices);
  }

  // --- 7. Update project ---
  await db
    .update(projects)
    .set({
      file_name: meta.fileName,
      file_size: meta.fileSize,
      total_rows: dataLines.length,
      annotation_queue: annotationQueue,
      updated_at: now,
    })
    .where(eq(projects.id, projectId));

  // --- 8. Delete R2 artefacts ---
  await cleanupR2(env, projectId, uploadId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAnnotationOrder(db: AppDb, projectId: string): Promise<string> {
  const [p] = await db
    .select({ annotation_order: projects.annotation_order })
    .from(projects)
    .where(eq(projects.id, projectId));
  return p?.annotation_order ?? "sequential";
}

async function cleanupR2(env: Env, projectId: string, uploadId: string): Promise<void> {
  await env.BUCKET.delete([
    `uploads/${projectId}/${uploadId}.csv`,
    `uploads/${projectId}/${uploadId}.meta.json`,
  ]);
}

/**
 * Splits a CSV string into non-empty logical lines, handling quoted fields
 * that may contain embedded newlines.
 */
function splitCsvLines(csv: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && csv[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && csv[i + 1] === "\n") i++; // CRLF
      if (current.length > 0) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Parses a single CSV row into fields, handling quoted fields with
 * embedded commas and escaped double-quotes.
 */
function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** In-place Fisher-Yates shuffle */
function fisherYatesShuffle(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // noUncheckedIndexedAccess: i and j are always valid indices by construction
    const tmp = arr[i] as number;
    arr[i] = arr[j] as number;
    arr[j] = tmp;
  }
}

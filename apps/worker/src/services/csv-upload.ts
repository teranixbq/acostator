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
  textColumn: string,
  baseUrl: string
): Promise<InitUploadResult> {
  const uploadId = crypto.randomUUID();

  // Store metadata so completeUpload can validate ownership and know which column is text
  const meta = JSON.stringify({ projectId, fileName, fileSize, textColumn });
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
 * in R2 temporarily until completeUpload is called.
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

/**
 * Reads the CSV previously stored in R2, counts data rows, copies it to the
 * permanent project key in R2, and updates the project record (file_name,
 * file_size, total_rows, text_column).
 *
 * No rows are inserted into D1 — the CSV stays in R2 and is the source of
 * truth for row data.
 */
export async function completeUpload(
  env: Env,
  db: AppDb,
  projectId: string,
  uploadId: string,
  _userId: string
): Promise<void> {
  // --- 1. Verify project exists ---
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) throw new Error("Project not found");

  // --- 2. Load meta ---
  const metaObj = await env.BUCKET.get(`uploads/${projectId}/${uploadId}.meta.json`);
  if (!metaObj) throw new Error("Upload metadata not found — was init called?");

  type UploadMeta = { projectId: string; fileName: string; fileSize: number; textColumn: string };
  const meta = (await metaObj.json()) as UploadMeta;

  if (meta.projectId !== projectId) throw new Error("Upload does not belong to this project");

  // --- 3. Fetch CSV from R2 ---
  const csvObj = await env.BUCKET.get(`uploads/${projectId}/${uploadId}.csv`);
  if (!csvObj) throw new Error("CSV file not found — was the file uploaded?");

  const csvText = await csvObj.text();

  // --- 4. Parse and validate CSV ---
  const lines = splitCsvLines(csvText);

  if (lines.length < 2) {
    await cleanupR2Temp(env, projectId, uploadId);
    throw new Error("CSV must have a header row and at least one data row");
  }

  // lines[0] is safe: we checked lines.length >= 2 above
  const headers = parseCSVRow(lines[0] as string);
  if (headers.length === 0) {
    await cleanupR2Temp(env, projectId, uploadId);
    throw new Error("CSV header row is empty");
  }

  // Count data rows (everything after the header)
  const totalRows = lines.length - 1;

  // --- 5. Copy CSV to permanent project key in R2 ---
  // Key: projects/{projectId}/data.csv — stable URL for GET /projects/:id/csv
  await env.BUCKET.put(`projects/${projectId}/data.csv`, csvText, {
    httpMetadata: { contentType: "text/csv" },
  });

  // --- 6. Delete temp upload artefacts ---
  await cleanupR2Temp(env, projectId, uploadId);

  // --- 7. Update project record ---
  await db
    .update(projects)
    .set({
      file_name: meta.fileName,
      file_size: meta.fileSize,
      total_rows: totalRows,
      text_column: meta.textColumn,
      updated_at: new Date().toISOString(),
    })
    .where(eq(projects.id, projectId));
}

// ---------------------------------------------------------------------------
// getProjectCsv
// ---------------------------------------------------------------------------

/**
 * Returns the R2 object for a project's permanent CSV, or null if not found.
 */
export async function getProjectCsv(env: Env, projectId: string): Promise<R2ObjectBody | null> {
  return env.BUCKET.get(`projects/${projectId}/data.csv`);
}

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/** Deletes the temporary upload artefacts (meta + raw csv) from R2. */
async function cleanupR2Temp(env: Env, projectId: string, uploadId: string): Promise<void> {
  await Promise.all([
    env.BUCKET.delete(`uploads/${projectId}/${uploadId}.meta.json`),
    env.BUCKET.delete(`uploads/${projectId}/${uploadId}.csv`),
  ]);
}

/**
 * Splits a CSV string into lines, correctly handling quoted fields
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

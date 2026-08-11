import { ProjectParamsSchema } from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { annotations, projects } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";
import { getProjectCsv } from "../services/csv-upload.ts";

type Variables = AuthVariables;

export const exportRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

exportRoutes.use("*", requireAuth);

const ExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

// GET /projects/:projectId/export?format=json|csv
//
// Loads the raw CSV from R2, reads the text_column to extract the text field,
// then joins with annotations from D1 to produce the export payload.
exportRoutes.get(
  "/:projectId/export",
  zValidator("param", ProjectParamsSchema),
  zValidator("query", ExportQuerySchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { format } = c.req.valid("query");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership and get text_column
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        text_column: projects.text_column,
        file_name: projects.file_name,
      })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.user_id, session.user_id),
          isNull(projects.deleted_at)
        )
      );

    if (!project) return c.json({ error: "Not found" }, 404);

    // Load CSV from R2
    const csvObj = await getProjectCsv(c.env, projectId);
    if (!csvObj) {
      if (format === "csv") {
        c.header("Content-Type", "text/csv; charset=utf-8");
        c.header("Content-Disposition", `attachment; filename="export-${projectId}.csv"`);
        return c.body("text,aspect,category,opinion,sentiment\n");
      }
      return c.json({ project: { id: project.id, name: project.name }, rows: [] });
    }

    const csvText = await csvObj.text();
    const csvLines = splitCsvLines(csvText);

    // Build row index → text map from the CSV
    const rowTextMap = new Map<number, string>();
    if (csvLines.length >= 2) {
      const headers = parseCSVRow(csvLines[0] as string).map((h) => h.trim().toLowerCase());
      // Find text column index: use project.text_column, fall back to first column
      const textColIdx = (() => {
        const idx = headers.indexOf(project.text_column.toLowerCase());
        return idx >= 0 ? idx : 0;
      })();

      for (let i = 1; i < csvLines.length; i++) {
        const fields = parseCSVRow(csvLines[i] as string);
        const text = fields[textColIdx] ?? "";
        rowTextMap.set(i - 1, text); // row_index is 0-based
      }
    }

    // Load all annotations for this project from D1
    const annotationRows = await db
      .select()
      .from(annotations)
      .where(eq(annotations.project_id, projectId));

    // Group annotations by row_index
    const annotsByRow = new Map<number, typeof annotationRows>();
    for (const ann of annotationRows) {
      const existing = annotsByRow.get(ann.row_index);
      if (existing) {
        existing.push(ann);
      } else {
        annotsByRow.set(ann.row_index, [ann]);
      }
    }

    // Build the set of row indices to include in export:
    // all rows that have at least one annotation
    const annotatedIndices = Array.from(annotsByRow.keys()).sort((a, b) => a - b);

    if (annotatedIndices.length === 0) {
      if (format === "csv") {
        c.header("Content-Type", "text/csv; charset=utf-8");
        c.header("Content-Disposition", `attachment; filename="export-${projectId}.csv"`);
        return c.body("text,aspect,category,opinion,sentiment\n");
      }
      return c.json({ project: { id: project.id, name: project.name }, rows: [] });
    }

    if (format === "json") {
      const rows = annotatedIndices.map((rowIndex) => ({
        row_index: rowIndex,
        text: rowTextMap.get(rowIndex) ?? "",
        annotations: (annotsByRow.get(rowIndex) ?? []).map((ann) => ({
          aspect: ann.aspect,
          category: ann.category,
          opinion: ann.opinion,
          sentiment: ann.sentiment,
        })),
      }));

      c.header("Content-Type", "application/json; charset=utf-8");
      c.header("Content-Disposition", `attachment; filename="export-${projectId}.json"`);
      return c.json({ project: { id: project.id, name: project.name }, rows });
    }

    // CSV format — one line per annotation quadruple
    const csvOutLines: string[] = ["text,aspect,category,opinion,sentiment"];

    for (const rowIndex of annotatedIndices) {
      const text = rowTextMap.get(rowIndex) ?? "";
      const rowAnnotations = annotsByRow.get(rowIndex) ?? [];
      for (const ann of rowAnnotations) {
        csvOutLines.push(
          [
            csvEscape(text),
            csvEscape(ann.aspect),
            csvEscape(ann.category),
            csvEscape(ann.opinion),
            csvEscape(ann.sentiment),
          ].join(",")
        );
      }
    }

    const csvBody = `${csvOutLines.join("\n")}\n`;

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="export-${projectId}.csv"`);
    return c.body(csvBody);
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps a field value in double-quotes and escapes internal double-quotes. */
function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Splits a CSV string into raw lines, correctly handling quoted fields
 * that may contain embedded newlines. Each line is returned verbatim
 * (quotes intact) for parseCSVRow to decode.
 */
function splitCsvLines(csv: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        // Escaped quote — keep both chars verbatim, parseCSVRow will decode
        current += '""';
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

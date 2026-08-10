import { ProjectParamsSchema } from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { categories, datasetRows, projects, quadruples } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";

type Variables = AuthVariables;

export const exportRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

exportRoutes.use("*", requireAuth);

const ExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

// GET /projects/:projectId/export?format=json|csv
exportRoutes.get(
  "/:projectId/export",
  zValidator("param", ProjectParamsSchema),
  zValidator("query", ExportQuerySchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { format } = c.req.valid("query");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.user_id, session.user_id),
          isNull(projects.deleted_at)
        )
      );

    if (!project) return c.json({ error: "Not found" }, 404);

    // Fetch all completed rows for this project
    const completedRows = await db
      .select({
        id: datasetRows.id,
        text: datasetRows.text,
        status: datasetRows.status,
        row_index: datasetRows.row_index,
      })
      .from(datasetRows)
      .where(and(eq(datasetRows.project_id, projectId), eq(datasetRows.status, "completed")));

    if (completedRows.length === 0) {
      if (format === "csv") {
        // Return empty CSV with just the header
        c.header("Content-Type", "text/csv; charset=utf-8");
        c.header("Content-Disposition", `attachment; filename="export-${projectId}.csv"`);
        return c.body("text/aspect_term,category,opinion_term,sentiment\n");
      }
      return c.json({ project: { id: project.id, name: project.name }, rows: [] });
    }

    const _rowIds = completedRows.map((r) => r.id);

    // Fetch all quadruples for these rows in one query
    // We join categories to get the category name
    const quads = await db
      .select({
        row_id: quadruples.row_id,
        aspect_term: quadruples.aspect_term,
        opinion_term: quadruples.opinion_term,
        sentiment: quadruples.sentiment,
        category_name: categories.name,
      })
      .from(quadruples)
      .innerJoin(categories, eq(quadruples.category_id, categories.id))
      .where(eq(quadruples.project_id, projectId));

    // Group quadruples by row_id for fast lookup
    const quadsByRow = new Map<string, typeof quads>();
    for (const q of quads) {
      const existing = quadsByRow.get(q.row_id);
      if (existing) {
        existing.push(q);
      } else {
        quadsByRow.set(q.row_id, [q]);
      }
    }

    if (format === "json") {
      const rows = completedRows.map((row) => ({
        id: row.id,
        text: row.text,
        status: row.status,
        quadruples: (quadsByRow.get(row.id) ?? []).map((q) => ({
          aspect_term: q.aspect_term,
          category: q.category_name,
          opinion_term: q.opinion_term,
          sentiment: q.sentiment,
        })),
      }));

      c.header("Content-Type", "application/json; charset=utf-8");
      c.header("Content-Disposition", `attachment; filename="export-${projectId}.json"`);
      return c.json({ project: { id: project.id, name: project.name }, rows });
    }

    // CSV format — one line per quadruple
    // Rows with no quadruples are still included as a single line with empty quad fields
    const csvLines: string[] = ["text,aspect_term,category,opinion_term,sentiment"];

    for (const row of completedRows) {
      const rowQuads = quadsByRow.get(row.id) ?? [];
      if (rowQuads.length === 0) {
        csvLines.push([csvEscape(row.text), "", "", "", ""].join(","));
      } else {
        for (const q of rowQuads) {
          csvLines.push(
            [
              csvEscape(row.text),
              csvEscape(q.aspect_term),
              csvEscape(q.category_name),
              csvEscape(q.opinion_term),
              csvEscape(q.sentiment),
            ].join(",")
          );
        }
      }
    }

    const csvBody = `${csvLines.join("\n")}\n`;

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

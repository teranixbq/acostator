import { AnnotationCreateSchema, ProjectParamsSchema } from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { annotations, projects } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";
import { getProjectCsv } from "../services/csv-upload.ts";

type Variables = AuthVariables;

export const annotationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

annotationRoutes.use("*", requireAuth);

// ---------------------------------------------------------------------------
// GET /projects/:projectId/csv — stream the project's CSV from R2
// ---------------------------------------------------------------------------

annotationRoutes.get("/:projectId/csv", zValidator("param", ProjectParamsSchema), async (c) => {
  const { projectId } = c.req.valid("param");
  const session = c.get("session");
  const db = createDb(c.env);

  // Verify project ownership
  const [project] = await db
    .select({ id: projects.id, file_name: projects.file_name })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.user_id, session.user_id),
        isNull(projects.deleted_at)
      )
    );

  if (!project) return c.json({ error: "Not found" }, 404);

  const csvObj = await getProjectCsv(c.env, projectId);
  if (!csvObj) return c.json({ error: "CSV not found — upload a file first" }, 404);

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${project.file_name}"`);
  return c.body(csvObj.body);
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/annotations — list all annotations for a project
// ---------------------------------------------------------------------------

annotationRoutes.get(
  "/:projectId/annotations",
  zValidator("param", ProjectParamsSchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.user_id, session.user_id),
          isNull(projects.deleted_at)
        )
      );

    if (!project) return c.json({ error: "Not found" }, 404);

    const rows = await db.select().from(annotations).where(eq(annotations.project_id, projectId));

    return c.json({ data: rows });
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:projectId/annotations — insert one annotation quadruple
// ---------------------------------------------------------------------------

annotationRoutes.post(
  "/:projectId/annotations",
  zValidator("param", ProjectParamsSchema),
  zValidator("json", AnnotationCreateSchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const input = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.user_id, session.user_id),
          isNull(projects.deleted_at)
        )
      );

    if (!project) return c.json({ error: "Not found" }, 404);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(annotations).values({
      id,
      project_id: projectId,
      row_index: input.row_index,
      aspect: input.aspect,
      category: input.category,
      opinion: input.opinion,
      sentiment: input.sentiment,
      created_at: now,
      updated_at: now,
    });

    const [created] = await db.select().from(annotations).where(eq(annotations.id, id));

    return c.json({ data: created }, 201);
  }
);

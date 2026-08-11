import {
  AnnotationCreateSchema,
  AnnotationParamsSchema,
  AnnotationQuerySchema,
  AnnotationUpdateSchema,
  ProjectParamsSchema,
} from "@acostator/shared";
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
// GET /projects/:projectId/annotations — list annotations, optionally filtered by row_index
// ---------------------------------------------------------------------------

annotationRoutes.get(
  "/:projectId/annotations",
  zValidator("param", ProjectParamsSchema),
  zValidator("query", AnnotationQuerySchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { row_index } = c.req.valid("query");
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

    const conditions = [eq(annotations.project_id, projectId)];
    if (row_index !== undefined) {
      conditions.push(eq(annotations.row_index, row_index));
    }

    const rows = await db
      .select()
      .from(annotations)
      .where(and(...conditions));

    return c.json({ data: rows });
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:projectId/annotations — create a new annotation
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
      status: input.status ?? "completed",
      created_at: now,
      updated_at: now,
    });

    const [created] = await db.select().from(annotations).where(eq(annotations.id, id));

    return c.json({ data: created }, 201);
  }
);

// ---------------------------------------------------------------------------
// PUT /projects/:projectId/annotations/:annotationId — update an annotation
// ---------------------------------------------------------------------------

annotationRoutes.put(
  "/:projectId/annotations/:annotationId",
  zValidator("param", AnnotationParamsSchema),
  zValidator("json", AnnotationUpdateSchema),
  async (c) => {
    const { projectId, annotationId } = c.req.valid("param");
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

    // Verify annotation belongs to this project
    const [existing] = await db
      .select()
      .from(annotations)
      .where(and(eq(annotations.id, annotationId), eq(annotations.project_id, projectId)));

    if (!existing) return c.json({ error: "Annotation not found" }, 404);

    const now = new Date().toISOString();

    // Build partial update — only fields explicitly provided
    const updates: Partial<typeof existing> = { updated_at: now };
    if (input.aspect !== undefined) updates.aspect = input.aspect;
    if (input.category !== undefined) updates.category = input.category;
    if (input.opinion !== undefined) updates.opinion = input.opinion;
    if (input.sentiment !== undefined) updates.sentiment = input.sentiment;
    if (input.status !== undefined) updates.status = input.status;

    await db.update(annotations).set(updates).where(eq(annotations.id, annotationId));

    const [updated] = await db.select().from(annotations).where(eq(annotations.id, annotationId));

    return c.json({ data: updated });
  }
);

// ---------------------------------------------------------------------------
// DELETE /projects/:projectId/annotations/:annotationId — remove an annotation
// ---------------------------------------------------------------------------

annotationRoutes.delete(
  "/:projectId/annotations/:annotationId",
  zValidator("param", AnnotationParamsSchema),
  async (c) => {
    const { projectId, annotationId } = c.req.valid("param");
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

    // Verify annotation belongs to this project before deleting
    const [existing] = await db
      .select({ id: annotations.id })
      .from(annotations)
      .where(and(eq(annotations.id, annotationId), eq(annotations.project_id, projectId)));

    if (!existing) return c.json({ error: "Annotation not found" }, 404);

    await db.delete(annotations).where(eq(annotations.id, annotationId));

    return c.json({ success: true });
  }
);

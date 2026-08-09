import {
  CreateQuadrupleSchema,
  PaginationSchema,
  QuadrupleParamsSchema,
  RowParamsSchema,
  UpdateRowStatusSchema,
} from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { categories, datasetRows, projects, quadruples } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";

type Variables = AuthVariables;

export const rowRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

rowRoutes.use("*", requireAuth);

// GET /projects/:projectId/rows — paginated list
rowRoutes.get(
  "/",
  zValidator("param", RowParamsSchema.pick({ projectId: true })),
  zValidator("query", PaginationSchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { page, limit } = c.req.valid("query");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
    const [project] = await db
      .select({
        id: projects.id,
        annotation_order: projects.annotation_order,
        annotation_queue: projects.annotation_queue,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

    if (!project) return c.json({ error: "Not found" }, 404);

    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(datasetRows)
      .where(eq(datasetRows.project_id, projectId))
      .orderBy(asc(datasetRows.row_index))
      .limit(limit)
      .offset(offset);

    return c.json({ data: rows, page, limit });
  }
);

// GET /projects/:projectId/rows/next — get next row to annotate
rowRoutes.get(
  "/next",
  zValidator("param", RowParamsSchema.pick({ projectId: true })),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const session = c.get("session");
    const db = createDb(c.env);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

    if (!project) return c.json({ error: "Not found" }, 404);

    if (project.annotation_order === "random" && project.annotation_queue) {
      // Pop first item from queue
      const queue = JSON.parse(project.annotation_queue) as number[];
      const nextIndex = queue[0];
      if (nextIndex === undefined) return c.json({ data: null });

      const [row] = await db
        .select()
        .from(datasetRows)
        .where(and(eq(datasetRows.project_id, projectId), eq(datasetRows.row_index, nextIndex)));

      return c.json({ data: row ?? null });
    }

    // Sequential: find first pending row
    const [row] = await db
      .select()
      .from(datasetRows)
      .where(and(eq(datasetRows.project_id, projectId), eq(datasetRows.status, "pending")))
      .orderBy(asc(datasetRows.row_index))
      .limit(1);

    return c.json({ data: row ?? null });
  }
);

// GET /projects/:projectId/rows/:rowId
rowRoutes.get("/:rowId", zValidator("param", RowParamsSchema), async (c) => {
  const { projectId, rowId } = c.req.valid("param");
  const session = c.get("session");
  const db = createDb(c.env);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

  if (!project) return c.json({ error: "Not found" }, 404);

  const [row] = await db
    .select()
    .from(datasetRows)
    .where(and(eq(datasetRows.id, rowId), eq(datasetRows.project_id, projectId)));

  if (!row) return c.json({ error: "Not found" }, 404);

  const rowQuadruples = await db
    .select()
    .from(quadruples)
    .where(and(eq(quadruples.row_id, rowId), eq(quadruples.project_id, projectId)));

  return c.json({ data: { ...row, quadruples: rowQuadruples } });
});

// PATCH /projects/:projectId/rows/:rowId/status
rowRoutes.patch(
  "/:rowId/status",
  zValidator("param", RowParamsSchema),
  zValidator("json", UpdateRowStatusSchema),
  async (c) => {
    const { projectId, rowId } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    const [project] = await db
      .select({
        id: projects.id,
        annotation_order: projects.annotation_order,
        annotation_queue: projects.annotation_queue,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

    if (!project) return c.json({ error: "Not found" }, 404);

    const [row] = await db
      .select({ id: datasetRows.id, row_index: datasetRows.row_index })
      .from(datasetRows)
      .where(and(eq(datasetRows.id, rowId), eq(datasetRows.project_id, projectId)));

    if (!row) return c.json({ error: "Not found" }, 404);

    await db
      .update(datasetRows)
      .set({ status, updated_at: new Date().toISOString() })
      .where(eq(datasetRows.id, rowId));

    // Pop the completed/skipped row from the random annotation queue
    if (project.annotation_order === "random" && project.annotation_queue) {
      const queue = JSON.parse(project.annotation_queue) as number[];
      const updatedQueue = queue.filter((idx) => idx !== row.row_index);
      await db
        .update(projects)
        .set({
          annotation_queue: JSON.stringify(updatedQueue),
          updated_at: new Date().toISOString(),
        })
        .where(eq(projects.id, projectId));
    }

    return c.json({ success: true });
  }
);

// POST /projects/:projectId/rows/:rowId/quadruples
rowRoutes.post(
  "/:rowId/quadruples",
  zValidator("param", RowParamsSchema),
  zValidator("json", CreateQuadrupleSchema),
  async (c) => {
    const { projectId, rowId } = c.req.valid("param");
    const input = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

    if (!project) return c.json({ error: "Not found" }, 404);

    const [row] = await db
      .select({ id: datasetRows.id })
      .from(datasetRows)
      .where(and(eq(datasetRows.id, rowId), eq(datasetRows.project_id, projectId)));

    if (!row) return c.json({ error: "Not found" }, 404);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(quadruples).values({
      id,
      row_id: rowId,
      project_id: projectId,
      aspect_term: input.aspect_term,
      aspect_implicit: input.aspect_implicit,
      aspect_start: input.aspect_start ?? null,
      aspect_end: input.aspect_end ?? null,
      category_id: input.category_id,
      opinion_term: input.opinion_term,
      opinion_implicit: input.opinion_implicit,
      opinion_start: input.opinion_start ?? null,
      opinion_end: input.opinion_end ?? null,
      sentiment: input.sentiment,
      created_at: now,
      updated_at: now,
    });

    // Increment category usage_count
    await db
      .update(categories)
      .set({
        usage_count: sql`usage_count + 1`,
        updated_at: now,
      })
      .where(eq(categories.id, input.category_id));

    const [created] = await db.select().from(quadruples).where(eq(quadruples.id, id));
    return c.json({ data: created }, 201);
  }
);

// DELETE /projects/:projectId/rows/:rowId/quadruples/:quadrupleId
rowRoutes.delete(
  "/:rowId/quadruples/:quadrupleId",
  zValidator("param", QuadrupleParamsSchema),
  async (c) => {
    const { projectId, rowId, quadrupleId } = c.req.valid("param");
    const session = c.get("session");
    const db = createDb(c.env);

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

    if (!project) return c.json({ error: "Not found" }, 404);

    const [quad] = await db
      .select()
      .from(quadruples)
      .where(
        and(
          eq(quadruples.id, quadrupleId),
          eq(quadruples.row_id, rowId),
          eq(quadruples.project_id, projectId)
        )
      );

    if (!quad) return c.json({ error: "Not found" }, 404);

    await db.delete(quadruples).where(eq(quadruples.id, quadrupleId));

    // Decrement category usage_count (floor at 0)
    await db
      .update(categories)
      .set({
        usage_count: sql`MAX(0, usage_count - 1)`,
        updated_at: new Date().toISOString(),
      })
      .where(eq(categories.id, quad.category_id));

    return c.json({ success: true });
  }
);

// needed for sql template tag above
import { sql } from "drizzle-orm";

import {
  CreateProjectSchema,
  PaginationSchema,
  ProjectParamsSchema,
  UpdateProjectSchema,
} from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { datasetRows, projects } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";

type Variables = AuthVariables;

export const projectRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

projectRoutes.use("*", requireAuth);

// GET /projects
projectRoutes.get("/", zValidator("query", PaginationSchema), async (c) => {
  const { page, limit } = c.req.valid("query");
  const session = c.get("session");
  const db = createDb(c.env);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      file_name: projects.file_name,
      file_size: projects.file_size,
      total_rows: projects.total_rows,
      status: projects.status,
      annotation_order: projects.annotation_order,
      created_at: projects.created_at,
      updated_at: projects.updated_at,
      annotated_rows: sql<number>`(
        SELECT COUNT(*) FROM dataset_rows
        WHERE dataset_rows.project_id = ${projects.id}
        AND dataset_rows.status = 'completed'
      )`,
    })
    .from(projects)
    .where(and(eq(projects.user_id, session.user_id), isNull(projects.deleted_at)))
    .limit(limit)
    .offset(offset);

  return c.json({ data: rows, page, limit });
});

// POST /projects — metadata only; CSV upload is a separate endpoint
projectRoutes.post("/", zValidator("json", CreateProjectSchema), async (c) => {
  const input = c.req.valid("json");
  const session = c.get("session");
  const db = createDb(c.env);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(projects).values({
    id,
    user_id: session.user_id,
    name: input.name,
    description: input.description ?? null,
    file_name: "",
    file_size: 0,
    total_rows: 0,
    annotation_order: input.annotation_order,
    created_at: now,
    updated_at: now,
  });

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return c.json({ data: project }, 201);
});

// GET /projects/:projectId
projectRoutes.get("/:projectId", zValidator("param", ProjectParamsSchema), async (c) => {
  const { projectId } = c.req.valid("param");
  const session = c.get("session");
  const db = createDb(c.env);

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.user_id, session.user_id),
        isNull(projects.deleted_at)
      )
    );

  if (!project) return c.json({ error: "Not found" }, 404);

  const countResult = await db
    .select({ annotated: count() })
    .from(datasetRows)
    .where(and(eq(datasetRows.project_id, projectId), eq(datasetRows.status, "completed")));

  const annotated = countResult[0]?.annotated ?? 0;
  return c.json({ data: { ...project, annotated_rows: annotated } });
});

// PATCH /projects/:projectId
projectRoutes.patch(
  "/:projectId",
  zValidator("param", ProjectParamsSchema),
  zValidator("json", UpdateProjectSchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const input = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.user_id, session.user_id),
          isNull(projects.deleted_at)
        )
      );

    if (!existing) return c.json({ error: "Not found" }, 404);

    // Build patch explicitly — exactOptionalPropertyTypes rejects spread of optional fields
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.annotation_order !== undefined) patch.annotation_order = input.annotation_order;
    if (input.description !== undefined) patch.description = input.description ?? "";

    await db.update(projects).set(patch).where(eq(projects.id, projectId));

    const [updated] = await db.select().from(projects).where(eq(projects.id, projectId));
    return c.json({ data: updated });
  }
);

// DELETE /projects/:projectId — soft delete
projectRoutes.delete("/:projectId", zValidator("param", ProjectParamsSchema), async (c) => {
  const { projectId } = c.req.valid("param");
  const session = c.get("session");
  const db = createDb(c.env);

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.user_id, session.user_id),
        isNull(projects.deleted_at)
      )
    );

  if (!existing) return c.json({ error: "Not found" }, 404);

  await db
    .update(projects)
    .set({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .where(eq(projects.id, projectId));

  return c.json({ success: true });
});

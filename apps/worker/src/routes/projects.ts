import {
  CreateProjectSchema,
  PaginationSchema,
  ProjectParamsSchema,
  UpdateProjectSchema,
  UploadCompleteSchema,
  UploadInitSchema,
} from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { annotations, projects } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";
import { completeUpload, initUpload, storeUploadedFile } from "../services/csv-upload.ts";
import { categoryRoutes } from "./categories.ts";
import { exportRoutes } from "./export.ts";
import { rowRoutes } from "./rows.ts";

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
        SELECT COUNT(*) FROM annotations
        WHERE annotations.project_id = projects.id
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
    .select({ annotated: sql<number>`COUNT(*)` })
    .from(annotations)
    .where(eq(annotations.project_id, projectId));

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

// POST /projects/:projectId/upload/init — reserve an uploadId + return upload URL
projectRoutes.post(
  "/:projectId/upload/init",
  zValidator("param", ProjectParamsSchema),
  zValidator("json", UploadInitSchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { file_name, file_size, text_column } = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
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

    // Derive base URL from the incoming request so this works in any environment
    const url = new URL(c.req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const result = await initUpload(c.env, projectId, file_name, file_size, text_column, baseUrl);
    return c.json({ data: result }, 201);
  }
);

// PUT /projects/:projectId/upload/:uploadId — receive raw CSV body and store in R2
projectRoutes.put(
  "/:projectId/upload/:uploadId",
  zValidator(
    "param",
    ProjectParamsSchema.extend({ uploadId: UploadCompleteSchema.shape.upload_id })
  ),
  async (c) => {
    const { projectId, uploadId } = c.req.valid("param");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
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

    const body = c.req.raw.body;
    if (!body) return c.json({ error: "Request body is required" }, 400);

    try {
      await storeUploadedFile(c.env, projectId, uploadId, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return c.json({ error: message }, 422);
    }

    return c.json({ success: true });
  }
);

// POST /projects/:projectId/upload/complete — parse CSV and populate dataset_rows
projectRoutes.post(
  "/:projectId/upload/complete",
  zValidator("param", ProjectParamsSchema),
  zValidator("json", UploadCompleteSchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { upload_id } = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    // Verify project ownership
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

    try {
      await completeUpload(c.env, db, projectId, upload_id, session.user_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Processing failed";
      // Empty CSV / parse errors are user errors → 422
      if (
        message.includes("no data rows") ||
        message.includes("header row") ||
        message.includes("at least one")
      ) {
        return c.json({ error: message }, 422);
      }
      return c.json({ error: message }, 400);
    }

    const [updated] = await db.select().from(projects).where(eq(projects.id, projectId));
    return c.json({ data: updated });
  }
);

// Mount sub-routers inside projectRoutes so all /projects/* paths are resolved
// by a single top-level app.route("/projects", projectRoutes) call.
// Hono strips only static prefixes in app.route(); mounting here lets Hono
// correctly match /:projectId/rows, /:projectId/categories, and /:projectId/export
// without conflicting with the upload routes above.
projectRoutes.route("/:projectId/rows", rowRoutes);
projectRoutes.route("/:projectId/categories", categoryRoutes);
projectRoutes.route("/", exportRoutes);

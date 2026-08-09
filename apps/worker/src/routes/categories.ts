import { CategoryParamsSchema, CreateCategorySchema, ProjectParamsSchema } from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { categories, projects } from "../db/schema.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";
import { type AuthVariables, requireAuth } from "../middleware/auth.ts";

type Variables = AuthVariables;

export const categoryRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

categoryRoutes.use("*", requireAuth);

// GET /projects/:projectId/categories
categoryRoutes.get("/", zValidator("param", ProjectParamsSchema), async (c) => {
  const { projectId } = c.req.valid("param");
  const session = c.get("session");
  const db = createDb(c.env);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

  if (!project) return c.json({ error: "Not found" }, 404);

  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.project_id, projectId), isNull(categories.deleted_at)))
    .orderBy(desc(categories.usage_count));

  return c.json({ data: rows });
});

// POST /projects/:projectId/categories
categoryRoutes.post(
  "/",
  zValidator("param", ProjectParamsSchema),
  zValidator("json", CreateCategorySchema),
  async (c) => {
    const { projectId } = c.req.valid("param");
    const { name } = c.req.valid("json");
    const session = c.get("session");
    const db = createDb(c.env);

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

    if (!project) return c.json({ error: "Not found" }, 404);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(categories).values({
      id,
      project_id: projectId,
      name,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    });

    const [created] = await db.select().from(categories).where(eq(categories.id, id));
    return c.json({ data: created }, 201);
  }
);

// DELETE /projects/:projectId/categories/:categoryId — soft delete if unused
categoryRoutes.delete("/:categoryId", zValidator("param", CategoryParamsSchema), async (c) => {
  const { projectId, categoryId } = c.req.valid("param");
  const session = c.get("session");
  const db = createDb(c.env);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.user_id, session.user_id)));

  if (!project) return c.json({ error: "Not found" }, 404);

  const [cat] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.project_id, projectId),
        isNull(categories.deleted_at)
      )
    );

  if (!cat) return c.json({ error: "Not found" }, 404);
  if (cat.usage_count > 0) {
    return c.json({ error: "Category is in use and cannot be deleted" }, 409);
  }

  await db
    .update(categories)
    .set({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .where(eq(categories.id, categoryId));

  return c.json({ success: true });
});

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/db.ts";
import { authRoutes } from "./routes/auth.ts";
import { categoryRoutes } from "./routes/categories.ts";
import { projectRoutes } from "./routes/projects.ts";
import { rowRoutes } from "./routes/rows.ts";

const app = new Hono<{ Bindings: Env }>();

// CORS — allow configured origins
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((o: string) => o.trim());
      if (allowed.includes(origin)) return origin;
      return allowed[0] ?? origin;
    },
    credentials: true,
  })
);

// Health check
app.get("/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

// Routes
app.route("/auth", authRoutes);
app.use("/api/*", async (_c, next) => {
  await next();
});
app.route("/api/projects", projectRoutes);
app.route("/api/projects/:projectId/rows", rowRoutes);
app.route("/api/projects/:projectId/categories", categoryRoutes);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Global error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;

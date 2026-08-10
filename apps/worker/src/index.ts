import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/db.ts";
import { authRoutes } from "./routes/auth.ts";
import { projectRoutes } from "./routes/projects.ts";

const app = new Hono<{ Bindings: Env }>();

// CORS — allow any subdomain of ALLOWED_DOMAIN env variable
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const domain = c.env.ALLOWED_DOMAIN ?? "";
      if (!origin || !domain) return null;
      if (origin === `https://${domain}` || origin.endsWith(`.${domain}`)) {
        return origin;
      }
      return null;
    },
    credentials: true,
  })
);

// Health check
app.get("/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

// Routes
app.route("/auth", authRoutes);
app.route("/projects", projectRoutes);

// 404 fallback
app.notFound((c) => {
  const origin = c.req.header("Origin") ?? "";
  const domain = c.env.ALLOWED_DOMAIN ?? "";
  if (origin && domain && (origin === `https://${domain}` || origin.endsWith(`.${domain}`))) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
  }
  return c.json({ error: "Not found" }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error(err);
  const origin = c.req.header("Origin") ?? "";
  const domain = c.env.ALLOWED_DOMAIN ?? "";
  if (origin && domain && (origin === `https://${domain}` || origin.endsWith(`.${domain}`))) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
  }
  return c.json({ error: "Internal server error" }, 500);
});

export default app;

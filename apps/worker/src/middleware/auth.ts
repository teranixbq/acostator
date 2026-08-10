import type { SessionPayload } from "@acostator/shared";
import { createMiddleware } from "hono/factory";
import { getSessionToken, verifySessionToken } from "../lib/auth.ts";
import type { Env } from "../lib/db.ts";

export type AuthVariables = {
  session: SessionPayload;
};

/**
 * Requires a valid session cookie. Returns 401 if missing or invalid.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const token = getSessionToken(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await verifySessionToken(token, c.env.AUTH_SECRET);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("session", session);
  await next();
});

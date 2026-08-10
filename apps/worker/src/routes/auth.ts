import { GithubCallbackSchema } from "@acostator/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { users } from "../db/schema.ts";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "../lib/auth.ts";
import type { Env } from "../lib/db.ts";
import { createDb } from "../lib/db.ts";

export const authRoutes = new Hono<{ Bindings: Env }>();

// GET /auth/github — redirect to GitHub OAuth
authRoutes.get("/github", (c) => {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    scope: "read:user user:email",
    state,
  });

  // Store state in cookie for CSRF verification
  c.header(
    "Set-Cookie",
    `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// GET /auth/github/callback
authRoutes.get("/github/callback", zValidator("query", GithubCallbackSchema), async (c) => {
  const { code, state } = c.req.valid("query");

  // Verify CSRF state
  const cookieHeader = c.req.header("Cookie") ?? "";
  const storedState = cookieHeader.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
  if (!storedState || storedState !== state) {
    return c.json({ error: "Invalid state" }, 400);
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return c.json({ error: "Failed to get access token" }, 400);
  }

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "acostator",
    },
  });

  const githubUser = (await userRes.json()) as {
    id: number;
    login: string;
    email: string | null;
    avatar_url: string;
  };

  // Upsert user in D1
  const db = createDb(c.env);
  const userId = `github_${githubUser.id}`;

  await db
    .insert(users)
    .values({
      id: userId,
      github_id: String(githubUser.id),
      username: githubUser.login,
      email: githubUser.email,
      avatar_url: githubUser.avatar_url,
    })
    .onConflictDoUpdate({
      target: users.github_id,
      set: {
        username: githubUser.login,
        email: githubUser.email,
        avatar_url: githubUser.avatar_url,
        updated_at: new Date().toISOString(),
      },
    });

  // Create session token
  const token = await createSessionToken(
    {
      user_id: userId,
      github_id: String(githubUser.id),
      username: githubUser.login,
      avatar_url: githubUser.avatar_url,
    },
    c.env.AUTH_SECRET
  );

  setSessionCookie(c, token, c.env.ALLOWED_DOMAIN);

  // Clear oauth state cookie
  c.header("Set-Cookie", "oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/", {
    append: true,
  });

  return c.redirect(c.env.FRONTEND_URL);
});

// POST /auth/logout
authRoutes.post("/logout", (c) => {
  clearSessionCookie(c, c.env.ALLOWED_DOMAIN);
  return c.json({ success: true });
});

// GET /auth/me
authRoutes.get("/me", async (c) => {
  const cookieHeader = c.req.header("Cookie") ?? "";
  const token = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  if (!token) return c.json({ user: null });

  const { verifySessionToken } = await import("../lib/auth.ts");
  const session = await verifySessionToken(token, c.env.AUTH_SECRET);
  if (!session) return c.json({ user: null });

  return c.json({
    user: {
      id: session.user_id,
      username: session.username,
      avatar_url: session.avatar_url,
    },
  });
});

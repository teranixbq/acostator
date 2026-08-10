import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../index.ts";
import { createSessionToken, verifySessionToken } from "../lib/auth.ts";
import { TEST_SECRET, makeSessionCookie, req, seedUser } from "./helpers.ts";

// ---------------------------------------------------------------------------
// lib/auth.ts — unit tests (pure crypto, no HTTP)
// ---------------------------------------------------------------------------

describe("createSessionToken / verifySessionToken", () => {
  it("creates a token that round-trips correctly", async () => {
    const payload = { user_id: "u1", github_id: "gh1", username: "alice", avatar_url: null };
    const token = await createSessionToken(payload, TEST_SECRET);
    const result = await verifySessionToken(token, TEST_SECRET);

    expect(result).not.toBeNull();
    expect(result?.user_id).toBe("u1");
    expect(result?.username).toBe("alice");
    expect(result?.avatar_url).toBeNull();
    expect(result?.iat).toBeTypeOf("number");
    // result is non-null (asserted above); narrow for toBeGreaterThan
    const iat = (result as NonNullable<typeof result>).iat as number;
    const exp = (result as NonNullable<typeof result>).exp as number;
    expect(exp).toBeGreaterThan(iat);
  });

  it("returns null for a token signed with the wrong secret", async () => {
    const token = await createSessionToken(
      { user_id: "u1", github_id: "gh1", username: "alice", avatar_url: null },
      TEST_SECRET
    );
    const result = await verifySessionToken(token, "wrong-secret");
    expect(result).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    expect(await verifySessionToken("notavalidtoken", TEST_SECRET)).toBeNull();
    expect(await verifySessionToken("a.b", TEST_SECRET)).toBeNull();
    expect(await verifySessionToken("", TEST_SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    // Build token manually with exp in the past
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      user_id: "u1",
      github_id: "gh1",
      username: "alice",
      avatar_url: null,
      iat: now - 100,
      exp: now - 1, // already expired
    };
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = btoa(JSON.stringify(payload));
    const data = `${header}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(TEST_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const token = `${data}.${signature}`;

    expect(await verifySessionToken(token, TEST_SECRET)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /auth/github — redirect
// ---------------------------------------------------------------------------

describe("GET /auth/github", () => {
  it("redirects to GitHub OAuth with state cookie", async () => {
    const res = await app.fetch(req("GET", "/auth/github"), env);

    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("https://github.com/login/oauth/authorize");
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("scope=read%3Auser+user%3Aemail");

    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("oauth_state=");
    expect(setCookie).toContain("HttpOnly");
  });
});

// ---------------------------------------------------------------------------
// GET /auth/github/callback — CSRF state mismatch
// ---------------------------------------------------------------------------

describe("GET /auth/github/callback", () => {
  it("returns 400 when state is missing from cookie", async () => {
    const res = await app.fetch(req("GET", "/auth/github/callback?code=abc&state=xyz"), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid state");
  });

  it("returns 400 when state cookie does not match query param", async () => {
    const request = new Request("http://localhost/auth/github/callback?code=abc&state=xyz", {
      headers: { Cookie: "oauth_state=different-state" },
    });
    const res = await app.fetch(request, env);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe("POST /auth/logout", () => {
  it("clears the session cookie and returns success", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("POST", "/auth/logout", { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("session=;");
    expect(setCookie).toContain("Max-Age=0");
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

describe("GET /auth/me", () => {
  it("returns user: null when no session cookie present", async () => {
    const res = await app.fetch(req("GET", "/auth/me"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: null };
    expect(body.user).toBeNull();
  });

  it("returns user: null for an invalid token", async () => {
    const request = new Request("http://localhost/auth/me", {
      headers: { Cookie: "session=garbage" },
    });
    const res = await app.fetch(request, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: null };
    expect(body.user).toBeNull();
  });

  it("returns the user payload for a valid session", async () => {
    const userId = await seedUser(env, { username: "alice" });
    const cookie = await makeSessionCookie(userId, "alice", "https://example.com/avatar.png");

    const res = await app.fetch(req("GET", "/auth/me", { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { id: string; username: string; avatar_url: string };
    };
    expect(body.user).not.toBeNull();
    expect(body.user.id).toBe(userId);
    expect(body.user.username).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// requireAuth middleware — used by all protected routes
// ---------------------------------------------------------------------------

describe("requireAuth middleware", () => {
  it("returns 401 on a protected route with no cookie", async () => {
    const res = await app.fetch(req("GET", "/projects"), env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 on a protected route with an invalid token", async () => {
    const res = await app.fetch(req("GET", "/projects", { cookie: "session=bad" }), env);
    expect(res.status).toBe(401);
  });
});

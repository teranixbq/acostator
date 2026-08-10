import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../index.ts";
import { makeSessionCookie, req, seedCategory, seedProject, seedUser } from "./helpers.ts";

// ---------------------------------------------------------------------------
// GET /projects/:projectId/categories
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/categories", () => {
  it("returns empty list for a project with no categories", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/categories`, { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("returns categories ordered by usage_count descending", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    await seedCategory(env, { project_id: projectId, name: "RARE", usage_count: 1 });
    await seedCategory(env, { project_id: projectId, name: "POPULAR", usage_count: 10 });
    await seedCategory(env, { project_id: projectId, name: "MEDIUM", usage_count: 5 });

    const res = await app.fetch(req("GET", `/projects/${projectId}/categories`, { cookie }), env);
    const body = (await res.json()) as { data: Array<{ name: string; usage_count: number }> };
    expect(body.data).toHaveLength(3);
    expect(body.data[0]?.name).toBe("POPULAR");
    expect(body.data[1]?.name).toBe("MEDIUM");
    expect(body.data[2]?.name).toBe("RARE");
  });

  it("excludes soft-deleted categories", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    await seedCategory(env, { project_id: projectId, name: "ACTIVE" });
    await seedCategory(env, {
      project_id: projectId,
      name: "DELETED",
      deleted_at: new Date().toISOString(),
    });

    const res = await app.fetch(req("GET", `/projects/${projectId}/categories`, { cookie }), env);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.name).toBe("ACTIVE");
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "catOwner" });
    const userB = await seedUser(env, { username: "catIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(req("GET", `/projects/${projectId}/categories`, { cookie }), env);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/categories
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/categories", () => {
  it("creates a category and returns 201", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/categories`, {
        cookie,
        body: { name: "DISPLAY" },
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { name: string; usage_count: number; project_id: string };
    };
    expect(body.data.name).toBe("DISPLAY");
    expect(body.data.usage_count).toBe(0);
    expect(body.data.project_id).toBe(projectId);
  });

  it("returns 400 for missing name", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/categories`, { cookie, body: {} }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty name", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/categories`, { cookie, body: { name: "" } }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "catOwner2" });
    const userB = await seedUser(env, { username: "catIntruder2" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/categories`, { cookie, body: { name: "BATTERY" } }),
      env
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /projects/:projectId/categories/:categoryId
// ---------------------------------------------------------------------------

describe("DELETE /projects/:projectId/categories/:categoryId", () => {
  it("soft-deletes an unused category", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const categoryId = await seedCategory(env, { project_id: projectId, usage_count: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/categories/${categoryId}`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify it no longer appears in GET
    const listRes = await app.fetch(
      req("GET", `/projects/${projectId}/categories`, { cookie }),
      env
    );
    const listBody = (await listRes.json()) as { data: unknown[] };
    expect(listBody.data).toHaveLength(0);
  });

  it("returns 409 when category is in use (usage_count > 0)", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const categoryId = await seedCategory(env, { project_id: projectId, usage_count: 3 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/categories/${categoryId}`, { cookie }),
      env
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("in use");
  });

  it("returns 404 for a non-existent category", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/categories/nonexistent`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for already-deleted category", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const categoryId = await seedCategory(env, {
      project_id: projectId,
      usage_count: 0,
      deleted_at: new Date().toISOString(),
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/categories/${categoryId}`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "catOwner3" });
    const userB = await seedUser(env, { username: "catIntruder3" });
    const projectId = await seedProject(env, { user_id: userA });
    const categoryId = await seedCategory(env, { project_id: projectId });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/categories/${categoryId}`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });
});

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../index.ts";
import { makeSessionCookie, req, seedProject, seedRow, seedUser } from "./helpers.ts";

// ---------------------------------------------------------------------------
// GET /projects
// ---------------------------------------------------------------------------

describe("GET /projects", () => {
  it("returns empty list for a new user", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", "/projects", { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; page: number; limit: number };
    expect(body.data).toEqual([]);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("only returns projects belonging to the authenticated user", async () => {
    const userA = await seedUser(env, { username: "userA" });
    const userB = await seedUser(env, { username: "userB" });

    await seedProject(env, { user_id: userA, name: "Project A" });
    await seedProject(env, { user_id: userB, name: "Project B" });

    const cookie = await makeSessionCookie(userA);
    const res = await app.fetch(req("GET", "/projects", { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.name).toBe("Project A");
  });

  it("does not include soft-deleted projects", async () => {
    const userId = await seedUser(env);
    await seedProject(env, {
      user_id: userId,
      name: "Deleted",
      deleted_at: new Date().toISOString(),
    });
    await seedProject(env, { user_id: userId, name: "Active" });

    const cookie = await makeSessionCookie(userId);
    const res = await app.fetch(req("GET", "/projects", { cookie }), env);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.name).toBe("Active");
  });

  it("includes annotated_rows count", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, total_rows: 3 });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "completed" });
    await seedRow(env, { project_id: projectId, row_index: 1, status: "completed" });
    await seedRow(env, { project_id: projectId, row_index: 2, status: "pending" });

    const cookie = await makeSessionCookie(userId);
    const res = await app.fetch(req("GET", "/projects", { cookie }), env);
    const body = (await res.json()) as { data: Array<{ annotated_rows: number }> };
    expect(body.data[0]?.annotated_rows).toBe(2);
  });

  it("respects page and limit query params", async () => {
    const userId = await seedUser(env);
    for (let i = 0; i < 5; i++) {
      await seedProject(env, { user_id: userId, name: `P${i}` });
    }

    const cookie = await makeSessionCookie(userId);
    const res = await app.fetch(req("GET", "/projects?page=2&limit=2", { cookie }), env);
    const body = (await res.json()) as { data: unknown[]; page: number; limit: number };
    expect(body.data).toHaveLength(2);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /projects
// ---------------------------------------------------------------------------

describe("POST /projects", () => {
  it("creates a project and returns 201", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", "/projects", {
        cookie,
        body: { name: "My Dataset", annotation_order: "sequential" },
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; name: string; user_id: string } };
    expect(body.data.name).toBe("My Dataset");
    expect(body.data.user_id).toBe(userId);
  });

  it("creates a project with optional description", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", "/projects", {
        cookie,
        body: { name: "With Desc", description: "A great dataset", annotation_order: "sequential" },
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { description: string } };
    expect(body.data.description).toBe("A great dataset");
  });

  it("defaults annotation_order to sequential", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", "/projects", { cookie, body: { name: "No Order" } }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { annotation_order: string } };
    expect(body.data.annotation_order).toBe("sequential");
  });

  it("returns 400 for missing name", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", "/projects", { cookie, body: { annotation_order: "sequential" } }),
      env
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId", () => {
  it("returns the project with annotated_rows count", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      name: "Detail Test",
      total_rows: 2,
    });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "completed" });
    await seedRow(env, { project_id: projectId, row_index: 1, status: "pending" });

    const cookie = await makeSessionCookie(userId);
    const res = await app.fetch(req("GET", `/projects/${projectId}`, { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; annotated_rows: number } };
    expect(body.data.id).toBe(projectId);
    expect(body.data.annotated_rows).toBe(1);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "ownerA" });
    const userB = await seedUser(env, { username: "intruderB" });
    const projectId = await seedProject(env, { user_id: userA });

    const cookie = await makeSessionCookie(userB);
    const res = await app.fetch(req("GET", `/projects/${projectId}`, { cookie }), env);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a soft-deleted project", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });

    const cookie = await makeSessionCookie(userId);
    const res = await app.fetch(req("GET", `/projects/${projectId}`, { cookie }), env);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent project", async () => {
    const userId = await seedUser(env);
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", "/projects/nonexistent-id", { cookie }), env);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /projects/:projectId
// ---------------------------------------------------------------------------

describe("PATCH /projects/:projectId", () => {
  it("updates the project name", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, name: "Old Name" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}`, { cookie, body: { name: "New Name" } }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string } };
    expect(body.data.name).toBe("New Name");
  });

  it("updates project status to archived", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}`, { cookie, body: { status: "archived" } }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("archived");
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "ownerA2" });
    const userB = await seedUser(env, { username: "intruderB2" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}`, { cookie, body: { name: "Hacked" } }),
      env
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /projects/:projectId
// ---------------------------------------------------------------------------

describe("DELETE /projects/:projectId", () => {
  it("soft-deletes the project", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const delRes = await app.fetch(req("DELETE", `/projects/${projectId}`, { cookie }), env);
    expect(delRes.status).toBe(200);
    const body = (await delRes.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Subsequent GET should 404
    const getRes = await app.fetch(req("GET", `/projects/${projectId}`, { cookie }), env);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "ownerA3" });
    const userB = await seedUser(env, { username: "intruderB3" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(req("DELETE", `/projects/${projectId}`, { cookie }), env);
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting already-deleted project", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("DELETE", `/projects/${projectId}`, { cookie }), env);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/upload/init
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/upload/init", () => {
  it("returns uploadId and uploadUrl", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/upload/init`, {
        cookie,
        body: { file_name: "data.csv", file_size: 2048 },
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { uploadId: string; uploadUrl: string } };
    expect(body.data.uploadId).toBeTypeOf("string");
    expect(body.data.uploadUrl).toContain(`/projects/${projectId}/upload/`);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "ownerA4" });
    const userB = await seedUser(env, { username: "intruderB4" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/upload/init`, {
        cookie,
        body: { file_name: "data.csv", file_size: 100 },
      }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing file_name", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/upload/init`, {
        cookie,
        body: { file_size: 100 },
      }),
      env
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Full upload flow: init → PUT → complete
// ---------------------------------------------------------------------------

describe("CSV upload flow (init → PUT → complete)", () => {
  it("populates dataset_rows from a valid CSV", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    // 1. init
    const initRes = await app.fetch(
      req("POST", `/projects/${projectId}/upload/init`, {
        cookie,
        body: { file_name: "data.csv", file_size: 100 },
      }),
      env
    );
    expect(initRes.status).toBe(201);
    const { data: initData } = (await initRes.json()) as {
      data: { uploadId: string; uploadUrl: string };
    };

    // 2. PUT the CSV
    const csv = "text\nThe battery is great\nThe screen is bad\nService was okay\n";
    const uploadPath = new URL(initData.uploadUrl).pathname;
    const putRes = await app.fetch(
      new Request(`http://localhost${uploadPath}`, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "text/csv" },
        body: csv,
      }),
      env
    );
    expect(putRes.status).toBe(200);

    // 3. complete
    const completeRes = await app.fetch(
      req("POST", `/projects/${projectId}/upload/complete`, {
        cookie,
        body: { upload_id: initData.uploadId },
      }),
      env
    );
    expect(completeRes.status).toBe(200);
    const { data: project } = (await completeRes.json()) as {
      data: { total_rows: number; file_name: string };
    };
    expect(project.total_rows).toBe(3);
    expect(project.file_name).toBe("data.csv");

    // 4. rows should be visible
    const rowsRes = await app.fetch(req("GET", `/projects/${projectId}/rows`, { cookie }), env);
    const rowsBody = (await rowsRes.json()) as { data: Array<{ text: string; status: string }> };
    expect(rowsBody.data).toHaveLength(3);
    expect(rowsBody.data[0]?.text).toBe("The battery is great");
    expect(rowsBody.data[0]?.status).toBe("pending");
  });

  it("returns 422 for a CSV with no data rows", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const initRes = await app.fetch(
      req("POST", `/projects/${projectId}/upload/init`, {
        cookie,
        body: { file_name: "empty.csv", file_size: 10 },
      }),
      env
    );
    const { data: initData } = (await initRes.json()) as {
      data: { uploadId: string; uploadUrl: string };
    };

    const uploadPath = new URL(initData.uploadUrl).pathname;
    await app.fetch(
      new Request(`http://localhost${uploadPath}`, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "text/csv" },
        body: "text\n",
      }),
      env
    );

    const completeRes = await app.fetch(
      req("POST", `/projects/${projectId}/upload/complete`, {
        cookie,
        body: { upload_id: initData.uploadId },
      }),
      env
    );
    expect(completeRes.status).toBe(422);
  });

  it("falls back to first column when no 'text' column exists", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const initRes = await app.fetch(
      req("POST", `/projects/${projectId}/upload/init`, {
        cookie,
        body: { file_name: "nocolumn.csv", file_size: 50 },
      }),
      env
    );
    const { data: initData } = (await initRes.json()) as {
      data: { uploadId: string; uploadUrl: string };
    };

    const uploadPath = new URL(initData.uploadUrl).pathname;
    await app.fetch(
      new Request(`http://localhost${uploadPath}`, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "text/csv" },
        body: "sentence,label\nHello world,pos\n",
      }),
      env
    );

    const completeRes = await app.fetch(
      req("POST", `/projects/${projectId}/upload/complete`, {
        cookie,
        body: { upload_id: initData.uploadId },
      }),
      env
    );
    expect(completeRes.status).toBe(200);

    const rowsRes = await app.fetch(req("GET", `/projects/${projectId}/rows`, { cookie }), env);
    const rowsBody = (await rowsRes.json()) as { data: Array<{ text: string }> };
    expect(rowsBody.data[0]?.text).toBe("Hello world");
  });
});

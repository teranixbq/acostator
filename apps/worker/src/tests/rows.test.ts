import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../index.ts";
import {
  makeSessionCookie,
  req,
  seedCategory,
  seedProject,
  seedQuadruple,
  seedRow,
  seedUser,
} from "./helpers.ts";

// ---------------------------------------------------------------------------
// GET /projects/:projectId/rows  (paginated list)
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/rows", () => {
  it("returns rows ordered by row_index ascending", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, total_rows: 3 });
    await seedRow(env, { project_id: projectId, row_index: 2, text: "Third" });
    await seedRow(env, { project_id: projectId, row_index: 0, text: "First" });
    await seedRow(env, { project_id: projectId, row_index: 1, text: "Second" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows`, { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ text: string }> };
    expect(body.data.map((r) => r.text)).toEqual(["First", "Second", "Third"]);
  });

  it("paginates correctly", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, total_rows: 5 });
    for (let i = 0; i < 5; i++) {
      await seedRow(env, { project_id: projectId, row_index: i });
    }
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/rows?page=2&limit=2`, { cookie }),
      env
    );
    const body = (await res.json()) as { data: unknown[]; page: number; limit: number };
    expect(body.data).toHaveLength(2);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(2);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "rowOwner" });
    const userB = await seedUser(env, { username: "rowIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows`, { cookie }), env);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/rows/next
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/rows/next", () => {
  it("returns the first pending row in sequential mode", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, annotation_order: "sequential" });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "completed" });
    await seedRow(env, {
      project_id: projectId,
      row_index: 1,
      status: "pending",
      text: "Next one",
    });
    await seedRow(env, { project_id: projectId, row_index: 2, status: "pending" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows/next`, { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { text: string; row_index: number } | null };
    expect(body.data?.text).toBe("Next one");
    expect(body.data?.row_index).toBe(1);
  });

  it("returns null when all rows are completed in sequential mode", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, annotation_order: "sequential" });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "completed" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows/next`, { cookie }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: null };
    expect(body.data).toBeNull();
  });

  it("returns null when project has no rows", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows/next`, { cookie }), env);
    const body = (await res.json()) as { data: null };
    expect(body.data).toBeNull();
  });

  it("follows the annotation_queue in random mode", async () => {
    const userId = await seedUser(env);
    // Queue specifies index order: [2, 0, 1]
    const projectId = await seedProject(env, {
      user_id: userId,
      annotation_order: "random",
      annotation_queue: JSON.stringify([2, 0, 1]),
    });
    await seedRow(env, { project_id: projectId, row_index: 0, text: "Row 0" });
    await seedRow(env, { project_id: projectId, row_index: 1, text: "Row 1" });
    await seedRow(env, { project_id: projectId, row_index: 2, text: "Row 2" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows/next`, { cookie }), env);
    const body = (await res.json()) as { data: { text: string } };
    // First in queue is index 2 → "Row 2"
    expect(body.data?.text).toBe("Row 2");
  });

  it("skips completed/skipped rows in random queue", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      annotation_order: "random",
      annotation_queue: JSON.stringify([0, 1, 2]),
    });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "completed", text: "Done" });
    await seedRow(env, { project_id: projectId, row_index: 1, status: "skipped", text: "Skipped" });
    await seedRow(env, { project_id: projectId, row_index: 2, status: "pending", text: "Next" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows/next`, { cookie }), env);
    const body = (await res.json()) as { data: { text: string } };
    expect(body.data?.text).toBe("Next");
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "nextOwner" });
    const userB = await seedUser(env, { username: "nextIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(req("GET", `/projects/${projectId}/rows/next`, { cookie }), env);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/rows/:rowId
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/rows/:rowId", () => {
  it("returns the row with its quadruples", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0, text: "Hello world" });
    const catId = await seedCategory(env, { project_id: projectId });
    await seedQuadruple(env, { row_id: rowId, project_id: projectId, category_id: catId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/rows/${rowId}`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; text: string; quadruples: unknown[] };
    };
    expect(body.data.id).toBe(rowId);
    expect(body.data.text).toBe("Hello world");
    expect(body.data.quadruples).toHaveLength(1);
  });

  it("returns empty quadruples array for an unannotated row", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/rows/${rowId}`, { cookie }),
      env
    );
    const body = (await res.json()) as { data: { quadruples: unknown[] } };
    expect(body.data.quadruples).toEqual([]);
  });

  it("returns 404 for a row that belongs to a different project", async () => {
    const userId = await seedUser(env);
    const projectA = await seedProject(env, { user_id: userId });
    const projectB = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectA, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectB}/rows/${rowId}`, { cookie }), env);
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "rowOwner2" });
    const userB = await seedUser(env, { username: "rowIntruder2" });
    const projectId = await seedProject(env, { user_id: userA });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/rows/${rowId}`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /projects/:projectId/rows/:rowId/status
// ---------------------------------------------------------------------------

describe("PATCH /projects/:projectId/rows/:rowId/status", () => {
  it("updates row status to completed", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0, status: "pending" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}/rows/${rowId}/status`, {
        cookie,
        body: { status: "completed" },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify via GET
    const getRes = await app.fetch(
      req("GET", `/projects/${projectId}/rows/${rowId}`, { cookie }),
      env
    );
    const getBody = (await getRes.json()) as { data: { status: string } };
    expect(getBody.data.status).toBe("completed");
  });

  it("updates row status to skipped", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}/rows/${rowId}/status`, {
        cookie,
        body: { status: "skipped" },
      }),
      env
    );
    expect(res.status).toBe(200);
  });

  it("removes the row_index from annotation_queue in random mode when completed", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      annotation_order: "random",
      annotation_queue: JSON.stringify([0, 1, 2]),
    });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    await app.fetch(
      req("PATCH", `/projects/${projectId}/rows/${rowId}/status`, {
        cookie,
        body: { status: "completed" },
      }),
      env
    );

    // Next should now skip index 0 and return index 1
    await seedRow(env, { project_id: projectId, row_index: 1, text: "Row 1" });
    await seedRow(env, { project_id: projectId, row_index: 2, text: "Row 2" });

    const nextRes = await app.fetch(
      req("GET", `/projects/${projectId}/rows/next`, { cookie }),
      env
    );
    const nextBody = (await nextRes.json()) as { data: { row_index: number } | null };
    expect(nextBody.data?.row_index).toBe(1);
  });

  it("returns 400 for an invalid status value", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}/rows/${rowId}/status`, {
        cookie,
        body: { status: "invalid_status" },
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "statusOwner" });
    const userB = await seedUser(env, { username: "statusIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("PATCH", `/projects/${projectId}/rows/${rowId}/status`, {
        cookie,
        body: { status: "completed" },
      }),
      env
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/rows/:rowId/quadruples
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/rows/:rowId/quadruples", () => {
  it("creates a quadruple and increments category usage_count", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId, usage_count: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/rows/${rowId}/quadruples`, {
        cookie,
        body: {
          aspect_term: "battery",
          aspect_implicit: false,
          aspect_start: 4,
          aspect_end: 11,
          category_id: catId,
          opinion_term: "great",
          opinion_implicit: false,
          opinion_start: 15,
          opinion_end: 20,
          sentiment: "positive",
        },
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        aspect_term: string;
        sentiment: string;
        category_id: string;
      };
    };
    expect(body.data.aspect_term).toBe("battery");
    expect(body.data.sentiment).toBe("positive");
    expect(body.data.category_id).toBe(catId);

    // Check usage_count incremented
    const catRes = await app.fetch(
      req("GET", `/projects/${projectId}/categories`, { cookie }),
      env
    );
    const catBody = (await catRes.json()) as { data: Array<{ usage_count: number }> };
    expect(catBody.data[0]?.usage_count).toBe(1);
  });

  it("creates a quadruple with implicit aspect and opinion", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/rows/${rowId}/quadruples`, {
        cookie,
        body: {
          aspect_term: "SERVICE",
          aspect_implicit: true,
          category_id: catId,
          opinion_term: "bad",
          opinion_implicit: true,
          sentiment: "negative",
        },
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { aspect_implicit: boolean; opinion_implicit: boolean; aspect_start: null };
    };
    expect(body.data.aspect_implicit).toBe(true);
    expect(body.data.opinion_implicit).toBe(true);
    expect(body.data.aspect_start).toBeNull();
  });

  it("returns 400 for missing required fields", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/rows/${rowId}/quadruples`, {
        cookie,
        body: { aspect_term: "battery" }, // missing most fields
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid sentiment value", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/rows/${rowId}/quadruples`, {
        cookie,
        body: {
          aspect_term: "battery",
          category_id: catId,
          opinion_term: "great",
          sentiment: "super_positive", // invalid
        },
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "quadOwner" });
    const userB = await seedUser(env, { username: "quadIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/rows/${rowId}/quadruples`, {
        cookie,
        body: {
          aspect_term: "battery",
          aspect_implicit: false,
          category_id: catId,
          opinion_term: "great",
          opinion_implicit: false,
          sentiment: "positive",
        },
      }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a row that doesn't exist", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const catId = await seedCategory(env, { project_id: projectId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("POST", `/projects/${projectId}/rows/nonexistent-row/quadruples`, {
        cookie,
        body: {
          aspect_term: "battery",
          aspect_implicit: false,
          category_id: catId,
          opinion_term: "great",
          opinion_implicit: false,
          sentiment: "positive",
        },
      }),
      env
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /projects/:projectId/rows/:rowId/quadruples/:quadrupleId
// ---------------------------------------------------------------------------

describe("DELETE /projects/:projectId/rows/:rowId/quadruples/:quadrupleId", () => {
  it("deletes the quadruple and decrements category usage_count", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId, usage_count: 2 });
    const quadId = await seedQuadruple(env, {
      row_id: rowId,
      project_id: projectId,
      category_id: catId,
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/rows/${rowId}/quadruples/${quadId}`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // usage_count should drop to 1
    const catRes = await app.fetch(
      req("GET", `/projects/${projectId}/categories`, { cookie }),
      env
    );
    const catBody = (await catRes.json()) as { data: Array<{ usage_count: number }> };
    expect(catBody.data[0]?.usage_count).toBe(1);

    // quadruple should be gone
    const rowRes = await app.fetch(
      req("GET", `/projects/${projectId}/rows/${rowId}`, { cookie }),
      env
    );
    const rowBody = (await rowRes.json()) as { data: { quadruples: unknown[] } };
    expect(rowBody.data.quadruples).toHaveLength(0);
  });

  it("floors usage_count at 0 (does not go negative)", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId, usage_count: 0 });
    const quadId = await seedQuadruple(env, {
      row_id: rowId,
      project_id: projectId,
      category_id: catId,
    });
    const cookie = await makeSessionCookie(userId);

    await app.fetch(
      req("DELETE", `/projects/${projectId}/rows/${rowId}/quadruples/${quadId}`, { cookie }),
      env
    );

    const catRes = await app.fetch(
      req("GET", `/projects/${projectId}/categories`, { cookie }),
      env
    );
    const catBody = (await catRes.json()) as { data: Array<{ usage_count: number }> };
    expect(catBody.data[0]?.usage_count).toBe(0);
  });

  it("returns 404 for a non-existent quadruple", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/rows/${rowId}/quadruples/nonexistent`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when quadruple belongs to a different row", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowA = await seedRow(env, { project_id: projectId, row_index: 0 });
    const rowB = await seedRow(env, { project_id: projectId, row_index: 1 });
    const catId = await seedCategory(env, { project_id: projectId });
    const quadId = await seedQuadruple(env, {
      row_id: rowA,
      project_id: projectId,
      category_id: catId,
    });
    const cookie = await makeSessionCookie(userId);

    // Try to delete rowA's quad via rowB's path
    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/rows/${rowB}/quadruples/${quadId}`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "delOwner" });
    const userB = await seedUser(env, { username: "delIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const rowId = await seedRow(env, { project_id: projectId, row_index: 0 });
    const catId = await seedCategory(env, { project_id: projectId });
    const quadId = await seedQuadruple(env, {
      row_id: rowId,
      project_id: projectId,
      category_id: catId,
    });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("DELETE", `/projects/${projectId}/rows/${rowId}/quadruples/${quadId}`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });
});

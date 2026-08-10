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
// GET /projects/:projectId/export?format=json (default)
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/export — JSON format", () => {
  it("returns empty rows array when no completed rows exist", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, name: "Export Test" });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "pending" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=json`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { id: string; name: string };
      rows: unknown[];
    };
    expect(body.project.name).toBe("Export Test");
    expect(body.rows).toEqual([]);
  });

  it("returns completed rows with quadruples in JSON format", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, name: "JSON Export" });
    const rowId = await seedRow(env, {
      project_id: projectId,
      row_index: 0,
      text: "Battery is great",
      status: "completed",
    });
    const catId = await seedCategory(env, { project_id: projectId, name: "BATTERY" });
    await seedQuadruple(env, {
      row_id: rowId,
      project_id: projectId,
      category_id: catId,
      aspect_term: "battery",
      opinion_term: "great",
      sentiment: "positive",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=json`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { name: string };
      rows: Array<{
        text: string;
        quadruples: Array<{
          aspect_term: string;
          category: string;
          opinion_term: string;
          sentiment: string;
        }>;
      }>;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.text).toBe("Battery is great");
    expect(body.rows[0]?.quadruples).toHaveLength(1);
    expect(body.rows[0]?.quadruples[0]?.aspect_term).toBe("battery");
    expect(body.rows[0]?.quadruples[0]?.category).toBe("BATTERY");
    expect(body.rows[0]?.quadruples[0]?.sentiment).toBe("positive");
  });

  it("does not include pending rows in the export", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    await seedRow(env, { project_id: projectId, row_index: 0, status: "pending" });
    await seedRow(env, { project_id: projectId, row_index: 1, status: "in_progress" });
    await seedRow(env, { project_id: projectId, row_index: 2, status: "completed", text: "Done" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=json`, { cookie }),
      env
    );
    const body = (await res.json()) as { rows: Array<{ text: string }> };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.text).toBe("Done");
  });

  it("defaults to JSON format when format param is omitted", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, name: "Default Format" });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/export`, { cookie }), env);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type") ?? "";
    expect(contentType).toContain("application/json");
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "exportOwner" });
    const userB = await seedUser(env, { username: "exportIntruder" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=json`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a soft-deleted project", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=json`, { cookie }),
      env
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/export?format=csv
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/export — CSV format", () => {
  it("returns CSV header-only when no completed rows exist", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type") ?? "";
    expect(contentType).toContain("text/csv");
    const text = await res.text();
    // The empty-CSV path returns this specific header string
    expect(text.trim()).toBe("text/aspect_term,category,opinion_term,sentiment");
  });

  it("returns correct CSV rows for completed rows with quadruples", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, {
      project_id: projectId,
      row_index: 0,
      text: "Battery life is good",
      status: "completed",
    });
    const catId = await seedCategory(env, { project_id: projectId, name: "BATTERY" });
    await seedQuadruple(env, {
      row_id: rowId,
      project_id: projectId,
      category_id: catId,
      aspect_term: "battery life",
      opinion_term: "good",
      sentiment: "positive",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe("text,aspect_term,category,opinion_term,sentiment");
    // Data line should be CSV-escaped
    expect(lines[1]).toContain("Battery life is good");
    expect(lines[1]).toContain("battery life");
    expect(lines[1]).toContain("BATTERY");
    expect(lines[1]).toContain("good");
    expect(lines[1]).toContain("positive");
  });

  it("includes rows with no quadruples as empty-quad lines", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    await seedRow(env, {
      project_id: projectId,
      row_index: 0,
      text: "No quads here",
      status: "completed",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 data line
    // Empty quad fields: text followed by 4 empty comma-separated fields
    expect(lines[1]).toMatch(/^"No quads here",,,, *$/);
  });

  it("sets Content-Disposition attachment header with project id", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(`export-${projectId}.csv`);
  });

  it("escapes double-quotes in CSV values", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const rowId = await seedRow(env, {
      project_id: projectId,
      row_index: 0,
      text: `He said "hello"`,
      status: "completed",
    });
    const catId = await seedCategory(env, { project_id: projectId, name: "GREETING" });
    await seedQuadruple(env, {
      row_id: rowId,
      project_id: projectId,
      category_id: catId,
      aspect_term: `"quoted" aspect`,
      opinion_term: "fine",
      sentiment: "neutral",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    const text = await res.text();
    // Double-quotes in values must be escaped as ""
    expect(text).toContain(`"He said ""hello"""`);
    expect(text).toContain(`"""quoted"" aspect"`);
  });

  it("returns 400 for an invalid format value", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=xml`, { cookie }),
      env
    );
    expect(res.status).toBe(400);
  });
});

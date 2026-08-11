import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema.ts";
import app from "../index.ts";
import { type TestEnv, makeSessionCookie, req, seedProject, seedUser } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Helpers: seed CSV into R2 and annotations into D1
// ---------------------------------------------------------------------------

async function seedProjectCsv(
  testEnv: TestEnv,
  projectId: string,
  csvContent: string
): Promise<void> {
  await testEnv.BUCKET.put(`projects/${projectId}/data.csv`, csvContent, {
    httpMetadata: { contentType: "text/csv" },
  });
}

interface SeedAnnotationOptions {
  project_id: string;
  row_index: number;
  aspect?: string;
  category?: string;
  opinion?: string;
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
}

async function seedAnnotation(testEnv: TestEnv, opts: SeedAnnotationOptions): Promise<string> {
  const db = drizzle(testEnv.DB, { schema });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.annotations).values({
    id,
    project_id: opts.project_id,
    row_index: opts.row_index,
    aspect: opts.aspect ?? "battery",
    category: opts.category ?? "BATTERY",
    opinion: opts.opinion ?? "great",
    sentiment: opts.sentiment ?? "positive",
    created_at: now,
    updated_at: now,
  });

  return id;
}

// ---------------------------------------------------------------------------
// GET /projects/:projectId/export?format=json (default)
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/export — JSON format", () => {
  it("returns empty rows array when no annotations exist", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, name: "Export Test" });
    // Seed a CSV but no annotations
    await seedProjectCsv(env as TestEnv, projectId, "text\nSome row\n");
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

  it("returns annotated rows with annotations in JSON format", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, {
      user_id: userId,
      name: "JSON Export",
      text_column: "text",
    });
    // Seed CSV with one data row (row_index 0)
    await seedProjectCsv(env as TestEnv, projectId, "text\nBattery is great\n");
    // Seed one annotation for row_index 0
    await seedAnnotation(env as TestEnv, {
      project_id: projectId,
      row_index: 0,
      aspect: "battery",
      category: "BATTERY",
      opinion: "great",
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
        row_index: number;
        text: string;
        annotations: Array<{
          aspect: string;
          category: string;
          opinion: string;
          sentiment: string;
        }>;
      }>;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.text).toBe("Battery is great");
    expect(body.rows[0]?.annotations).toHaveLength(1);
    expect(body.rows[0]?.annotations[0]?.aspect).toBe("battery");
    expect(body.rows[0]?.annotations[0]?.category).toBe("BATTERY");
    expect(body.rows[0]?.annotations[0]?.sentiment).toBe("positive");
  });

  it("only includes rows that have annotations", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, text_column: "text" });
    // CSV has 3 rows
    await seedProjectCsv(
      env as TestEnv,
      projectId,
      "text\nPending row\nIn progress row\nDone row\n"
    );
    // Only row_index 2 has an annotation
    await seedAnnotation(env as TestEnv, {
      project_id: projectId,
      row_index: 2,
      aspect: "screen",
      category: "SCREEN",
      opinion: "done",
      sentiment: "neutral",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=json`, { cookie }),
      env
    );
    const body = (await res.json()) as {
      rows: Array<{ row_index: number; text: string }>;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.row_index).toBe(2);
    expect(body.rows[0]?.text).toBe("Done row");
  });

  it("defaults to JSON format when format param is omitted", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(req("GET", `/projects/${projectId}/export`, { cookie }), env);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type") ?? "";
    expect(contentType).toContain("application/json");
  });

  it("returns 404 for another user's project", async () => {
    const userA = await seedUser(env, { username: "exportOwnerA" });
    const userB = await seedUser(env, { username: "exportIntruderB" });
    const projectId = await seedProject(env, { user_id: userA });
    const cookie = await makeSessionCookie(userB);

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
  it("returns CSV header-only when no annotations exist", async () => {
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
    expect(text.trim()).toBe("text,aspect,category,opinion,sentiment");
  });

  it("returns correct CSV rows for annotated rows", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, text_column: "text" });
    await seedProjectCsv(env as TestEnv, projectId, "text\nBattery life is good\n");
    await seedAnnotation(env as TestEnv, {
      project_id: projectId,
      row_index: 0,
      aspect: "battery life",
      category: "BATTERY",
      opinion: "good",
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
    expect(lines[0]).toBe("text,aspect,category,opinion,sentiment");
    expect(lines[1]).toContain("Battery life is good");
    expect(lines[1]).toContain("battery life");
    expect(lines[1]).toContain("BATTERY");
    expect(lines[1]).toContain("good");
    expect(lines[1]).toContain("positive");
  });

  it("outputs one CSV line per annotation quadruple", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, text_column: "text" });
    await seedProjectCsv(env as TestEnv, projectId, "text\nMulti aspect row\n");
    await seedAnnotation(env as TestEnv, {
      project_id: projectId,
      row_index: 0,
      aspect: "battery",
      category: "BATTERY",
      opinion: "good",
      sentiment: "positive",
    });
    await seedAnnotation(env as TestEnv, {
      project_id: projectId,
      row_index: 0,
      aspect: "screen",
      category: "SCREEN",
      opinion: "great",
      sentiment: "positive",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    const text = await res.text();
    const lines = text.trim().split("\n");
    // header + 2 annotation lines
    expect(lines).toHaveLength(3);
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
    expect(disposition).toContain("attachment");
    expect(disposition).toContain(projectId);
  });

  it("escapes double-quotes in CSV values", async () => {
    const userId = await seedUser(env);
    const projectId = await seedProject(env, { user_id: userId, text_column: "text" });
    // Store the raw text value directly (not CSV-encoded) so we can test re-encoding
    // CSV: text column contains the literal value: He said "hello"
    // As CSV that means: "He said ""hello"""
    await seedProjectCsv(env as TestEnv, projectId, `text\n"He said ""hello"""\n`);
    await seedAnnotation(env as TestEnv, {
      project_id: projectId,
      row_index: 0,
      aspect: `"quoted" aspect`,
      category: "CAT",
      opinion: "fine",
      sentiment: "neutral",
    });
    const cookie = await makeSessionCookie(userId);

    const res = await app.fetch(
      req("GET", `/projects/${projectId}/export?format=csv`, { cookie }),
      env
    );
    const text = await res.text();
    // The text column value He said "hello" should be re-encoded as "He said ""hello"""
    expect(text).toContain(`"He said ""hello"""`);
    // The aspect "quoted" aspect should be re-encoded as """quoted"" aspect"
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

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";
import { createSessionToken } from "../lib/auth.ts";

export const TEST_SECRET = "test-auth-secret-that-is-long-enough";

// Explicit binding interface. Tests cast `env` from cloudflare:test to this
// type since ProvidedEnv doesn't carry the binding names at type-check time.
export type TestEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ENVIRONMENT: string;
  ALLOWED_DOMAIN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  FRONTEND_URL: string;
};

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export interface SeedUserOptions {
  id?: string;
  github_id?: string;
  username?: string;
  email?: string | null;
  avatar_url?: string | null;
}

export async function seedUser(env: TestEnv, opts: SeedUserOptions = {}) {
  const db = drizzle(env.DB, { schema });
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.users).values({
    id,
    github_id: opts.github_id ?? `gh_${id}`,
    username: opts.username ?? "testuser",
    email: opts.email ?? null,
    avatar_url: opts.avatar_url ?? null,
    created_at: now,
    updated_at: now,
  });

  return id;
}

export async function makeSessionCookie(
  userId: string,
  username = "testuser",
  avatar_url: string | null = null
): Promise<string> {
  const token = await createSessionToken(
    { user_id: userId, github_id: `gh_${userId}`, username, avatar_url },
    TEST_SECRET
  );
  return `session=${token}`;
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

export interface SeedProjectOptions {
  id?: string;
  user_id: string;
  name?: string;
  description?: string | null;
  file_name?: string;
  file_size?: number;
  total_rows?: number;
  text_column?: string;
  status?: "active" | "archived";
  annotation_order?: "sequential" | "random";
  annotation_queue?: string | null;
  deleted_at?: string | null;
}

export async function seedProject(env: TestEnv, opts: SeedProjectOptions) {
  const db = drizzle(env.DB, { schema });
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.projects).values({
    id,
    user_id: opts.user_id,
    name: opts.name ?? "Test Project",
    description: opts.description ?? null,
    file_name: opts.file_name ?? "test.csv",
    file_size: opts.file_size ?? 1024,
    total_rows: opts.total_rows ?? 0,
    text_column: opts.text_column ?? "",
    status: opts.status ?? "active",
    annotation_order: opts.annotation_order ?? "sequential",
    annotation_queue: opts.annotation_queue ?? null,
    deleted_at: opts.deleted_at ?? null,
    created_at: now,
    updated_at: now,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

export interface SeedRowOptions {
  id?: string;
  project_id: string;
  row_index: number;
  text?: string;
  status?: "pending" | "in_progress" | "completed" | "skipped";
}

export async function seedRow(env: TestEnv, opts: SeedRowOptions) {
  const db = drizzle(env.DB, { schema });
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.datasetRows).values({
    id,
    project_id: opts.project_id,
    row_index: opts.row_index,
    text: opts.text ?? `Row text ${opts.row_index}`,
    status: opts.status ?? "pending",
    created_at: now,
    updated_at: now,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Category helpers
// ---------------------------------------------------------------------------

export interface SeedCategoryOptions {
  id?: string;
  project_id: string;
  name?: string;
  usage_count?: number;
  deleted_at?: string | null;
}

export async function seedCategory(env: TestEnv, opts: SeedCategoryOptions) {
  const db = drizzle(env.DB, { schema });
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.categories).values({
    id,
    project_id: opts.project_id,
    name: opts.name ?? "BATTERY",
    usage_count: opts.usage_count ?? 0,
    deleted_at: opts.deleted_at ?? null,
    created_at: now,
    updated_at: now,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Quadruple helpers
// ---------------------------------------------------------------------------

export interface SeedQuadrupleOptions {
  id?: string;
  row_id: string;
  project_id: string;
  aspect_term?: string;
  aspect_implicit?: boolean;
  aspect_start?: number | null;
  aspect_end?: number | null;
  category_id: string;
  opinion_term?: string;
  opinion_implicit?: boolean;
  opinion_start?: number | null;
  opinion_end?: number | null;
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
}

export async function seedQuadruple(env: TestEnv, opts: SeedQuadrupleOptions) {
  const db = drizzle(env.DB, { schema });
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.quadruples).values({
    id,
    row_id: opts.row_id,
    project_id: opts.project_id,
    aspect_term: opts.aspect_term ?? "battery",
    aspect_implicit: opts.aspect_implicit ?? false,
    aspect_start: opts.aspect_start ?? 0,
    aspect_end: opts.aspect_end ?? 7,
    category_id: opts.category_id,
    opinion_term: opts.opinion_term ?? "great",
    opinion_implicit: opts.opinion_implicit ?? false,
    opinion_start: opts.opinion_start ?? 8,
    opinion_end: opts.opinion_end ?? 13,
    sentiment: opts.sentiment ?? "positive",
    created_at: now,
    updated_at: now,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------

export function req(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}
): Request {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
  });
}

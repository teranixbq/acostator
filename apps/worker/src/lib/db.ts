import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ENVIRONMENT: string;
  ALLOWED_DOMAIN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AUTH_SECRET: string;
};

export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type AppDb = ReturnType<typeof createDb>;

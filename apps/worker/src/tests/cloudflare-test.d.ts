// Augment the cloudflare:test module so ProvidedEnv carries the actual
// binding names declared in wrangler.toml. This makes `env` from
// `import { env } from "cloudflare:test"` structurally compatible with
// the seed helper parameter types.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    BUCKET: R2Bucket;
    ENVIRONMENT: string;
    ALLOWED_DOMAIN: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    AUTH_SECRET: string;
    FRONTEND_URL: string;
  }
}

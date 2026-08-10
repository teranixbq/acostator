import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../index.ts";
import { req } from "./helpers.ts";

describe("GET /health", () => {
  it("returns ok: true", async () => {
    const res = await app.fetch(req("GET", "/health"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; env: string };
    expect(body.ok).toBe(true);
    expect(body.env).toBe("test");
  });
});

describe("404 fallback", () => {
  it("returns 404 JSON for unknown routes", async () => {
    const res = await app.fetch(req("GET", "/does-not-exist"), env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not found");
  });
});

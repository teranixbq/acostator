import type { SessionPayload } from "@acostator/shared";
import type { Context } from "hono";

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Encodes a session payload into a signed JWT-like token.
 * Uses Web Crypto API (available in Workers runtime).
 */
export async function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp">,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + COOKIE_MAX_AGE,
  };

  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(fullPayload));
  const data = `${header}.${body}`;

  const key = await importHmacKey(secret);
  const signature = await sign(key, data);

  return `${data}.${signature}`;
}

/**
 * Verifies and decodes a session token.
 * Returns null if invalid or expired.
 */
export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const data = `${header}.${body}`;

  try {
    const key = await importHmacKey(secret);
    const valid = await verify(key, data, signature ?? "");
    if (!valid) return null;

    const payload = JSON.parse(atob(body ?? "")) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(c: Context, token: string): void {
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Path=/`
  );
}

export function clearSessionCookie(c: Context): void {
  c.header("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`);
}

export function getSessionToken(c: Context): string | null {
  const cookie = c.req.header("Cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

// --- Helpers ---

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(key: CryptoKey, data: string): Promise<string> {
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verify(key: CryptoKey, data: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const sigBuffer = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sigBuffer, enc.encode(data));
}

# Acostator Dev Log

## Stack

- **Monorepo**: npm workspaces
- **Backend**: `apps/worker` — Hono + Wrangler + Drizzle ORM + D1 + R2
- **Frontend**: `apps/web` — React 19 + Vite 6 + Tailwind 4.1.8
- **Shared**: `packages/shared` — types + Zod schemas
- **CI**: Cloudflare Workers Builds (auto-deploy on push ke `development`)

## Cloudflare Resources

| Resource | Value |
|---|---|
| Worker name | `acostator` |
| Worker domain | `acostator-api.apicode.my.id` |
| Pages domain | `acostator.apicode.my.id` |
| D1 database | `acostator` (`ba595437-9cac-4cf1-a441-9a85d75c01fe`) |
| R2 bucket | `acostatorbq` |

## Worker Secrets & Env Vars

| Key | Keterangan |
|---|---|
| `ALLOWED_DOMAIN` | `apicode.my.id` — dipakai CORS middleware |
| `AUTH_SECRET` | HMAC secret untuk sign session JWT |
| `ENVIRONMENT` | `production` |
| `FRONTEND_URL` | `https://acostator.apicode.my.id` — redirect target setelah OAuth |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |

Local dev: semua vars di `apps/worker/.dev.vars` (tidak di-commit).

## Worker Versioning — Perhatian Penting

CI push versi baru tapi **tidak auto-deploy ke production**. Setiap kali CI selesai, perlu deploy manual:

```bash
# Lihat versi terbaru
npx wrangler versions list

# Deploy versi terbaru ke production (ganti VERSION_ID)
cd apps/worker && npx wrangler versions deploy <VERSION_ID>@100 --yes
```

Kalau ada perubahan secret/env var baru, pakai:

```bash
echo "nilai" | npx wrangler versions secret put KEY_NAME
# lalu deploy versi baru yang terbuat
```

---

## Problem & Solution Log

### 1. OAuth callback redirect ke root worker bukan Pages

**Masalah**: Setelah login GitHub, worker melakukan `c.redirect("/")` yang redirect ke `acostator-api.apicode.my.id/` (JSON 404), bukan ke Pages.

**Fix**: Tambah `FRONTEND_URL` env var ke `Env` type dan ubah redirect ke `c.redirect(c.env.FRONTEND_URL)`.

**Files**: `apps/worker/src/routes/auth.ts`, `apps/worker/src/lib/db.ts`

---

### 2. Session cookie tidak dibaca cross-subdomain

**Masalah**: Cookie di-set tanpa `Domain` attribute, sehingga browser hanya kirim cookie ke `acostator-api.apicode.my.id`, tidak ke subdomain lain. Pages tidak bisa baca session.

**Fix**: Tambah `Domain=.apicode.my.id` ke cookie via parameter `domain` di `setSessionCookie` dan `clearSessionCookie`. Domain dibaca dari `c.env.ALLOWED_DOMAIN`.

**Files**: `apps/worker/src/lib/auth.ts`, `apps/worker/src/routes/auth.ts`

---

### 3. Route `/projects` return 404

**Masalah**: Route di-mount di `/api/projects` di `index.ts` tapi frontend memanggil `/projects` (tanpa prefix `/api`).

**Fix**: Hapus prefix `/api` dari semua route mount di `index.ts`.

**Files**: `apps/worker/src/index.ts`

---

### 4. CORS error pada semua request dari Pages

**Masalah**: `ALLOWED_DOMAIN` secret tidak pernah di-set di Cloudflare Worker. CORS middleware selalu return `null` karena `c.env.ALLOWED_DOMAIN` adalah `undefined`. Semua request dari Pages domain di-block browser karena tidak ada `Access-Control-Allow-Origin` header di response.

**Diagnosis**: `curl -I https://acostator-api.apicode.my.id/auth/me -H "Origin: https://acostator.apicode.my.id"` — tidak ada `Access-Control-Allow-Origin` di response. `wrangler versions view <id>` — `ALLOWED_DOMAIN` tidak ada di bindings.

**Fix**: Set secret `ALLOWED_DOMAIN=apicode.my.id` via:
```bash
echo "apicode.my.id" | npx wrangler versions secret put ALLOWED_DOMAIN
npx wrangler versions deploy <new-version-id>@100 --yes
```

---

### 5. CORS headers hilang dari error responses (401, 404, 500)

**Masalah**: Hono CORS middleware tidak menambahkan headers ke response dari `notFound` dan `onError` handler karena keduanya di luar middleware chain normal.

**Fix**: Tambah manual CORS header injection di `notFound` dan `onError` di `index.ts`.

**Files**: `apps/worker/src/index.ts`

---

## Current State (per 2026-08-09)

### Selesai
- Monorepo setup, D1 migration applied
- Worker deploy via CI (Cloudflare Workers Builds)
- Auth flow: GitHub OAuth login, session cookie, `/auth/me`
- CORS bekerja untuk semua subdomain `apicode.my.id`
- Route `/projects`, `/projects/:id/rows`, `/projects/:id/categories` terdaftar
- Frontend pages: login, projects list, annotate

### Belum Selesai
- Tombol "New project" belum implement modal create project
- Upload CSV dataset belum implement
- Annotate page belum ditest end-to-end

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

## Current State (per 2026-08-10)

### Selesai
- Monorepo setup, D1 migration applied
- Worker deploy via CI (Cloudflare Workers Builds)
- Auth flow: GitHub OAuth login, session cookie, `/auth/me`
- CORS bekerja untuk semua subdomain `apicode.my.id`
- Route `/projects`, `/projects/:id/rows`, `/projects/:id/categories` terdaftar
- Frontend pages: login, projects list, annotate
- GitHub Actions CI pipeline (`ci.yml`) — lint, typecheck, test per PR ke `development`
- GitHub ruleset di `development` — require CI pass sebelum merge
- Random queue bug fix — `rows.ts` pop `row_index` dari queue saat complete/skip
- CSV upload backend — presigned URL ke R2, streaming parse + batch insert 500 rows/tx
- Export backend — export annotations ke CSV/JSON
- Quadruple annotation form — `TextHighlighter`, `CategoryPicker`, `QuadrupleForm`
- Project UI + CSV upload frontend — `CreateProjectModal`, `UploadCSVModal`, export buttons (in progress, Group D agent)

### Sedang Dikerjakan
- Group D agent (`wM` `FE-project-ui`) — Project UI: CreateProjectModal, UploadCSVModal, export buttons

### Belum Selesai
- Testing setup (Group E) — menunggu Group D selesai
- Annotate page belum ditest end-to-end

---

### 6. CI typecheck gagal: tsc project references conflict

**Masalah**: Root `tsconfig.json` pakai `references` ke `apps/worker` dan `apps/web`, tapi script typecheck root pakai `tsc --noEmit --project tsconfig.json`. TypeScript tidak mengizinkan `--noEmit` bersamaan dengan project references mode.

**Fix**: Ubah script `typecheck` di root `package.json` dari `tsc --noEmit --project tsconfig.json` menjadi `npm run typecheck --workspaces --if-present` — typecheck jalan per workspace masing-masing.

**Files**: `package.json`

---

### 7. CI typecheck gagal: packages/shared dist tidak ada

**Masalah**: `apps/worker/tsconfig.json` punya `references` ke `../../packages/shared`, yang mengharapkan `packages/shared/dist/` sudah di-build. Di CI (fresh checkout), `dist/` tidak ada karena `npm ci` tidak build packages.

**Fix**: Hapus `references` dari `apps/worker/tsconfig.json`. `packages/shared` sudah resolve via `exports` field di `package.json` (`"types": "./src/index.ts"`), jadi TypeScript bisa resolve langsung dari source tanpa build.

**Files**: `apps/worker/tsconfig.json`

---

### 8. CI test gagal: vitest no test files found

**Masalah**: `apps/worker` belum punya test files, tapi vitest exit code 1 kalau tidak ada test yang ditemukan. CI gagal di step test.

**Fix**: Tambah flag `--passWithNoTests` ke script test di `apps/worker/package.json`. Test files akan dibuat oleh Group E agent setelah semua fitur selesai.

**Files**: `apps/worker/package.json`

---

### 9. Biome lint errors di agent branches

**Masalah**: Agent-agent yang di-spawn menulis code dengan format/lint yang tidak sesuai Biome rules. Error muncul di CI setelah PR dibuat.

**Fix**: Jalankan `npx biome check --write --unsafe .` di worktree branch agent sebelum push. Semua errors auto-fixable. Error yang tidak auto-fixable (`noArrayIndexKey`, missing required fields di interface) di-fix manual.

**Files**: Berbagai file di `apps/web/src/` dan `apps/worker/src/`

# Task 010 — Backend Refactor: CSV stays in R2, text_column, annotations endpoint

## Branch: `backend-refactor`

## Context

Arsitektur lama: upload CSV → parse → insert semua rows ke D1 (berat, error SQL variables).
Arsitektur baru: upload CSV → simpan di R2 saja. D1 hanya simpan quadruples (hasil anotasi).

## API Contract (sudah disepakati)

### Schema changes
- Tambah kolom `text_column TEXT NOT NULL DEFAULT ''` ke tabel `projects`
- Buat migration D1 baru untuk ALTER TABLE

### Endpoints yang berubah

1. `POST /projects/:id/upload/init`
   - Body tambah: `{ file_name, file_size, text_column }`
   - Simpan `text_column` ke project saat init

2. `POST /projects/:id/upload/complete`
   - HAPUS semua insert ke `dataset_rows`
   - Hanya update project: `file_name`, `file_size`, `total_rows` (hitung dari CSV line count)
   - CSV tetap di R2 (jangan hapus setelah complete)

3. `GET /projects/:id/csv` ← **ENDPOINT BARU**
   - Auth: required
   - Stream CSV dari R2 ke browser
   - Response: `Content-Type: text/csv`

4. `POST /projects/:id/annotations` ← **ENDPOINT BARU**
   - Auth: required
   - Body: `{ row_index: number, aspect: string, category: string, opinion: string, sentiment: string }`
   - Insert satu quadruple ke D1

5. `GET /projects/:id/annotations` ← **ENDPOINT BARU**
   - Auth: required
   - Response: `{ data: Annotation[] }`

6. `GET /projects/:id/export?format=csv|json`
   - Implementasi baru: load CSV dari R2 + join dengan annotations dari D1
   - Output tetap sama (text + quadruples)

### Shared schemas (packages/shared/src/schemas.ts)
Tambah:
```ts
UploadInitSchema: tambah text_column field
AnnotationCreateSchema: { row_index, aspect, category, opinion, sentiment }
```

## Files to touch
- `apps/worker/src/db/schema.ts` — tambah text_column ke projects, tambah annotations table
- `apps/worker/src/db/migrations/` — buat migration baru
- `apps/worker/src/services/csv-upload.ts` — hapus D1 insert, simpan CSV permanen di R2
- `apps/worker/src/routes/projects.ts` — update upload/init, upload/complete
- `apps/worker/src/routes/annotations.ts` — **FILE BARU** GET + POST /annotations
- `apps/worker/src/index.ts` — mount annotations route
- `apps/worker/src/routes/export.ts` — refactor join CSV+annotations
- `packages/shared/src/schemas.ts` — tambah schemas baru

## TIDAK boleh touch
- `apps/web/` — frontend dikerjakan Agent B paralel

## Steps
1. Read AGENT.md
2. Rename TODO.010 → WIP.010
3. Update schema + migration
4. Refactor csv-upload.ts
5. Update routes
6. Run lint + typecheck
7. Rename WIP.010 → DONE.010
8. Push: `git push -u origin backend-refactor`

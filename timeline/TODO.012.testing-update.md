# Task 012 — Testing Update: Update tests untuk arsitektur baru

## Branch: `testing-update`

## Dependencies
- Tunggu `backend-refactor` (010) dan `frontend-annotate` (011) di-merge ke development dulu

## Context
Arsitektur baru menghapus insert rows ke D1 saat upload. Tests yang ada mungkin masih expect behavior lama. Perlu update semua test yang terkait upload flow dan annotation.

## Tasks

1. Update `csv-upload` tests:
   - Upload complete tidak lagi insert ke `dataset_rows`
   - Test bahwa CSV tetap ada di R2 setelah complete
   - Test `text_column` disimpan ke project

2. Update `projects` tests:
   - Test endpoint `GET /csv` — return CSV stream dari R2
   - Test upload/init dengan `text_column`

3. Tambah `annotations` tests:
   - `POST /projects/:id/annotations` — simpan quadruple
   - `GET /projects/:id/annotations` — ambil semua quadruples

4. Update `export` tests:
   - Export sekarang join CSV dari R2 + annotations dari D1

## Files to touch
- `apps/worker/src/tests/csv-upload.test.ts` (atau nama yang relevan)
- `apps/worker/src/tests/projects.test.ts`
- `apps/worker/src/tests/annotations.test.ts` ← FILE BARU
- `apps/worker/src/tests/export.test.ts`

## Steps
1. Read AGENT.md
2. Rename TODO.012 → WIP.012
3. Update tests
4. Run: `npm run test -w apps/worker`
5. Fix semua failing tests
6. Rename WIP.012 → DONE.012
7. Push: `git push -u origin testing-update`

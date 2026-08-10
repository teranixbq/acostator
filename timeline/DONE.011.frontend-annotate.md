# Task 011 — Frontend Annotate: Column picker, local CSV, IndexedDB, annotation sync

## Branch: `frontend-annotate`

## Context

Arsitektur baru: CSV tidak di-insert ke D1. Frontend load CSV dari R2, anotasi dilakukan lokal di browser (IndexedDB), sync quadruples ke D1 saat complete/skip.

## API Contract yang sudah disepakati (dari backend-refactor / Agent A)

```
GET  /projects/:id/csv                          → stream CSV (text/csv)
POST /projects/:id/upload/init                  → body tambah: text_column
POST /projects/:id/annotations                  → { row_index, aspect, category, opinion, sentiment }
GET  /projects/:id/annotations                  → { data: Annotation[] }
```

Project object sekarang punya field: `text_column: string`

## Tasks

### 1. UploadCSVModal — Column Picker
- Sebelum upload, parse header row dari file CSV yang dipilih user (tidak perlu upload dulu)
- Tampilkan dropdown: "Pilih kolom untuk teks anotasi"
- Simpan pilihan sebagai `text_column`
- Kirim `text_column` ke `POST /upload/init`

### 2. Annotate Page — Load CSV dari R2
- Saat annotate page dibuka, fetch `GET /projects/:id/csv`
- Parse CSV di browser (split lines, ambil kolom `text_column`)
- Simpan ke **IndexedDB** (bukan localStorage, karena data bisa besar):
  - DB name: `acostator-{projectId}`
  - Store `csv_rows`: `{ row_index: number, text: string }`
  - Store `progress`: `{ last_row_index: number }`
- Jika IndexedDB sudah ada data untuk project ini, skip fetch (sudah cached)

### 3. Navigation — Lokal tanpa API
- Next/Prev/Skip = operasi lokal: increment/decrement row_index di memory
- Tidak ada API call untuk navigation
- Status tracking di IndexedDB: mana yang sudah completed/skipped

### 4. Annotation Sync — Simpan ke D1
- Saat user klik Complete: `POST /projects/:id/annotations` dengan quadruple + row_index
- Saat user klik Skip: tandai di IndexedDB sebagai skipped, tidak perlu kirim ke D1
- Load existing annotations: `GET /projects/:id/annotations` saat page load, simpan ke memory

### 5. Fix Duplikat ROW TEXT di UI
- Di `annotate.tsx` sekarang muncul 2x ROW TEXT
- Hapus salah satu — yang untuk "view" dan "labeling" harusnya 1 komponen saja

## Files to touch
- `apps/web/src/components/UploadCSVModal.tsx` — tambah column picker
- `apps/web/src/pages/annotate.tsx` — refactor major: load CSV, IndexedDB, local nav
- `apps/web/src/lib/api.ts` — tambah endpoint baru (csv, annotations)
- `apps/web/src/lib/indexeddb.ts` — **FILE BARU**: wrapper IndexedDB

## TIDAK boleh touch
- `apps/worker/` — backend dikerjakan Agent A paralel

## Steps
1. Read AGENT.md
2. Rename TODO.011 → WIP.011
3. Implement column picker di UploadCSVModal
4. Implement IndexedDB wrapper
5. Refactor annotate.tsx
6. Update api.ts
7. Run lint + typecheck
8. Rename WIP.011 → DONE.011
9. Push: `git push -u origin frontend-annotate`

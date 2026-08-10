# Task 013 — Docs Update: Reflect new architecture in bilingual docs

## Branch: `setup-docs` (langsung push ke setup-docs, bukan branch baru)

## Context

Arsitektur berubah besar — dari "insert semua CSV rows ke D1" menjadi "CSV tetap di R2, D1 hanya simpan quadruples". Semua docs yang menyebut arsitektur lama perlu diupdate.

## Documents to update

### 1. `docs/business-logic/en/001.product-definition.md` + id version
- Update section "CSV Upload" — tidak ada lagi insert ke D1
- Tambah section "Column Picker" — user pilih kolom text saat upload
- Update section "Annotation Flow" — sekarang load dari R2, anotasi lokal di browser
- Update section "Export" — join CSV dari R2 + quadruples dari D1

### 2. `docs/business-logic/en/002.database-schema.md` + id version
- Tambah kolom `text_column` di tabel `projects`
- Hapus/update penjelasan `dataset_rows` — tidak lagi diisi saat upload
- Tambah tabel `annotations` (quadruples hasil anotasi)

### 3. `docs/architecture/en/001.system-architecture.md` + id version (jika ada)
- Update data flow diagram/description
- CSV flow baru: Upload → R2 (permanent) → browser load saat annotate
- D1 hanya: projects, categories, annotations (quadruples)

### 4. `docs/problems-solutions/en/common-issues.md` + id version
- Tambah: "D1 too many SQL variables" — root cause + fix (ganti arsitektur, tidak insert rows)
- Tambah: "Cloudflare production branch pointing ke main bukan development"

## Steps
1. Checkout branch `setup-docs`
2. Update semua docs di atas (en + id)
3. Commit: "docs: update architecture docs — CSV stays in R2, D1 for quadruples only"
4. Push: `git push origin setup-docs`

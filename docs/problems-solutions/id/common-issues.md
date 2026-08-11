# Acostator — Masalah Umum & Solusi

## 1. D1 "Too Many SQL Variables" saat Upload CSV

**Masalah**: Saat upload CSV besar (ribuan baris), worker mencoba insert semua baris ke tabel `dataset_rows` D1 dalam satu transaksi. D1 (SQLite) punya batas 32.766 bind parameter per statement, menyebabkan error 500 untuk CSV dengan lebih dari ~500 baris.

**Root cause**: Setiap insert baris butuh beberapa kolom (id, project_id, row_index, text, status, created_at, updated_at = 7 param). 500 baris × 7 param = 3.500 param — masih di bawah batas, tapi batching di 500 bersifat rapuh dan solusi sebenarnya bersifat arsitektural.

**Fix**: Hapus tabel `dataset_rows` sepenuhnya. CSV tetap di R2 secara permanen. Browser fetch CSV dari R2 sekali, parse secara lokal, cache di IndexedDB. D1 hanya menyimpan annotation quadruple (satu baris per quadruple, bukan per baris CSV).

**File yang berubah**: `apps/worker/src/routes/projects.ts`, `apps/worker/src/db/schema.ts`, migrasi `0001_annotations`

---

## 2. UNIQUE Constraint 500 pada POST Annotations

**Masalah**: Saat user menyelesaikan sebuah row, lalu navigasi balik dan menyelesaikannya lagi, `POST /projects/:id/annotations` mengembalikan 500 karena kombinasi `(project_id, row_index, aspect_term, opinion_term)` yang sama sudah ada di D1.

**Root cause**: Insert menggunakan plain `INSERT`, bukan upsert. Re-submit row yang sama melanggar UNIQUE constraint.

**Fix**: Diubah ke `INSERT OR REPLACE` (upsert) di `apps/worker/src/routes/annotations.ts`. Re-submit anotasi yang sama sekarang secara diam-diam menggantikan record yang ada.

**File yang berubah**: `apps/worker/src/routes/annotations.ts`

---

## 3. Highlight Anotasi yang Sudah Ada Tidak Muncul di TextHighlighter

**Masalah**: Saat user membuka row yang sudah memiliki anotasi tersimpan, highlight teks (overlay span berwarna) tidak muncul. Hanya seleksi aktif (aspect/opinion yang sedang dipilih) yang menampilkan warna.

**Root cause**: Di `apps/web/src/pages/annotate.tsx`, prop `existingQuadruples` yang dikirim ke `QuadrupleForm` selalu berupa array kosong `[]` (hardcoded sebagai `const noServerQuadruples: Quadruple[] = []`). Komentar lama di kode mengklaim "highlights come from the form's own internal span selection state" — tapi form tidak memiliki mekanisme tersebut.

**Fix**: Map `pendingAnnotations` (list in-memory anotasi untuk row saat ini) ke format `Quadruple[]` agar `TextHighlighter` bisa render highlight berwarna per-anotasi.

```ts
// apps/web/src/pages/annotate.tsx
const noServerQuadruples: Quadruple[] = pendingAnnotations.map((a) => ({
  id: a.localId,
  row_id: "",
  project_id: projectId ?? "",
  aspect_term: a.aspectTerm,
  aspect_implicit: a.aspectImplicit,
  aspect_start: a.aspectStart,
  aspect_end: a.aspectEnd,
  category_id: a.categoryId,
  opinion_term: a.opinionTerm,
  opinion_implicit: a.opinionImplicit,
  opinion_start: a.opinionStart,
  opinion_end: a.opinionEnd,
  sentiment: a.sentiment,
  created_at: "",
  updated_at: "",
}));
```

**File yang berubah**: `apps/web/src/pages/annotate.tsx`

---

## 4. Warna Anotasi Terlihat Sama antara Seleksi Aktif dan Anotasi Pertama

**Masalah**: Saat menambah anotasi baru sementara anotasi #1 sudah ada, seleksi aspect aktif dan anotasi #1 keduanya tampil biru. User mungkin mengira "semua biru".

**Root cause**: Bukan bug. `ANNOTATION_COLORS[0]` berwarna biru (`bg-blue-200`), dan style `active-aspect` juga biru (`bg-blue-200 ring-1 ring-blue-400`). Keduanya sengaja mirip karena anotasi #1 dan seleksi aktifnya adalah item yang sama.

**Behavior yang diharapkan**:
- Highlight anotasi #1 = biru (index 0)
- Highlight anotasi #2 = emerald (index 1)
- Seleksi aspect aktif = biru + ring (dapat dibedakan dari outline ring)
- Seleksi opinion aktif = emerald + ring

Tidak perlu fix. Anotasi dengan data span yang dibuat setelah fix highlight akan tampil dengan warna per-index yang berbeda.

---

## 5. OAuth Callback Redirect ke Root Worker, Bukan Pages

**Masalah**: Setelah login GitHub OAuth, worker melakukan `c.redirect("/")` yang redirect ke `acostator-api.apicode.my.id/` (JSON 404), bukan ke frontend Pages.

**Fix**: Tambah env var `FRONTEND_URL` dan ubah redirect ke `c.redirect(c.env.FRONTEND_URL)`.

**File yang berubah**: `apps/worker/src/routes/auth.ts`

---

## 6. Session Cookie Tidak Dikirim Cross-Subdomain

**Masalah**: Cookie di-set tanpa atribut `Domain`, sehingga browser hanya mengirimnya ke `acostator-api.apicode.my.id`. Frontend Pages di `acostator.apicode.my.id` tidak bisa membaca session.

**Fix**: Tambah `Domain=.apicode.my.id` ke cookie via parameter `domain` di `setSessionCookie`. Domain dibaca dari `c.env.ALLOWED_DOMAIN`.

**File yang berubah**: `apps/worker/src/lib/auth.ts`

---

## 7. Cloudflare Workers Auto-Deploy Mengarah ke `main` bukan `development`

**Masalah**: Cloudflare Workers Builds dikonfigurasi untuk deploy dari `main`, tapi semua pengembangan aktif terjadi di `development`. Merge ke `development` tidak memicu deploy.

**Fix**: Ubah production branch di dashboard Cloudflare Workers Builds dari `main` ke `development`.

---

## 8. CI Test Step Gagal: "No Test Files Found"

**Masalah**: Vitest keluar dengan kode 1 saat tidak ada test file. CI gagal di step test meskipun belum ada test file.

**Fix**: Tambah flag `--passWithNoTests` ke script test di `apps/worker/package.json`.

**File yang berubah**: `apps/worker/package.json`

---

## 9. Biome Lint Errors di Agent Branches

**Masalah**: Agent menulis kode dengan format atau pola yang melanggar aturan Biome. CI gagal setelah PR dibuat.

**Fix**: Jalankan `npx biome check --write --unsafe .` di worktree sebelum push. Semua error auto-fixable. Error yang tidak auto-fixable (`noArrayIndexKey`, missing required interface fields) harus di-fix manual.

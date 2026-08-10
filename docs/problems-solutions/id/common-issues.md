# Acostator — Masalah Umum & Solusi

Dokumen ini mencatat masalah yang ditemukan selama pengembangan beserta solusi yang diterapkan. Tambahkan entri baru setiap kali masalah ditemukan dan diselesaikan.

---

## Masalah 1: Upload Route 404 — Konflik Routing Hono

**Gejala:** `POST /projects/:projectId/upload/init` mengembalikan `{"error":"Not found"}` 404 meskipun route sudah didefinisikan di dalam `projectRoutes`.

**Akar masalah:**

Route dipasang di `apps/worker/src/index.ts` seperti ini:

```ts
app.route("/projects", projectRoutes)
app.route("/projects/:projectId/rows", rowRoutes)
app.route("/projects/:projectId/categories", categoryRoutes)
app.route("/projects", exportRoutes)
```

Hono tidak dapat menyelesaikan `/:projectId/upload/init` di dalam `projectRoutes` karena route top-level lain juga menggunakan `/:projectId` sebagai prefix. Segmen dinamis yang tumpang tindih menyebabkan konflik routing — Hono mencocokkan handler yang salah sebelum mencapai upload route.

**Solusi:**

Konsolidasi pemasangan route di `apps/worker/src/index.ts` sehingga semua sub-route di bawah `/projects/:projectId` didaftarkan tanpa prefix top-level yang konflik.

**Commit:** `fix(worker): resolve upload route 404 by consolidating /projects routes`

**File yang diubah:**
- `apps/worker/src/index.ts`
- `apps/worker/src/routes/projects.ts`

**Pelajaran:** Saat menggunakan `app.route()` di Hono, hindari mendaftarkan beberapa route top-level yang berbagi prefix segmen dinamis yang sama. Konsolidasikan di bawah satu titik mount atau gunakan sub-router untuk mencegah Hono salah mengarahkan request.

---

## Masalah 2: Auto-Deploy Cloudflare Workers Hanya Berjalan dari `main`, Bukan `development`

**Gejala:** Perbaikan yang di-merge ke branch `development` tidak pernah ter-deploy ke worker yang aktif. Worker produksi terus menjalankan kode lama meskipun merge berhasil.

**Akar masalah:**

Integrasi GitHub pada Cloudflare Workers dikonfigurasi dengan production branch yang disetel ke `main`. Semua PR di proyek ini di-merge ke `development`, sehingga setiap merge tidak memicu deploy sama sekali.

**Solusi (pilih salah satu):**

Opsi A — Ubah production branch di dashboard Cloudflare:
1. Buka dashboard Cloudflare Workers → pilih worker
2. Settings → Build → Production branch
3. Ubah dari `main` menjadi `development`
4. Simpan

Opsi B — Merge `development` ke `main` saat siap rilis ke produksi.

**Pencegahan:**

Dokumentasikan dengan jelas di `AGENT.md` dan dokumen arsitektur bahwa pengaturan production branch Cloudflare Workers harus sesuai dengan branch integrasi yang digunakan di repo ini (`development`). Setiap agent atau kontributor yang menyiapkan worker baru harus memverifikasi pengaturan ini sebelum mengharapkan deploy berjalan.

---

## Masalah 3: D1 "Too Many SQL Variables" saat Upload CSV

**Gejala:** Mengupload CSV dengan lebih dari ~500 baris menyebabkan Worker melempar error D1: `too many SQL variables`. Upload terlihat berhasil di frontend, namun data hilang atau Worker crash diam-diam.

**Akar masalah:**

Arsitektur awal menginsert setiap baris CSV sebagai record `DatasetRow` di D1 saat upload. D1 (SQLite) memiliki batas keras 999 bound parameter per statement. Dengan insert multi-kolom yang di-batch secara naif, CSV besar melampaui batas ini dan menyebabkan query gagal.

Upaya workaround dengan ukuran batch lebih kecil (mis. 500 baris per transaksi) hanya menunda masalah — batching mengurangi frekuensi error tapi tidak menghilangkannya untuk file yang sangat besar, dan membuat upload lambat serta boros resource.

**Solusi:**

Desain ulang arsitektur untuk menghilangkan penyimpanan row di D1 sepenuhnya:

- File CSV disimpan permanen di R2 setelah upload (sudah berlaku sebelumnya)
- Tidak ada record `DatasetRow` yang diinsert ke D1 kapanpun
- Saat anotasi, browser fetch CSV dari R2 dan parse di sisi client dengan Papa Parse
- D1 hanya menyimpan record `Annotation` (quadruples), yang ditulis satu per satu saat user melakukan anotasi

Ini menghilangkan bottleneck upload sepenuhnya dan membuat sistem bisa menangani CSV berukuran sembarang.

**Mengapa solusi ini:**

Akar masalahnya bersifat arsitektural — mencoba mencerminkan data row ke database yang tidak dirancang untuk bulk insert konten CSV sembarang. Perbaikannya menghilangkan pencerminan itu sepenuhnya. R2 adalah layer penyimpanan yang tepat untuk file mentah; D1 adalah layer yang tepat hanya untuk data anotasi terstruktur.

**Status:**
Terverifikasi: 2026-08-11

---

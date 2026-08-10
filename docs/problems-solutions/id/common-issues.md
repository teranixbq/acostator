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

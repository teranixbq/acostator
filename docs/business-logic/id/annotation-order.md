# Urutan Anotasi — Logika Bisnis

## Ringkasan

Setiap project memiliki pengaturan `annotation_order` yang mengontrol urutan baris dataset yang ditampilkan ke anotator.

## Nilai

| Nilai | Perilaku |
|---|---|
| `sequential` | Baris ditampilkan sesuai urutan insert (row_index 0, 1, 2, ...) |
| `random` | Baris diacak sekali saat upload menggunakan Fisher-Yates; permutasi disimpan sebagai JSON di `projects.annotation_queue` |

## Default

Project baru selalu menggunakan `sequential` secara default. Urutan anotasi bisa diubah kapan saja dari halaman detail project — tidak mempengaruhi anotasi yang sudah selesai.

## Di Mana Dikonfigurasi

- **Buat project** — `POST /projects` selalu set `annotation_order: "sequential"` secara default; user tidak memilih saat pembuatan
- **Halaman detail project** — user bisa ubah `annotation_order` via `PATCH /projects/:id`

## Cara Kerja Random Queue

Ketika CSV diupload ke project dengan `annotation_order: "random"`:
1. Indeks baris `[0, 1, ..., n-1]` diacak menggunakan Fisher-Yates
2. Array yang sudah diacak disimpan sebagai JSON di `projects.annotation_queue`
3. `getNextRow` membaca dari depan queue
4. Saat complete/skip, indeks yang dikonsumsi di-pop dari queue

Ketika `annotation_order: "sequential"`:
- `annotation_queue` bernilai `null`
- `getNextRow` query baris berurutan berdasarkan `row_index` dengan filter `status != completed/skipped`

## Mengubah Urutan Anotasi

Mengubah `annotation_order` pada project yang sudah ada:
- **Tidak** mengacak ulang atau mereset anotasi yang sudah selesai
- Jika diubah dari `sequential` ke `random`, queue baru dibuat dari baris yang tersisa (belum selesai)
- Jika diubah dari `random` ke `sequential`, queue dihapus (`annotation_queue = null`)

## API

```
POST   /projects              — buat project (annotation_order selalu "sequential")
PATCH  /projects/:id          — update annotation_order { "annotation_order": "sequential" | "random" }
GET    /projects/:id/rows/next — ambil baris berikutnya berdasarkan annotation_order saat ini
```

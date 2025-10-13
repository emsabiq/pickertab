# Picker Tabs

Aplikasi ringan untuk mengelola daftar tab/panel (PDF, gambar, atau tautan) yang ditampilkan di layar.

## Runtime PHP vs Node.js

Repositori ini menyertakan implementasi backend berbasis PHP (`save_manifest.php`, `proxy.php`) dan API Node.js
pada folder `api/`. Keduanya menulis ke berkas `manifest.json` yang sama sehingga Anda dapat memilih runtime yang
paling nyaman.

## Variabel Lingkungan untuk Node.js

Saat menjalankan server Node.js (mis. Express, Next.js, atau Vercel), atur variabel lingkungan berikut agar fitur
API bekerja dengan benar:

| Nama | Deskripsi |
| ---- | --------- |
| `ADMIN_PIN` | PIN yang wajib dikirim operator Control saat menekan tombol **Publish**. Digunakan untuk memverifikasi permintaan pada `/api/save_manifest`. |
| `ALLOWED_HOSTS` | Daftar host eksternal yang diizinkan untuk diproksi oleh `/api/proxy`. Gunakan format koma, mis. `example.com,files.example.com`. Subdomain otomatis diperbolehkan. |
| `MANIFEST_PATH` | (Opsional) Lokasi berkas manifest yang akan disimpan. Default-nya `manifest.json` di root project. |

Anda dapat menyalin `.env.example` menjadi `.env` atau mengisi variabel tersebut sesuai mekanisme hosting Anda.

## Endpoints Node.js

- `POST /api/save_manifest`
  - Validasi PIN terhadap `ADMIN_PIN`.
  - Menyaring daftar tab (ID, judul, tipe, URL) dan meningkatkan nomor revisi (`rev`).
  - Menyimpan manifest secara atomik ke `MANIFEST_PATH`.

- `GET /api/proxy?url=...`
  - Memastikan host tujuan termasuk dalam whitelist `ALLOWED_HOSTS` (subdomain diperbolehkan).
  - Mengambil konten eksternal dan meneruskan dengan header aman (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, dll.) agar bisa ditampilkan sebagai iframe atau gambar.

- `GET /api/local_list?path=...`
  - Mengambil daftar berkas lokal di dalam folder `public/assets` untuk dipilih dari Control Panel.

## Pengembangan

1. Instal dependensi dan jalankan server Node.js sesuai framework pilihan Anda.
2. Salin `.env.example` menjadi `.env`, kemudian atur `ADMIN_PIN` dan `ALLOWED_HOSTS`.
3. Buka `control.html` untuk mengatur tab dan tekan **Publish** setelah memasukkan PIN.
4. Buka `index.html` pada layar display; viewer akan memperbarui isi secara otomatis.

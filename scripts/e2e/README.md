# Uji e2e (browser) Task Management

Skrip Playwright untuk menguji aplikasi lewat browser sungguhan. **Bukan bagian dari `npm run test:logic`** dan tidak otomatis jalan di CI.

## PERINGATAN

Database lokal (`.env.local`) adalah **database PRODUKSI**. Skrip ini membuat dan menghapus data sungguhan. Aturan keselamatan:

1. Skrip menolak jalan kecuali `E2E_CONFIRM_PRODUCTION=ya` di-set.
2. `BASE` harus `http://localhost:<port>` (default `http://localhost:3100`).
3. Server **harus** dimulai dengan email mati. Skrip membaca environment proses server dan menolak jalan bila `BREVO_API_KEY` tidak kosong.
4. Semua data uji berawalan `UJI-E2E` (user: `uji-e2e-...@example.com`). `write-flow.mjs` dan `rbac.mjs` memanggil pembersihan di `finally`; `cleanup.mjs` bisa dijalankan manual dan harus melaporkan `sisa` semua 0.
5. RAM laptop terbatas: jangan `next dev`; satu `next start` saja di port 3100.
6. Sesi admin memakai user ADMIN sementara `uji-e2e-admin@example.com` (login password, dibuat `ensureAdmin`, dihapus `runCleanup`). Akun admin produksi tidak disentuh dan pembersihan hanya menghapus `uji-e2e-%@example.com`. Rahasia tidak pernah dicetak.

## Prasyarat

- `.env.local` terisi.
- Playwright 1.65.0 ada di `devDependencies` (`npm ci`). Browser TIDAK diunduh otomatis: butuh `chromium_headless_shell-1254` di `~/.cache/ms-playwright` (bila belum ada: `npx playwright install chromium-headless-shell`). Untuk memakai Playwright lain, set `PLAYWRIGHT_MODULE_DIR` (folder `node_modules` yang berisi `playwright`).
- Hasil ditulis ke `~/.cache/taskmgmt-smoke/` (bukan `/tmp`).

## Cara menjalankan

```bash
./node_modules/.bin/next build
BREVO_API_KEY="" BREVO_SENDER_EMAIL="" ./node_modules/.bin/next start -p 3100 &

export E2E_CONFIRM_PRODUCTION=ya
npm run e2e:smoke     # baca-saja: buka semua halaman admin
npm run e2e:write     # 14 langkah alur tulis (project -> task -> usulan -> meeting -> nonaktifkan user)
npm run e2e:rbac      # matriks hak akses per role (hasil: tabel di konsol + ~/.cache/taskmgmt-smoke/rbac-result.json)
npm run e2e:c20       # Team Member tidak bisa membatalkan task (UI + server action); PM bisa
npm run e2e:a3       # ganti password paksa + link reset (audit A3)
npm run e2e:manual-f # uji manual audit bagian F (A2, A4, A5, A6, A8, A12) + PM tidak bisa memindah task ke project lain
npm run e2e:cleanup   # hapus sisa data UJI-E2E (jika run terputus)
```

Hentikan server setelah selesai (cek cwd proses sebelum `kill`):

```bash
P=$(ss -ltnp | grep ":3100 " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
[ "$(readlink /proc/$P/cwd)" = "$PWD" ] && kill $P
```

Kode keluar 0 = lulus; 1 = ada cek gagal atau sisa data; 2 = ditolak oleh guard.

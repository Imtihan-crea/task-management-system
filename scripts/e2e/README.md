# Uji e2e (browser) Task Management

Skrip Playwright untuk menguji aplikasi lewat browser sungguhan. **Bukan bagian dari `npm run test:logic`** dan tidak otomatis jalan di CI.

## PERINGATAN

Database lokal (`.env.local`) adalah **database PRODUKSI**. Skrip ini membuat dan menghapus data sungguhan. Aturan keselamatan:

1. Skrip menolak jalan kecuali `E2E_CONFIRM_PRODUCTION=ya` di-set.
2. `BASE` harus `http://localhost:<port>` (default `http://localhost:3100`).
3. Server **harus** dimulai dengan email mati. Skrip membaca environment proses server dan menolak jalan bila `BREVO_API_KEY` tidak kosong.
4. Semua data uji berawalan `UJI-E2E` (user: `uji-e2e-...@example.com`). `write-flow.mjs` dan `rbac.mjs` memanggil pembersihan di `finally`; `cleanup.mjs` bisa dijalankan manual dan harus melaporkan `sisa` semua 0.
5. RAM laptop terbatas: jangan `next dev`; satu `next start` saja di port 3100.
6. Sesi admin dibuat dari link recovery sekali pakai (`auth.admin.generateLink`), password admin **tidak diubah**. Email admin dibaca dari `private/akun-admin.md` (di-gitignore). Rahasia tidak pernah dicetak.

## Prasyarat

- `.env.local` terisi dan `private/akun-admin.md` ada.
- Playwright **tidak** ada di `package.json`. Skrip mencarinya di `PLAYWRIGHT_MODULE_DIR` (folder `node_modules` yang berisi `playwright`); bawaan: `~/.npm/_npx/e41f203b7505f1fb/node_modules`. Chromium headless harus sudah terpasang untuk Playwright itu.
- Hasil ditulis ke `~/.cache/taskmgmt-smoke/` (bukan `/tmp`).

## Cara menjalankan

```bash
./node_modules/.bin/next build
BREVO_API_KEY="" BREVO_SENDER_EMAIL="" ./node_modules/.bin/next start -p 3100 &

export E2E_CONFIRM_PRODUCTION=ya
npm run e2e:smoke     # baca-saja: buka semua halaman admin
npm run e2e:write     # 14 langkah alur tulis (project -> task -> usulan -> meeting -> nonaktifkan user)
npm run e2e:rbac      # matriks hak akses per role (hasil: tabel di konsol + ~/.cache/taskmgmt-smoke/rbac-result.json)
npm run e2e:cleanup   # hapus sisa data UJI-E2E (jika run terputus)
```

Hentikan server setelah selesai (cek cwd proses sebelum `kill`):

```bash
P=$(ss -ltnp | grep ":3100 " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
[ "$(readlink /proc/$P/cwd)" = "$PWD" ] && kill $P
```

Kode keluar 0 = lulus; 1 = ada cek gagal atau sisa data; 2 = ditolak oleh guard.

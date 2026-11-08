# Hasil audit aksesibilitas (axe-core)

Tanggal: 9 Nov 2026. Alat: `npm run e2e:a11y` (`scripts/e2e/a11y.mjs`), axe-core
dipasang di luar repo (lihat komentar di skrip; `AXE_PATH` mengarah ke
`axe.min.js`). Halaman: `/login` (tanpa login) + 27 halaman aplikasi sebagai
admin (daftar sama dengan smoke test, ditambah `/settings`, `/projects/new`,
`/users/new`). Semua dibuka baca-saja.

## Jumlah pelanggaran (node) sebelum dan sesudah

| Aturan axe | Dampak | Sebelum | Sesudah |
| --- | --- | ---: | ---: |
| color-contrast | serious | 383 | 2 |
| label-content-name-mismatch | serious | 27 | 0 |
| landmark-unique | moderate | 2 | 0 |
| page-has-heading-one | moderate | 1 | 0 |
| aria-progressbar-name | serious | 1 | 0 |
| **Total** | | **414** | **2** |

Aturan yang sudah lolos sejak awal (tidak ada pelanggaran): label input/select,
nama tombol/link, ARIA tidak valid, id ganda, `alt` gambar, urutan heading.

## Yang diperbaiki

- **Kontras warna** (Tailwind saja, tanpa mengubah warna brand):
  - `text-zinc-500` di permukaan terang menjadi `text-zinc-600` (dengan
    `dark:text-zinc-400` supaya mode gelap tetap terbaca); `text-zinc-400` dan
    `#A6A6A6` untuk teks kecil di permukaan terang menjadi `text-zinc-600`.
  - Judul grup di sidebar (latar gelap): `zinc-500` menjadi `zinc-400`.
  - Badge status hijau/merah: `green-600`/`red-600` menjadi `green-700`/`red-700`;
    tombol Submit hijau `bg-green-700`.
  - Nama dan role di menu profil Topbar memakai warna terang di header putih
    (hampir tak terbaca); sekarang `text-kasuat-black` / `zinc-600`. Tombol
    popover (lonceng dan profil) memakai border dan teks gelap di header terang.
- **label-content-name-mismatch**: tombol menu profil punya `aria-label` yang
  tidak memuat teks terlihat. `Popover` kini punya prop `nameFromContent`; nama
  tombol diambil dari isinya (teks `sr-only` "Menu profil" + nama + role).
- **landmark-unique**: dua `role="search"` tanpa nama diberi `aria-label`
  ("Pencarian global", "Cari task").
- **page-has-heading-one**: judul "Task Management" di `/login` menjadi `<h1>`.
- **aria-progressbar-name**: progress bar di tab Overview project diberi
  `aria-label`.

## Yang tersisa

- `color-contrast` 2 node: tautan `text-kasuat-deep-gold` (#9C7C3F) di atas putih
  (rasio 3,9; butuh 4,5) di `/meetings` dan `/settings`. Warna itu adalah warna
  brand; menggelapkannya berarti mengubah palet, jadi diputuskan pemilik.
  Pemakaian lain warna itu tidak ditandai axe pada halaman yang diuji.
- Audit otomatis hanya menangkap sekitar sepertiga masalah aksesibilitas.
  Belum diuji: navigasi keyboard penuh, pembaca layar, mode gelap, dan halaman
  yang butuh data tertentu (mis. error state).

# Hasil cek tata letak mobile (375x812)

Tanggal: 9 Nov 2026. Alat: `npm run e2e:mobile` (`scripts/e2e/mobile.mjs`).
28 halaman (`/login` + 27 halaman admin, termasuk form Buat Task, Project,
Meeting, Suggestion, dan detail Suggestion) difoto penuh ke
`~/.cache/taskmgmt-smoke/fase3/mobile/` (di luar repo) dan dicek otomatis:
`scrollWidth > innerWidth` dan elemen yang lebih lebar dari layar tanpa
pembungkus `overflow` yang memotongnya. Layar form dan detail diperiksa mata
lewat screenshot; tampilan desktop tidak diubah (semua perubahan di breakpoint
bawah atau netral).

## Sebelum dan sesudah

| Halaman | Lebar dokumen sebelum | Sebab | Perbaikan | Sesudah |
| --- | ---: | --- | --- | ---: |
| `/dashboard` | 402 px | baris Task Terdekat: nama task dan badge tidak bisa turun baris | `flex-wrap` di baris `components/dashboard/Sections.tsx` | 375 px |
| `/projects` | 392 px | kartu di grid satu kolom melebar mengikuti teks | `grid-cols-1` (kolom `minmax(0,1fr)`) | 375 px |
| `/activity` | 385 px | filter (select/input) lebih lebar dari kartu; judul aktivitas dengan email panjang tanpa spasi | `w-full min-w-0 sm:w-auto` pada isian filter; `break-words` di `ActivityTimeline` | 375 px |

Halaman lain tidak overflow sejak awal. Total halaman overflow: 3 menjadi 0.

## Catatan

- Tab (`Tabs`) memang bisa digulir horizontal di dalam wadahnya sendiri
  (`overflow-x-auto`); itu disengaja dan tidak dihitung sebagai overflow.
- Yang tidak diuji: layar lebih sempit dari 375 px, landscape, dan data dengan
  teks sangat panjang di semua halaman (hanya data produksi yang ada).

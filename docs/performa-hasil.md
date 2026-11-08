# Hasil performa halaman (fase 12, 9 Nov 2026)

Diukur dengan `npm run e2e:perf` (`scripts/e2e/perf.mjs`) sebagai admin uji `UJI-E2E` terhadap `next start` lokal (database produksi, jaringan ke Supabase cloud). Tiap halaman dibuka 3 kali berturut-turut; angka = median. TTFB = `responseStart - requestStart`; Muat = `loadEventEnd` (setelah `load` dan jaringan tenang). Satuan ms. Data uji dihapus setelahnya (sisa 0).

## Temuan

- Semua halaman memiliki lantai TTFB yang sama (sekitar 440 ms), bahkan halaman tanpa query seperti `/users/new`. Lantai itu adalah autentikasi per request: `proxy.ts` memanggil `auth.getUser()` (round trip ke Supabase Auth) lalu query status profil, kemudian `getCurrentProfile()` memanggil `getUser()` lagi sebelum query profil.
- Perbaikan: `getCurrentProfile()` memakai `auth.getClaims()` (verifikasi JWT lokal). Sesi yang dicabut atau akun nonaktif tetap tertangkap karena `proxy.ts` tetap memanggil `getUser()` pada setiap request halaman dan server action. Route `/api/*` (tidak lewat proxy) tetap memakai `getUser()`.
- N+1 di `lib/meetings/scheduler.ts` (cron meeting tiap 15 menit): per meeting ada query peserta, label project, dan cek event notes lama. Kini masing-masing satu query untuk semua meeting (`.in()`; peserta dan cek event dipecah per 50 meeting agar tidak menabrak batas 1000 baris atau panjang URL). Perilaku sama.
- Sudah baik, tidak diubah: `app/api/cron/deadlines` (nama project sekali jalan), `lib/meetings/digest.ts` (semua data dimuat sekali lalu dibagi per user), `lib/notifications/service.ts` (query penerima sudah `.in()`), data dashboard (`cache()` per request), halaman daftar dan detail (`Promise.all`). Loop `emitNotification` per task atau per user sengaja tetap berurutan: tiap panggilan mengklaim `event_key` unik dan mengirim email, jadi urutan dan idempotensinya dipertahankan.

## Hasil

| Halaman | TTFB sebelum | TTFB sesudah | Muat sebelum | Muat sesudah |
|---|---:|---:|---:|---:|
| `/settings` | 556 | 455 | 586 | 486 |
| `/profile` | 555 | 451 | 590 | 486 |
| `/notifications` | 554 | 450 | 587 | 484 |
| `/projects/{id}` | 465 | 341 | 1030 | 899 |
| `/task-suggestions` | 457 | 358 | 673 | 584 |
| `/tasks?view=overdue` | 456 | 341 | 574 | 460 |
| `/users/new` | 455 | 346 | 503 | 398 |
| `/meetings` | 454 | 338 | 798 | 747 |
| `/projects` | 453 | 341 | 895 | 791 |
| `/users` | 452 | 345 | 573 | 468 |
| `/projects/{id}?tab=workstreams` | 452 | 341 | 895 | 777 |
| `/projects/{id}?tab=meetings` | 452 | 341 | 906 | 794 |
| `/activity` | 448 | 338 | 714 | 581 |
| `/projects/{id}?tab=tasks` | 448 | 341 | 1015 | 911 |
| `/projects/{id}?tab=settings` | 447 | 339 | 887 | 785 |
| `/workstreams/new?project={id}` | 447 | 353 | 552 | 459 |
| `/dashboard` | 446 | 351 | 686 | 600 |
| `/tasks/new` | 445 | 342 | 558 | 456 |
| `/projects/{id}?tab=activity` | 445 | 345 | 994 | 907 |
| `/tasks` | 443 | 353 | 572 | 494 |
| `/meetings/new` | 443 | 346 | 664 | 566 |
| `/task-suggestions/new` | 443 | 344 | 668 | 563 |
| `/projects/new` | 442 | 349 | 553 | 458 |
| `/projects/{id}?tab=members` | 440 | 341 | 980 | 900 |
| `/task-suggestions/{id}` | 440 | 342 | 981 | 918 |
| `/tasks/{id}` | 438 | 350 | 1011 | 922 |

Median seluruh halaman: TTFB 448 -> 344 ms; muat 681 -> 582 ms

Catatan: `/settings`, `/profile`, `/notifications` sekitar 100 ms lebih lambat pada TTFB karena belum punya `loading.tsx` (halaman lain mengalirkan kerangka dulu, jadi TTFB-nya lebih awal); waktu muat penuhnya setara. `loading.tsx` untuk ketiganya ditambahkan setelah pengukuran ini. Satu pengukuran dengan jaringan nyata, jadi selisih di bawah sekitar 30 ms termasuk derau.

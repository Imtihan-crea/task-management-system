# Hasil performa halaman (fase 12, 9 Nov 2026)

Diukur dengan `npm run e2e:perf` (`scripts/e2e/perf.mjs`) sebagai admin uji `UJI-E2E` terhadap `next start` lokal (database produksi, jaringan ke Supabase cloud). Tiap halaman dibuka 3 kali berturut-turut; angka = median. TTFB = `responseStart - requestStart`; Muat = `loadEventEnd` (setelah `load` dan jaringan tenang). Satuan ms. Data uji dihapus setelahnya (sisa 0).

## Temuan

- Semua halaman memiliki lantai TTFB yang sama (sekitar 440 ms), bahkan halaman tanpa query seperti `/users/new`. Lantai itu adalah autentikasi per request: `proxy.ts` memanggil `auth.getUser()` (round trip ke Supabase Auth) lalu query status profil, kemudian `getCurrentProfile()` memanggil `getUser()` lagi sebelum query profil.
- Perbaikan: `getCurrentProfile()` memakai `auth.getClaims()` (verifikasi JWT lokal). Sesi yang dicabut atau akun nonaktif tetap tertangkap karena `proxy.ts` tetap memanggil `getUser()` pada setiap request halaman dan server action. Route `/api/*` (tidak lewat proxy) tetap memakai `getUser()`.
- N+1 di `lib/meetings/scheduler.ts` (cron meeting tiap 15 menit): per meeting ada query peserta, label project, dan cek event notes lama. Kini masing-masing satu query untuk semua meeting (`.in()`; peserta dan cek event dipecah per 50 meeting agar tidak menabrak batas 1000 baris atau panjang URL). Perilaku sama.
- Sudah baik, tidak diubah: `app/api/cron/deadlines` (nama project sekali jalan), `lib/meetings/digest.ts` (semua data dimuat sekali lalu dibagi per user), `lib/notifications/service.ts` (query penerima sudah `.in()`), data dashboard (`cache()` per request), halaman daftar dan detail (`Promise.all`). Loop `emitNotification` per task atau per user sengaja tetap berurutan: tiap panggilan mengklaim `event_key` unik dan mengirim email, jadi urutan dan idempotensinya dipertahankan.

## Hasil

Pengukuran akhir pada build terakhir (setelah `loading.tsx`, refactor helper, dan pembaruan dependensi fase 14).

| Halaman | TTFB sebelum | TTFB sesudah | Muat sebelum | Muat sesudah |
|---|---:|---:|---:|---:|
| `/settings` | 556 | 340 | 586 | 458 |
| `/profile` | 555 | 351 | 590 | 459 |
| `/notifications` | 554 | 366 | 587 | 478 |
| `/projects/{id}` | 465 | 338 | 1030 | 886 |
| `/task-suggestions` | 457 | 343 | 673 | 567 |
| `/tasks?view=overdue` | 456 | 344 | 574 | 464 |
| `/users/new` | 455 | 348 | 503 | 387 |
| `/meetings` | 454 | 359 | 798 | 704 |
| `/projects` | 453 | 351 | 895 | 790 |
| `/users` | 452 | 348 | 573 | 468 |
| `/projects/{id}?tab=workstreams` | 452 | 344 | 895 | 791 |
| `/projects/{id}?tab=meetings` | 452 | 340 | 906 | 786 |
| `/activity` | 448 | 349 | 714 | 591 |
| `/projects/{id}?tab=tasks` | 448 | 339 | 1015 | 897 |
| `/projects/{id}?tab=settings` | 447 | 349 | 887 | 798 |
| `/workstreams/new?project={id}` | 447 | 364 | 552 | 510 |
| `/dashboard` | 446 | 353 | 686 | 592 |
| `/tasks/new` | 445 | 338 | 558 | 455 |
| `/projects/{id}?tab=activity` | 445 | 346 | 994 | 901 |
| `/tasks` | 443 | 352 | 572 | 479 |
| `/meetings/new` | 443 | 347 | 664 | 568 |
| `/task-suggestions/new` | 443 | 337 | 668 | 563 |
| `/projects/new` | 442 | 337 | 553 | 456 |
| `/projects/{id}?tab=members` | 440 | 346 | 980 | 908 |
| `/task-suggestions/{id}` | 440 | 343 | 981 | 918 |
| `/tasks/{id}` | 438 | 354 | 1011 | 1060 |

Median seluruh halaman: TTFB 448 -> 346 ms; muat 681 -> 580 ms

Catatan: selisih di bawah sekitar 30 ms termasuk derau (satu sesi, jaringan nyata ke Supabase). Sebelum fase 14, pengukuran terpisah setelah perubahan autentikasi memberi median TTFB 344 ms; `/settings`, `/profile`, `/notifications` saat itu masih sekitar 450 ms karena belum punya `loading.tsx`.

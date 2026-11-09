# Usulan warna `deep-gold` (kontras AA)

Tanggal: 9 Nov 2026. Hanya usulan; warna aplikasi **tidak diubah**. Keputusan ada pada pemilik.

## Masalah

Dua sisa pelanggaran axe `color-contrast` (`docs/a11y-hasil.md`): tautan teks `text-kasuat-deep-gold` di atas putih, yaitu "Profil Saya" di `/settings` dan "+ Buat Meeting" (keadaan kosong) di `/meetings`. Token ada di `app/globals.css`: `--kasuat-deep-gold: #9C7C3F`. Warna itu juga dipakai di tautan `Topbar`, `ProjectGantt`, detail Task, dan `MeetingWorkspace`.

## Rasio kontras (rumus WCAG 2.x)

Dihitung oleh `node scripts/usulan-warna-gold.mjs` (teks normal butuh >= 4,5:1).

| Kandidat | Hex | vs putih `#FFFFFF` | vs `#F1F2F2` (off-white) | AA teks normal |
| --- | --- | --- | --- | --- |
| Sekarang | `#9C7C3F` | 3,91 | 3,49 | gagal |
| A (perubahan minimal) | `#8A6D35` | 4,86 | 4,33 | lulus di putih; gagal di off-white |
| B | `#82652F` | 5,45 | 4,86 | lulus keduanya |
| C (paling gelap) | `#7A5F2B` | 6,00 | 5,35 | lulus keduanya |

Perbandingan visual pada gaya elemen sebenarnya (`font-semibold`, bergaris bawah, di atas teks `zinc-600`): `docs/img/usulan-warna-gold/perbandingan.png`.

## Saran

B (`#82652F`): lulus di putih dan off-white dan masih terbaca sebagai emas tua. A paling dekat dengan brand tetapi tidak lulus bila tautan jatuh di latar `#F1F2F2`.

## Cara menerapkan (bila disetujui)

Ubah satu baris `--kasuat-deep-gold` di `app/globals.css`, lalu `npm run e2e:a11y` (harus 0 pelanggaran). Catatan: `deep-gold` juga bisa dipakai sebagai latar atau garis; cek tampilan Gantt dan tombol setelah diganti. Gambar dirender dengan font sistem, bukan Onest, jadi hanya warnanya yang representatif.

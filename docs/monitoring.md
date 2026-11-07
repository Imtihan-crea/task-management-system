# Error monitoring

Diperbarui: 7 Nov 2026. Tiga lapis, saling melengkapi.

## 1. Email ke admin (aktif)

`instrumentation.ts` memakai hook Next.js `onRequestError`: setiap error di
server (halaman, route API/cron, server action, proxy) mengirim email ringkas
ke semua **ADMIN berstatus ACTIVE** lewat Brevo yang sudah dipakai aplikasi.

- Isi: waktu, method + path, route, pesan error (maks. 500 karakter), digest.
  Header request (cookie, token) **tidak** disertakan.
- Anti-banjir: maksimal **1 email per jenis error per jam** (key
  `server-error:<digest|route+pesan>:<jam UTC>` di tabel `notification_events`).
- Kode: `lib/monitoring/error-alert.ts` (murni, dites `npm run test:alert`) dan
  `lib/monitoring/send-error-alert.ts`. Gagal kirim tidak menambah error baru.
- Error di browser (client) tidak lewat jalur ini; itu tugas Sentry.

## 2. Sentry (terpasang, menunggu DSN)

Paket `@sentry/nextjs` sudah terpasang dan menangkap error server
(`onRequestError`), error halaman (`app/error.tsx`), dan error root
(`app/global-error.tsx`). **Tidak mengirim apa pun sampai DSN diisi.**

Privasi (`lib/monitoring/sentry-options.ts`): hanya error, tanpa tracing; info
user, cookie, header, body, dan query URL tidak dikirim.

Cara mengaktifkan (pemilik project):
1. Buat akun/organisasi di https://sentry.io, buat project platform **Next.js**.
2. Salin **DSN** project (Settings > Client Keys).
3. Isi env di Vercel project `kasuat-task` (Production):
   `SENTRY_DSN` dan `NEXT_PUBLIC_SENTRY_DSN` (nilai sama), lalu redeploy.
   Lewat CLI: `vercel env add SENTRY_DSN production` dan
   `vercel env add NEXT_PUBLIC_SENTRY_DSN production`.
4. Uji: buka halaman yang error atau lihat event pertama di dashboard Sentry.

Belum diatur (opsional): upload source map (`withSentryConfig` +
`SENTRY_AUTH_TOKEN`) agar stack trace browser terbaca. Tanpa itu stack trace
browser masih berupa kode yang diperkecil.

## 3. Log Vercel

Log runtime lengkap ada di Vercel, tetapi plan Hobby hanya menyimpannya
**sangat singkat** (7 Nov 2026: rentang 30 menit bisa diambil, 1 jam ditolak
"outside the available retention"). Pakai untuk melacak error yang baru saja
terjadi, misalnya dari digest di email peringatan.

```bash
vercel logs --scope iantteaa-1814 --project kasuat-task -e production --since 30m
```

Atau Dashboard Vercel > kasuat-task > Logs.

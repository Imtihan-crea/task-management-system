<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Aturan Data Privat (WAJIB untuk repo ini)

Berlaku untuk semua agent, developer, commit, dokumentasi, test, dan balasan chat.

## Yang dianggap privat

- Isi `.env.local` dan env var Vercel: `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BREVO_API_KEY`, `CRON_SECRET`,
  serta password database / connection string.
- Access token, refresh token, `token_hash`, link recovery/undangan
  (link itu setara password — sekali pakai).
- Password user (termasuk password sementara yang diketik admin).
- Email pribadi, nomor telepon, dan data pribadi user.

## Aturan

1. **Jangan pernah** mencetak nilai secret ke chat, console log, issue,
   screenshot, atau komentar kode. Kalau perlu menyebut, tulis bentuk
   tersensor: `eyJ…[REDACTED]`, `sbp_…[REDACTED]`, `nama@contoh.com`.
2. **Jangan pernah** commit `.env.local` atau file berisi secret. `.gitignore`
   sudah mengecualikan `.env*` kecuali `.env.example`.
3. `.env.example`, README, dan docs hanya boleh berisi **placeholder**
   (`isi_...`, `contoh.com`, `[REDACTED]`), bukan nilai asli.
4. Test dan fixture memakai data palsu. Jangan menyalin token/email asli.
5. Sebelum commit, jalankan:
   ```bash
   npm run check:secrets
   ```
   Script ini memeriksa file yang ter-track git dan **gagal** kalau menemukan
   token, API key, connection string, private key, atau email non-placeholder.
   Pemeriksaan ini juga ikut di `npm run test:logic`.
6. Kalau sebuah secret terlanjur ter-commit atau terkirim:
   **rotasi dulu** (Supabase JWT secret / service role, Brevo API key,
   `CRON_SECRET`), baru bersihkan histori. Mengandalkan `git revert` saja
   tidak cukup karena nilainya sudah bocor.
7. Saat membuat laporan atau dokumentasi baru, sensor dulu data privat dan
   sebutkan nama variabelnya saja, bukan isinya.

Script pemeriksa: `scripts/check-secrets.mjs`.

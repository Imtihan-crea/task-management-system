import { defineConfig } from 'drizzle-kit'

/**
 * Konfigurasi Drizzle Kit.
 *
 * ⚠️ PENTING:
 * - `out` diarahkan ke `database/drizzle/` (TERPISA dari `database/migrations/`
 *   yang berisi riwayat 001–007 yang sudah jalan di production).
 * - Database pertama yang dijumpai = BASELINE skema saat ini.
 *   Jalankan ulang `npm run db:generate` tanpa mengubah schema
 *   → harusnya TIDAK menghasilkan diff (bukti tidak ada drift).
 * - JANGAN pernah menambah `dbCredentials` + `command: 'push'`.
 *   `push` bisa DROP kolom tanpa konfirmasi. Pakai `generate` + review SQL.
 * - Kredensial database tidak disimpan di repo. Kalau nanti perlu
 *   `migrate`/`pull`, isi lewat environment variable, bukan file ini.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './database/drizzle',
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
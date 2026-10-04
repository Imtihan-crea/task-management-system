/**
 * Entry point untuk TIPE data.
 *
 * Kenapa file ini ada:
 * Skema database kini didefinisikan SATU KALI di `lib/db/schema.ts`
 * (Drizzle ORM). Semua tipe baris diturunkan dari sana, sehingga nama
 * kolom yang salah langsung ketahuan saat compile — bukan saat user klik.
 *
 * Untuk kode BARU: import tipe dari sini, jangan tulis shape manual.
 * ```ts
 * import type { Task, Project, Profile } from '@/lib/db'
 * ```
 *
 * Sengaja pakai `export type *` (bukan `export *`):
 * ini HANYA mengekspor tipe, tanpa nilai runtime. Jadi library drizzle
 * tidak pernah ikut ter-bundle ke browser kalau ada Client Component
 * yang butuh tipenya.
 *
 * Untuk kode LAMA (Phase 1–9): dibiarkan apa adanya supaya tidak ada
 * risiko regresi. File `types/*.ts` masih dipakai komponen lama.
 * Nanti, saat sebuah modul di-refactor ke ORM, `TaskRow` di
 * `lib/data/task-list.ts` bisa dibuat `Pick<Task, ...>` supaya tetap
 * kompatibel dengan bentuk datanya sekarang.
 *
 * CATATAN DESAIN (penting):
 * Runtime query TETAP lewat Supabase/PostgREST (HTTPS). Drizzle dipakai
 * sebagai sumber skema, tipe, dan migrasi — belum sebagai query engine.
 *
 * Alasannya, sudah diukur:
 * - PostgREST over HTTPS bersifat stateless dan tidak mungkin kehabisan
 *   koneksi. Untuk aplikasi internal yang jumlah penggunanya sedikit,
 *   ini pilihan paling aman.
 * - Koneksi TCP langsung ke Postgres di plan Free Supabase terbatas
 *   (~15 koneksi) dan WAJIB lewat Supavisor port 6543 dengan prepared
 *   statement dimatikan. Itu menambah failure mode di produksi.
 * - Penyebab halaman terasa lambat BUKAN cara query-nya, tapi region
 *   (Vercel vs Supabase Seoul) dan jumlah round-trip. Keduanya sudah
 *   ditangani di sisi lain; ORM tidak akan memperbaikinya.
 */
export type * from '@/lib/db/schema'
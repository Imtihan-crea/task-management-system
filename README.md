# Task Management System — Phase 1 Foundation

Fondasi aplikasi: Login -> Dashboard sesuai role, database cloud Supabase, deploy Vercel.

## Stack
- Next.js 16 (App Router) + TypeScript
- Supabase Auth + PostgreSQL + RLS
- Vercel Hosting + GitHub

## 1. Jalankan local
```bash
npm install
cp .env.example .env.local
# isi .env.local dari Supabase Dashboard > Project Settings > API
npm run dev
```
Buka http://localhost:3000

Env yang dibutuhkan:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
`SUPABASE_SERVICE_ROLE_KEY` hanya untuk server, jangan dipakai di frontend.

## 2. Setup Supabase (sekali saja)
1. Buat project di https://supabase.com
2. Buka SQL Editor > New Query
3. Copy isi `database/migrations/001_create_profiles.sql` > Run
4. Buka Authentication > Users > Add user > buat 1 user ADMIN manual:
   - Email + password, centang Auto Confirm
   - Lalu di Table Editor > profiles > ubah role user itu jadi `ADMIN`, isi `full_name`
5. Test login di local dengan user itu.

## 3. Deploy ke Vercel
```bash
git init
git add .
git commit -m "phase 1 foundation"
# push ke GitHub, lalu di Vercel: Add New Project > Import repo
# isi Environment Variables sama seperti .env.local
```
Setiap push ke `main` = deploy production otomatis.

## Struktur singkat
```
app/login/ -> halaman login
app/dashboard/ -> halaman dashboard (protected)
proxy.ts -> jaga route, redirect login jika belum auth
lib/supabase/ -> client browser, server, proxy helper
types/profile.ts -> tipe Role
database/migrations/ -> SQL schema versi terkontrol
```

## Test acceptance
- Desktop Chrome: Login -> Dashboard -> Logout
- Mobile Chrome: sama
- Tanpa login buka /dashboard -> harus ke /login
- User inactive (`is_active=false`) -> login ditolak

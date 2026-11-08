# Review kebijakan RLS (9 Nov 2026)

Dibaca saja: `database/migrations/001`-`015`, `database/tests/rls.check.sql`, `lib/auth/*`, `lib/meetings/rules.ts`, guard halaman, dan `docs/rbac-matrix-hasil.md`. Tidak ada perubahan database dan tidak ada migrasi baru; SQL di bawah hanya usulan.

## Konteks yang menentukan bobot temuan

- Semua tulis ke tabel bisnis lewat service role (`createAdminClient`); `authenticated` dan `anon` dicabut INSERT/UPDATE/DELETE-nya (migrasi 003, 004, 006, 007, 008). Satu-satunya tulis lewat RLS: `profiles.full_name` milik sendiri (grant kolom).
- Hampir semua baca di aplikasi juga lewat service role dengan scope di kode. Baca lewat client user (RLS) hanya: profil sendiri, `activity_logs`, ringkasan notifikasi, dan beberapa query kecil di dashboard/profil.
- Karena itu RLS tidak menahan celah di kode (service role melewatinya), tetapi RLS **adalah** pertahanan satu-satunya terhadap pemanggilan langsung PostgREST: kunci anon ada di browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), sehingga setiap user ACTIVE bisa memakai JWT-nya sendiri untuk `GET /rest/v1/<tabel>` tanpa melewati aplikasi.

## Ringkasan per tabel

| Tabel | SELECT | Tulis | Dibanding aturan aplikasi |
|---|---|---|---|
| `profiles` | sendiri, atau admin aktif | UPDATE hanya kolom `full_name` baris sendiri | Sama. Non-admin tidak bisa baca profil orang lain, sebab itu aplikasi memakai service role untuk nama/email |
| `projects` | semua user ACTIVE (`using true`) | tidak ada | **Lebih longgar**: aplikasi membatasi TEAM_MEMBER ke project yang ia ikuti |
| `workstreams` | semua user ACTIVE | tidak ada | **Lebih longgar** (sama seperti projects) |
| `project_managers` | semua user ACTIVE | tidak ada | Longgar; relasi PM-project bukan rahasia berat, tetapi memetakan siapa memegang apa |
| `tasks` | semua user ACTIVE, `is_deleted = false` | tidak ada | **Jauh lebih longgar**: aplikasi hanya memperlihatkan TEAM_MEMBER task miliknya, PM task project miliknya atau yang di-assign |
| `task_suggestions` | pembuat, admin aktif, PM project itu | tidak ada | Sama dengan aplikasi |
| `notifications`, `notification_preferences` | `user_id = auth.uid()` | tidak ada | Sama |
| `notification_events` | tanpa policy | tidak ada | Aman (tertutup total untuk non-service) |
| `activity_logs` | sendiri, admin, PM project, assignee task, pembuat usulan, meeting yang dapat dibaca | tidak ada | Sama; sengaja dipakai sebagai satu-satunya filter halaman `/activity` |
| `meetings` + 4 tabel anak | `can_read_meeting(id, auth.uid())` | tidak ada | Sama dengan `getMeetingAccess`/`canViewMeeting` (admin, pembuat, organizer, peserta, PM project) |
| `app_migrations` | dicabut penuh | tidak ada | Aman |

Policy `Only active users` (restrictive, FOR ALL) ada di 14 tabel + `profiles` (profil sendiri tetap terbaca untuk INACTIVE/INVITED). Diuji `rls.check.sql` (ditolak untuk INACTIVE/INVITED, anon).

## Celah dan ketidakcocokan

1. **Tinggi: `tasks`, `projects`, `workstreams`, `project_managers` terbaca oleh semua user ACTIVE.** Seorang TEAM_MEMBER (atau VIEWER) bisa membaca seluruh task (judul, deskripsi, assignee, deadline, evidence) lewat PostgREST langsung, walau UI menyembunyikannya. Penting karena aturan akses yang dirumuskan (member hanya task sendiri) hanya ditegakkan di kode. Dari pencarian `createClient()` di `app/`, `lib/`, `components/`, tidak ada kode yang membaca tabel ini lewat client user, jadi pengetatan tidak mengubah perilaku aplikasi.
2. **Sedang: tidak ada tes RLS untuk scope per role.** `rls.check.sql` hanya menguji status (ACTIVE/INACTIVE/INVITED), anon, dan hak fungsi. Tidak ada tes "member A tidak melihat task member B", sehingga celah nomor 1 tidak terdeteksi.
3. **Rendah: fungsi `SECURITY DEFINER` dengan EXECUTE default ke PUBLIC.** `public.is_admin()` dan `public.count_active_admins(uuid)` (migrasi 001/002) tidak pernah di-`revoke`. `anon` bisa memanggil `count_active_admins` lewat `/rest/v1/rpc/...` dan mengetahui jumlah admin aktif. Hanya bocor jumlah, tetapi fungsi ini tidak dipakai kode aplikasi.
4. **Rendah: `can_read_meeting(p_meeting_id, p_user_id)` menerima `user_id` bebas** dan boleh dieksekusi `authenticated`. User bisa memeriksa apakah user lain bisa membaca meeting tertentu (butuh UUID meeting). Bocor kecil; dipakai policy dengan `auth.uid()` sehingga tidak berdampak ke baca data.
5. **Rendah: grant selain INSERT/UPDATE/DELETE tidak dicabut** (`TRUNCATE`, `REFERENCES`, `TRIGGER` default Supabase masih ada untuk `authenticated`). PostgREST tidak membuka `TRUNCATE`, jadi tidak bisa dieksploitasi lewat API; hanya relevan bila ada koneksi SQL langsung dengan role itu.
6. **Info: RLS lebih ketat dari aplikasi di tempat yang tidak berdampak.** `profiles` tertutup untuk non-admin (aplikasi memakai service role), `tasks` yang soft-deleted tidak terlihat client user (aplikasi memakai service role), assignee yang dipindah kehilangan log task lamanya. Tidak berdampak karena jalur terkait memakai service role. Bila kelak admin client dipindah ke client user (lihat `docs/review-admin-client.md`), tiga hal ini harus dipertimbangkan.
7. **Info: `INSERT`/`DELETE` pada `profiles` tidak dicabut dari `authenticated`** (migrasi 002 hanya mencabut UPDATE). Tetap ditolak karena tidak ada policy INSERT/DELETE; ini defense-in-depth yang kurang saja.
8. **Info: VIEWER.** Aplikasi membuka `tasks/[id]` dan daftar task untuk VIEWER (`tasks.view`), sedangkan RLS membuka semuanya untuk semua role. Selaras untuk VIEWER, tidak selaras untuk TEAM_MEMBER/PM (butir 1).

## Usulan SQL (belum dijalankan, butuh persetujuan pemilik)

Rancangan: ganti policy baca longgar dengan policy scoped. Uji dulu dalam transaksi yang di-rollback seperti `rls.check.sql`, dan tambahkan kasus per role ke tes itu. Ganti nama role/aturan VIEWER sesuai keputusan pemilik (butir 8 di `docs/rbac-matrix-hasil.md`).

```sql
-- helper: peran user aktif saat ini (security definer, cegah rekursi RLS)
create or replace function public.current_role_active()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'ACTIVE';
$$;
revoke all on function public.current_role_active() from public, anon;
grant execute on function public.current_role_active() to authenticated;

-- tasks: admin/viewer semua; PM project miliknya atau yang di-assign; member miliknya
drop policy if exists "Authenticated can view active tasks" on public.tasks;
create policy "Tasks readable by scope" on public.tasks for select to authenticated
using (
  is_deleted = false and (
    assignee_id = auth.uid()
    or public.current_role_active() in ('ADMIN', 'VIEWER')
    or exists (select 1 from public.project_managers pm
               where pm.project_id = tasks.project_id and pm.user_id = auth.uid())
  )
);

-- projects: member hanya project yang ia ikuti
drop policy if exists "Authenticated can view projects" on public.projects;
create policy "Projects readable by scope" on public.projects for select to authenticated
using (
  public.current_role_active() in ('ADMIN', 'VIEWER', 'PROJECT_MANAGER')
  or exists (select 1 from public.tasks t
             where t.project_id = projects.id and t.assignee_id = auth.uid() and t.is_deleted = false)
);
-- workstreams: ikut aturan project (subquery ke projects; policy projects berlaku untuk pemanggil)
drop policy if exists "Authenticated can view workstreams" on public.workstreams;
create policy "Workstreams readable by scope" on public.workstreams for select to authenticated
using (exists (select 1 from public.projects p where p.id = workstreams.project_id));

-- fungsi: cabut EXECUTE yang tidak perlu
revoke all on function public.count_active_admins(uuid) from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;  -- dipakai policy profiles
grant execute on function public.is_admin() to authenticated;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
```

Catatan: subquery `tasks` di policy `projects` memicu evaluasi RLS `tasks` (aman dari rekursi karena policy `tasks` tidak membaca `projects`); pantau performa pada tabel besar. Aplikasi saat ini tidak membaca keempat tabel itu lewat client user, jadi perubahan ini seharusnya tidak mengubah perilaku, tetapi tetap uji `npm run test:rls` dan satu putaran `npm run e2e:rbac` setelahnya.

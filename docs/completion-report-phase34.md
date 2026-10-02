# Completion Report — Phase 3 & 4 (Task + Project & Workstream Management)

Tanggal selesai: 2026-10-03
Production: `https://task-management-system-jatc.vercel.app`
Repo: `Imtihan-crea/task-management-system`, branch `main`

## 1. Ringkasan

Phase 3 (Task Management) dan Phase 4 (Project & Workstream Management)
dibangun dalam satu cycle sesuai PRD, di atas fondasi Phase 1 & 2 tanpa
rewrite. Semua Definition of Done PRD §54 terpenuhi dan diverifikasi di
production oleh owner.

## 2. Yang dibangun

### Database (additive, tanpa hapus data)

| Migration | Isi |
|---|---|
| `003_projects_workstreams_tasks.sql` | Tabel `projects`, `workstreams`, `tasks` + index + RLS |
| `004_multi_pm_and_evidence.sql` | Tabel relasi `project_managers`, kolom `tasks.evidence_url`, hapus kolom tunggal `projects.project_manager_id` setelah backfill |
| `005_human_readable_codes.sql` | Kolom `code`: project `001`, workstream `A` per project, task `T-01` + sequence + trigger + backfill |

### Aplikasi

- `/projects` — board + progress (done/total) + search/filter + create (Admin/PM)
- `/projects/[id]` — detail + workstream CRUD + task list + edit (Admin/PM pemilik)
- `/tasks` — list + search (kode prefix/nama) + filter + sort unfinished-first + My Tasks + overdue badge
- `/tasks/new`, `/tasks/[id]` — create, detail, edit, status, evidence, soft delete
- Dashboard — link Projects/Tasks/My Tasks + jumlah open task
- Email otomatis ke semua PM saat task → DONE (Brevo API, beserta link evidence)
- Permission matrix diperluas (`projects.*`, `tasks.*`, `tasks.submitEvidenceOwn`)
- `requireManager()` untuk operasi project/task

### Dokumen

- `docs/acceptance-test.md` §12, `docs/acceptance-report-phase34.md`
- `README.md` (struktur, env `BREVO_*`, troubleshooting)
- PRD diamendemen: rule assignee-ACTIVE, multi-PM, sort unfinished-first,
  evidence, pengecualian email DONE atas §5 Out of Scope

## 3. Catatan perubahan selama deployment (changelog)

### 3.1. Perubahan dari PRD awal (disetujui owner sebelum execute)

1. **Multi-PM (Opsi A).** PRD: satu `project_manager_id`. Diubah menjadi tabel
   relasi `project_managers`, kolom lama di-backfill lalu dihapus. Alasan:
   satu sumber kebenaran (pelajaran dari kasus `is_active` vs `status`).
2. **Scope baca.** PM boleh lihat project lain read-only; member hanya lihat
   project yang dia terlibat (punya task aktif). Formulanya dicatat di PRD §34.
3. **Default sort unfinished-first.** Task belum DONE selalu di atas, DONE
   paling bawah; sort eksplisit mengalahkan default.
4. **Submit evidence.** Kolom `evidence_url` opsional (link http/https),
   tetap bisa diubah setelah DONE (keputusan owner).
5. **Email DONE ke PM.** Pengecualian resmi atas §5 Out of Scope. Dikirim via
   Brevo API hanya saat transisi → DONE; gagal kirim tidak menggagalkan
   update status.
6. **Rule assignee harus ACTIVE.** Ditambah ke PRD §10.
7. **Readable IDs.** Project `001`, workstream `A` per project, task `T-01`;
   search mendukung prefix kode. Label "End Date" disamakan jadi "Deadline".

### 3.2. Keputusan teknis selama pengerjaan

- **RLS pola deny-write.** Tabel baru: SELECT untuk authenticated, tanpa policy
  tulis → semua tulis lewat service role + cek server. Diterima sebagai
  compliant §37 agar tidak over-engineering.
- **`lib/data/users.ts` vs `user-options.ts`.** Build gagal karena
  `server-only` bocor ke client component; tipe + label dipisah ke
  `user-options.ts`.
- **Token undangan & proxy.** Perbaikan sesi INVITED (jangan buang session
  saat accept invite) dan hash token via sessionStorage — dikerjakan di
  cycle ini, sudah live.
- **SMTP Brevo.** Kuota bawaan Supabase (2/jam) diganti Brevo (±30/jam);
  panduan di `docs/setup-email.md`. Email notifikasi aplikasi memakai
  Brevo **API** (`BREVO_API_KEY`), bukan SMTP key.
- **Auto-deploy Vercel sempat macet.** Penyebab: commit tidak memicu
  deployment walau Git connected. Solusi saat itu: redeploy manual +
  verifikasi tiap push. Perlu diawasi di phase berikutnya.

### 3.3. Insiden & perbaikan

| Insiden | Penyebab | Perbaikan |
|---|---|---|
| Invite link "expired" | `redirectTo` diabaikan Supabase (Redirect URLs kosong) + proxy membuang session INVITED | Daftarkan Redirect URLs; proxy tidak redirect di `/` dan `/accept-invite`; hash dititip via sessionStorage |
| Invite "unable" saat limit email | Kuota Supabase 2/jam | Fallback link manual + SMTP Brevo |
| Migration 005 gagal 3x | `num_to_letters(integer)` vs `row_number()` bigint; `chr(bigint)`; handler cuma tangkap 1 error | Cast eksplisit + tangkap `duplicate_object or duplicate_table` |
| Sequence kemakan saat test | Insert test memakai nomor | Cleanup + `setval` ulang |

## 4. Status akhir

- [x] Task CRUD, assignment (ACTIVE only), status, priority, deadline
- [x] Search (kode prefix/nama), filter, sort, My Tasks, overdue badge
- [x] Soft delete, completed tersimpan
- [x] Project CRUD (multi-PM), board, detail, progress otomatis
- [x] Workstream CRUD, relasi Project → Workstream → Task
- [x] Authorization server-side per role + scope, RLS aktif
- [x] Responsive desktop/tablet/mobile
- [x] Production deployment + smoke test + regression Phase 1/2
- [x] Secrets aman (service role & Brevo key hanya server)

Siap lanjut Phase 5 (Task Suggestion).

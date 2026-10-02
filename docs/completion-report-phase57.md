# Completion Report — Phase 5–7 (Suggestion, Notification, Dashboard)

Tanggal selesai: 2026-10-03
Production: `https://task-management-system-jatc.vercel.app`
Repo: `Imtihan-crea/task-management-system`, branch `main`

## 1. Ringkasan

Phase 5 (Task Suggestion), Phase 6 (Notification & Email), dan Phase 7
(Dashboard & Monitoring) dibangun dalam satu cycle di atas Phase 1–4 tanpa
rewrite. Semua Definition of Done PRD §63–65 terpenuhi dan diverifikasi di
production oleh owner.

## 2. Yang dibangun

### Database (additive)

| Migration | Isi |
|---|---|
| `006_suggestions_notifications.sql` | `task_suggestions` (kode `S-001` via sequence), `notifications`, `notification_events` (idempotency key), `notification_preferences` + RLS deny-write |

### Phase 5 — Suggestion

- `/task-suggestions` — list + search kode/nama + filter status + My Suggestions
- `/task-suggestions/new` — form (judul+deskripsi wajib, sisanya opsional)
- `/task-suggestions/[id]` — detail + review (approve/revise/reject) + resubmit
- Approve idempotent (guard status + cleanup task duplikat) → tepat satu task
- Entry point kontekstual: tombol di `/tasks` dan section Suggestions di
  project detail (project terisi otomatis); tidak ada di nav utama
- Reviewer pilih assignee langsung di form review (tidak perlu revisi
  hanya karena assignee kosong/nonaktif)

### Phase 6 — Notification

- `lib/notifications/service.ts` — satu-satunya pintu keluar notifikasi:
  klaim event key → tulis in-app → email per policy + preferensi
- Email DONE lama di-refactor lewat service ini (perilaku sama, tanpa duplikat)
- Event: assign, status change, DONE, suggestion lifecycle, convert,
  project assign/status; email untuk assign, DONE, BLOCKED, suggestion, PM baru
- `/notifications` — center + bell badge unread + preferensi (master + 3 kategori)
- Deadline DUE_TODAY/OVERDUE: dihitung live di dashboard (tanpa scheduler,
  sesuai larangan PRD) — scheduler resmi ditunda ke Phase 9

### Phase 7 — Dashboard

- Role-based: Admin KPI, PM scope miliknya, Member miliknya, Viewer read-only
- Status/priority summary, deadline monitoring, blocked, workload,
  pending suggestions, filter project/assignee/status/priority (Admin/PM)

### Dokumen

- `docs/acceptance-test.md` §13–15, README (routes, env, arsitektur notifikasi)

## 3. Catatan perubahan dari PRD (disetujui owner)

1. Suggestion keluar dari nav utama → entry per project + tombol di Tasks.
2. Approve boleh pilih assignee di form review (PRD minta revisi jika kosong).
3. Email ditambah untuk BLOCKED dan PROJECT_ASSIGNED (policy: Optional/tidak
   disebut → diputuskan dikirim).
4. Deadline monitoring dashboard-only; scheduler + email deadline ke Phase 9.
5. Visual/UI polish ditunda ke Phase 9 (satu paket, menghindari kerja ulang
   setelah Phase 8 menambah layar audit).

## 4. Insiden & perbaikan

| Insiden | Penyebab | Perbaikan |
|---|---|---|
| `setval value 0 out of bounds` | Sequence di tabel kosong | `greatest(...,1)` + flag `is_called` kondisional |
| `server-only` bocor ke client | Import tipe via file server | Pisah `user-options.ts` |
| `useActionState` type error | Signature action 1 argumen | Samakan signature `(prev, formData)` |
| Bell baris sendiri | Layout awal | Bell jadi prop Nav, sebaris menu |
| Push gagal 1x | DNS github.com putus sementara | Retry berhasil |

## 5. Status akhir

- [x] DoD Phase 5, 6, 7 (§63–65) — diverifikasi production oleh owner
- [x] Regression Phase 1–4 tidak rusak
- [x] Secrets server-side, RLS aktif, responsive

Siap lanjut Phase 8 (Activity Log & Audit).

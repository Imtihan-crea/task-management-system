# Acceptance Report — Phase 3 & 4 (Task + Project & Workstream)

Tanggal: 2026-10-02
Production: `https://task-management-system-jatc.vercel.app`
Tester: user (manual, desktop + mobile HP)

## Hasil

| # | Test | Status |
|---|---|---|
| 1 | Admin buat project + 2 PM | Lolos |
| 2 | PM buat workstream + task + assign + deadline | Lolos |
| 3 | Project detail: progress, workstream, task | Lolos |
| 4 | Member: hanya task miliknya, unfinished di atas | Lolos |
| 5 | Member DONE -> email ke PM + link evidence | Lolos |
| 6 | Submit evidence (link klik) | Lolos |
| 7 | Member buka task orang lain -> ditolak | Lolos |
| 8 | PM lihat project PM lain read-only | Lolos |
| 9 | PM edit project PM lain -> ditolak | Lolos |
| 10 | Viewer buka /tasks/new -> ditolak | Lolos |
| 11 | Hapus workstream berisi task -> ditolak | Lolos |
| 12 | Soft delete task | Lolos |
| 13 | Assign ke user INACTIVE -> ditolak | Lolos |
| 14 | Mobile layout projects/tasks | Lolos |

## Perubahan dari PRD awal (disetujui owner)

- Multi-PM via tabel `project_managers` (kolom tunggal dihapus)
- Scope baca: PM read-only project lain, member hanya project yang dia terlibat
- Default sort unfinished-first
- `evidence_url` opsional per task
- Email DONE ke PM via Brevo API (amendemen §5 Out of Scope)
- Rule: assignee harus ACTIVE

## Catatan

- Migration 004 menghapus kolom `projects.project_manager_id` setelah backfill.
  Urutan aman: deploy kode baru dulu, baru run migration.
- Email gagal kirim tidak menggagalkan update status (log saja).
- Link undangan sekali pakai; hapus user uji via Authentication > Users.

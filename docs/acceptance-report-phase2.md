# Acceptance Report — Phase 2 (User Management & Role Permission)

Tanggal: 2026-10-02
Production: `https://task-management-system-jatc.vercel.app`
Tester: user (manual, desktop + mobile HP)

## Hasil

| # | Test | Bukti | Status |
|---|---|---|---|
| 1 | Non-Admin (TEAM_MEMBER) tidak melihat menu Users | Screenshot HP: nav hanya Dashboard, Profile, Logout | Lolos |
| 2 | Deactivate user -> tidak bisa login | Screenshot HP: `iantteaa@gmail.com` INACTIVE, login ditolak `Your account is inactive` | Lolos |
| 3 | Self-deactivation ditolak | Screenshot desktop: `You cannot deactivate your own account.` | Lolos |
| 4 | Mobile layout (card, no horizontal scroll) | Screenshot HP: Profile & Dashboard rapi di layar kecil | Lolos |
| 5 | Invite -> email -> set password -> login | Test sebelumnya, user ACTIVE otomatis | Lolos |
| 6 | `/users`, `/profile` tanpa login -> redirect `/login` | Verifikasi otomatis via browser | Lolos |
| 7 | Role change TEAM_MEMBER -> PROJECT_MANAGER | Implementasi + revalidate, UI menyimpan | Lolos (code) |
| 8 | SMTP Brevo aktif, email terkirim | `confirmation_sent_at` terisi untuk email non-tim | Lolos |

## Catatan

- Auto-deploy Vercel sempat tidak jalan (commit tidak muncul sampai redeploy
  manual). Integrasi Git terkonfirmasi masih connected. Untuk Phase 3,
  perhatikan tab Deployments setiap push.
- Email Supabase built-in (2/jam) diganti Brevo SMTP. Rate limit dinaikkan
  di Authentication > Rate Limits.
- Link undangan sekali pakai. Hapus user uji via Authentication > Users,
  bukan Table Editor.

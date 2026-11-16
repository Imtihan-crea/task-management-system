import type { Permission } from '@/lib/auth/permissions'

/** Label izin untuk tab Wewenang (hanya izin yang bisa diatur per akun). */
export const PERMISSION_GROUPS: { title: string; items: { permission: Permission; label: string }[] }[] = [
  {
    title: 'User',
    items: [
      { permission: 'users.view', label: 'Lihat daftar user' },
      { permission: 'users.invite', label: 'Undang / buat user' },
      { permission: 'users.edit', label: 'Ubah user dan buat link reset password' },
      { permission: 'users.changeRole', label: 'Ubah role user' },
      { permission: 'users.activate', label: 'Aktifkan user' },
      { permission: 'users.deactivate', label: 'Nonaktifkan user' },
    ],
  },
  {
    title: 'Project dan Workstream',
    items: [
      { permission: 'projects.create', label: 'Buat project' },
      { permission: 'projects.edit', label: 'Ubah project dan PM-nya' },
      { permission: 'workstreams.create', label: 'Buat workstream' },
      { permission: 'workstreams.edit', label: 'Ubah workstream' },
      { permission: 'workstreams.delete', label: 'Hapus workstream' },
    ],
  },
  {
    title: 'Task dan Usulan',
    items: [
      { permission: 'tasks.create', label: 'Buat dan import task' },
      { permission: 'tasks.edit', label: 'Ubah semua task (termasuk status)' },
      { permission: 'tasks.cancel', label: 'Batalkan task' },
      { permission: 'tasks.delete', label: 'Hapus task' },
      { permission: 'suggestions.review', label: 'Setujui / tolak usulan task' },
    ],
  },
  {
    title: 'Meeting',
    items: [{ permission: 'meetings.edit', label: 'Kelola meeting (ubah, selesai/batal, peserta)' }],
  },
  {
    title: 'HR dan Daily Tracker',
    items: [
      { permission: 'hr.view', label: 'Lihat tracker dan rekap jam semua karyawan' },
      { permission: 'hr.manage', label: 'Kelola data HR (profil karyawan, kalender libur, target jam, pengaturan)' },
      { permission: 'tracker.review', label: 'Lihat dan komentari tracker anggota project' },
      { permission: 'reference.manage', label: 'Kelola Master Reference (tambah, ubah, arsip, kukuhkan usulan)' },
    ],
  },
]

export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.permission, i.label]))
)

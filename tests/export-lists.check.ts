/**
 * Uji lib/export/task-columns.ts — kolom export Tasks dan konversi tanggal WIB.
 * Jalankan: npm run test:export-lists
 */
import { statusLabel, taskColumns, wibDate, type ExportTaskRow } from '../lib/export/task-columns'

let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) !== JSON.stringify(harap)) {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const row: ExportTaskRow = {
  code: 'T-01', title: 'Judul', project: 'P', workstream: 'W', assignee: 'A', status: 'IN PROGRESS', priority: 'HIGH',
  start_date: '2026-11-01', deadline: '2026-11-19', completed_at: null, created_at: '2026-11-18T18:00:00Z',
}

cek('status label', statusLabel('IN_PROGRESS'), 'IN PROGRESS')
// 18:00 UTC = 01:00 WIB esok harinya
cek('wibDate lewat tengah malam', wibDate('2026-11-18T18:00:00Z')?.toISOString().slice(0, 10), '2026-11-19')
cek('wibDate null', wibDate(null), null)
cek('kolom dengan project', taskColumns({ withProject: true }).map((c) => c.header), ['Kode', 'Judul', 'Project', 'Workstream', 'PIC', 'Status', 'Prioritas', 'Mulai', 'Deadline', 'Selesai', 'Dibuat'])
cek('kolom tanpa project', taskColumns({ withProject: false }).some((c) => c.header === 'Project'), false)
cek('nilai selesai kosong', taskColumns({ withProject: true }).find((c) => c.header === 'Selesai')?.value(row), null)
cek('nilai dibuat WIB', (taskColumns({ withProject: true }).find((c) => c.header === 'Dibuat')?.value(row) as Date).toISOString().slice(0, 10), '2026-11-19')

if (gagal) { console.log(`${gagal} gagal`); process.exit(1) }
console.log('export-lists: semua lulus')

/**
 * Uji boundary untuk lib/meetings/rules.ts — bagian ATURAN, tanpa database.
 * Jalankan: npm run test:rules
 */
import { scopeFilter, matchesMeetingTab } from '../lib/meetings/rules'
import type { MeetingTabKey } from '../types/meeting'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) {
    ok++
  } else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const U = 'user-a'
const M1 = 'meeting-1'
const M2 = 'meeting-2'
const P1 = 'project-1'
const P2 = 'project-2'
const ZERO = '00000000-0000-0000-0000-000000000000'

/* ---------- scopeFilter: filtering = lapisan keamanan ---------- */

// ADMIN: tanpa pembatasan.
cek(
  'ADMIN -> null (tanpa filter)',
  scopeFilter({ userId: U, role: 'ADMIN', managedProjectIds: null, involvedMeetingIds: [] }),
  null
)

// PM dengan 2 project + 2 meeting. Hasilnya ISI parameter `or`.
cek(
  'PM -> gabung project + meeting',
  scopeFilter({
    userId: U,
    role: 'PROJECT_MANAGER',
    managedProjectIds: [P1, P2],
    involvedMeetingIds: [M1, M2],
  }),
  `project_id.in.(${P1},${P2}),id.in.(${M1},${M2})`
)

// TEAM_MEMBER: hanya meeting yang melibatkan dia.
cek(
  'TEAM_MEMBER -> hanya meeting involve',
  scopeFilter({
    userId: U,
    role: 'TEAM_MEMBER',
    managedProjectIds: [],
    involvedMeetingIds: [M1, M2],
  }),
  `id.in.(${M1},${M2})`
)

// Kasus BAHAYA: tanpa akses -> hasil kosong, BUKAN semua data.
cek(
  'TEAM_MEMBER tanpa akses -> 0 baris',
  scopeFilter({ userId: U, role: 'TEAM_MEMBER', managedProjectIds: [], involvedMeetingIds: [] }),
  `id.eq.${ZERO}`
)

// PM tanpa project tapi punya meeting -> tetap boleh melihat meeting itu.
cek(
  'PM tanpa project tapi punya meeting',
  scopeFilter({
    userId: U,
    role: 'PROJECT_MANAGER',
    managedProjectIds: [],
    involvedMeetingIds: [M1],
  }),
  `id.in.(${M1})`
)

// VIEWER tanpa akses -> kosong juga (bukan berarti lihat semua).
cek(
  'VIEWER tanpa akses -> 0 baris',
  scopeFilter({ userId: U, role: 'VIEWER', managedProjectIds: [], involvedMeetingIds: [] }),
  `id.eq.${ZERO}`
)

// Tidak boleh ada yang keluar dengan wrapper or=( (itu causes or=(or=(...))).
const semua = [
  scopeFilter({
    userId: U,
    role: 'PROJECT_MANAGER',
    managedProjectIds: [P1],
    involvedMeetingIds: [M1],
  }),
  scopeFilter({ userId: U, role: 'TEAM_MEMBER', managedProjectIds: [], involvedMeetingIds: [] }),
  scopeFilter({
    userId: U,
    role: 'PROJECT_MANAGER',
    managedProjectIds: [P1],
    involvedMeetingIds: [],
  }),
]
cek('tidak ada yang dibungkus or=(', semua.every((s) => !String(s).startsWith('or=(')), true)
cek('tidak ada yang null selain ADMIN', semua.every((s) => s !== null), true)

/* ---------- matchesMeetingTab ---------- */

// "sekarang" = 2026-10-05 05:30 WIB (UTC 2026-10-04T22:30Z)
const now = new Date('2026-10-04T22:30:00Z')

const base = {
  status: 'SCHEDULED',
  meeting_date: '2026-10-05',
  start_time: '09:00',
  notes: null as string | null,
}
const tab = (k: MeetingTabKey, r = base) => matchesMeetingTab(r, k, now)

cek('all selalu true', tab('all'), true)
cek('upcoming: hari ini 09:00 (sekarang 05:30)', tab('upcoming'), true)
cek('upcoming: jam 04:00 sudah lewat', tab('upcoming', { ...base, start_time: '04:00' }), false)
cek('upcoming: CANCELLED tidak', tab('upcoming', { ...base, status: 'CANCELLED' }), false)
cek('upcoming: besok ya', tab('upcoming', { ...base, meeting_date: '2026-10-06' }), true)
cek('upcoming: kemarin tidak', tab('upcoming', { ...base, meeting_date: '2026-10-04' }), false)
cek('today: tanggal lokal sama', tab('today'), true)
cek('today: besok tidak', tab('today', { ...base, meeting_date: '2026-10-06' }), false)
cek('completed: belum COMPLETED', tab('completed'), false)
cek('completed: sudah COMPLETED', tab('completed', { ...base, status: 'COMPLETED' }), true)
cek('needs_notes: belum COMPLETED', tab('needs_notes'), false)
cek('needs_notes: COMPLETED + notes null', tab('needs_notes', { ...base, status: 'COMPLETED' }), true)
cek(
  'needs_notes: COMPLETED + notes terisi',
  tab('needs_notes', { ...base, status: 'COMPLETED', notes: 'Catatan' }),
  false
)
cek(
  'needs_notes: COMPLETED + notes spasi',
  tab('needs_notes', { ...base, status: 'COMPLETED', notes: '   ' }),
  true
)
cek(
  'needs_notes: COMPLETED + notes newline',
  tab('needs_notes', { ...base, status: 'COMPLETED', notes: '\n\n' }),
  true
)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
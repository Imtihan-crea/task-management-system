/**
 * Uji boundary lib/meetings/digest-body.ts — body Morning Digest.
 * Jalankan: npm run test:digest
 */
import { buildDigestBody } from '../lib/meetings/digest-body'

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

const meeting = {
  id: 'm1',
  code: 'M-010',
  title: 'Daily Standup',
  start_time: '09:00',
  projectLabel: '001 · Yoora Sarah',
}
const dueTask = {
  id: 't1',
  code: 'T-05',
  title: 'Packing batch 2',
  deadline: '2026-10-06',
  projectLabel: '001 · Yoora Sarah',
  overdue: false,
}
const overdueTask = { ...dueTask, id: 't2', code: 'T-03', deadline: '2026-10-01', overdue: true }

/* ---------- lengkap ---------- */
const base = {
  userName: 'Imtihan',
  dateLabel: '06 Okt 2026',
  baseUrl: 'https://app',
}

const full = buildDigestBody({
  ...base,
  meetings: [meeting],
  tasksDue: [dueTask],
  tasksOverdue: [overdueTask],
})
cek('sapa user + tanggal', full.includes('Imtihan') && full.includes('06 Okt 2026'), true)
cek('meeting + jam', full.includes('M-010') && full.includes('09:00'), true)
cek('overdue ditandai', full.includes('OVERDUE'), true)
cek('due hari ini ditandai', full.includes('Due hari ini'), true)
cek('overdue di atas due (urgent dulu)', full.indexOf('T-03') < full.indexOf('T-05'), true)

/* ---------- hanya meeting ---------- */
const onlyMeeting = buildDigestBody({
  ...base,
  meetings: [meeting],
  tasksDue: [],
  tasksOverdue: [],
})
cek('section meeting ada', onlyMeeting.includes('Meeting Hari Ini (1)'), true)
cek('section task tidak ada', !onlyMeeting.includes('Task Perhatian'), true)

/* ---------- hanya task ---------- */
const onlyTask = buildDigestBody({
  ...base,
  meetings: [],
  tasksDue: [dueTask],
  tasksOverdue: [],
})
cek('section task ada', onlyTask.includes('Task Perhatian (1)'), true)
cek('section meeting tidak ada', !onlyTask.includes('Meeting Hari Ini'), true)

/* ---------- XSS ---------- */
const evil = buildDigestBody({
  ...base,
  userName: '<script>x</script>',
  meetings: [{ ...meeting, title: '<b>?</b>' }],
  tasksDue: [],
  tasksOverdue: [],
})
cek('nama + judul ter-escape', evil.includes('&lt;script&gt;') && evil.includes('&lt;b&gt;'), true)
cek('tidak ada markup jahat', !evil.includes('<script>') && !evil.includes('<b>?'), true)

/* ---------- link ---------- */
cek('judul meeting jadi link', full.includes('<a href="https://app/meetings/m1">'), true)
cek('judul task jadi link', full.includes('<a href="https://app/tasks/t1">'), true)
const noBase = buildDigestBody({
  ...base,
  baseUrl: '',
  meetings: [meeting],
  tasksDue: [],
  tasksOverdue: [],
})
cek('tanpa baseUrl = tanpa link tapi tetap informatif', !noBase.includes('<a href') && noBase.includes('Daily Standup'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
/**
 * Uji boundary lib/meetings/completion-email.ts — body email hasil meeting.
 * Jalankan: npm run test:email
 */
import {
  buildCompletionEmailBody,
  escapeHtml,
  NOTES_EMAIL_LIMIT,
  type CompletionSummary,
} from '../lib/meetings/completion-email'

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

const base: CompletionSummary = {
  code: 'M-003',
  title: 'Weekly Project Review',
  projectLabel: '001 · Yoora Sarah',
  meetingUrl: 'https://app/meetings/abc',
  notes: 'Warehouse layout approved.',
  decisions: [{ decision: 'Layout approved', rationale: 'Vendor ready' }],
  actionItems: [
    {
      title: 'Update layout',
      assigneeName: 'Imtihan',
      deadline: '2026-10-10',
      status: 'OPEN',
      taskCode: null,
    },
  ],
  openActionItems: 1,
}

/* ---------- escapeHtml ---------- */
cek('escape <>&"', escapeHtml('<b>"A" & B</b>'), '&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;')
cek('escape null', escapeHtml(null), '')
cek('teks biasa utuh', escapeHtml('Halo 123'), 'Halo 123')

/* ---------- isi lengkap ---------- */
const full = buildCompletionEmailBody(base)
cek('memuat judul + code', full.includes('M-003') && full.includes('Weekly Project Review'), true)
cek('memuat notes', full.includes('Warehouse layout approved.'), true)
cek('memuat decision + rationale', full.includes('Layout approved') && full.includes('Vendor ready'), true)
cek('memuat action item + assignee + deadline', full.includes('Update layout') && full.includes('Imtihan') && full.includes('2026-10-10'), true)
cek('action belum ada task', full.includes('Task: Not created'), true)
cek('open count di header', full.includes('Action Items (1 · 1 open)'), true)
cek('memuat link meeting', full.includes('https://app/meetings/abc'), true)

/* ---------- task code kalau sudah dibuat ---------- */
const withTask = buildCompletionEmailBody({
  ...base,
  actionItems: [{ ...base.actionItems[0], status: 'DONE', taskCode: 'T-081' }],
  openActionItems: 0,
})
cek('task code tampil', withTask.includes('Task: T-081'), true)
cek('tanpa embel open saat 0', withTask.includes('Action Items (1)</h3>'), true)

/* ---------- kosong semua ---------- */
const empty = buildCompletionEmailBody({
  ...base,
  notes: null,
  decisions: [],
  actionItems: [],
  openActionItems: 0,
})
cek('notes kosong eksplisit', empty.includes('Belum ada notes.'), true)
cek('decisions kosong eksplisit', empty.includes('Tidak ada decision yang dicatat.'), true)
cek('actions kosong eksplisit', empty.includes('Tidak ada action item.'), true)
cek('tidak ada header yatim', !empty.includes('(0 ·'), true)

/* ---------- notes spasi dianggap kosong ---------- */
const blank = buildCompletionEmailBody({ ...base, notes: '   \n  ' })
cek('notes spasi = belum ada', blank.includes('Belum ada notes.'), true)

/* ---------- XSS: input user tidak boleh jadi markup ---------- */
const evil = buildCompletionEmailBody({
  ...base,
  title: '<script>alert(1)</script>',
  notes: '<img src=x onerror=alert(1)>',
  decisions: [{ decision: '<b>bold?</b>', rationale: null }],
  actionItems: [],
  openActionItems: 0,
})
cek('script ter-escape', !evil.includes('<script>') && evil.includes('&lt;script&gt;'), true)
cek('img ter-escape', evil.includes('&lt;img'), true)
cek('bold ter-escape', evil.includes('&lt;b&gt;'), true)

/* ---------- notes panjang dipotong ---------- */
const long = 'A'.repeat(NOTES_EMAIL_LIMIT + 100)
const cut = buildCompletionEmailBody({ ...base, notes: long })
cek('ada penanda potong', cut.includes('dipotong'), true)
cek('panjang dibatasi', cut.length < long.length + 5000, true)
const exact = buildCompletionEmailBody({ ...base, notes: 'B'.repeat(NOTES_EMAIL_LIMIT) })
cek('pas batas tidak dipotong', !exact.includes('dipotong'), true)

/* ---------- null-safety ---------- */
const nulls = buildCompletionEmailBody({
  ...base,
  notes: null,
  decisions: [{ decision: 'X', rationale: null }],
  actionItems: [
    { title: 'Y', assigneeName: null, deadline: null, status: 'OPEN', taskCode: null },
  ],
  openActionItems: 1,
})
cek('tanpa assignee/deadline tidak crash', nulls.includes('Status: OPEN'), true)
cek('tanpa crash ada assignee line?', !nulls.includes('Assignee:'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
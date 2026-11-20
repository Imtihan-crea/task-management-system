// Uji klik nyata Review PM + Alih Task (20 Nov 2026): consultant submit -> Menunggu
// Review PM, PM kembalikan/setujui; consultant ajukan alih sementara (durasi Master
// Reference) -> PM setujui -> assignee pindah -> PM kembalikan; alih dari cuti; akses ?cuti.
// Data berawalan "UJI-E2E", dibersihkan runCleanup. Server WAJIB tanpa BREVO (guard).
import { guard, serviceClient, loadPlaywright, loginPassword, makeUser, runCleanup, writeOut, day, BASE, PREFIX as P } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const until = async (fn, ms = 15000) => {
  for (let t = 0; t < ms; t += 250) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)) }
  return false
}
const seen = (loc) => loc.first().waitFor({ timeout: 10000 }).then(() => true, () => false)
const task = async (id) => (await db.from('tasks').select('status, completed_at, assignee_id').eq('id', id).single()).data
const transfer = async (taskId) => (await db.from('task_transfers').select('id, status, to_user_id, kind, starts_at, ends_at, leave_request_id').eq('task_id', taskId).order('created_at', { ascending: false }).limit(1)).data?.[0]
const rnd = () => Math.random().toString(36).slice(2, 7).toUpperCase()

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
const errors = []
try {
  await runCleanup(db)
  const pm = await makeUser(db, 'pm', 'PROJECT_MANAGER', `${P} PM`)
  const mem = await makeUser(db, 'member', 'TEAM_MEMBER', `${P} Consultant`)
  const mem2 = await makeUser(db, 'member2', 'TEAM_MEMBER', `${P} Pengganti`)
  const { data: prj } = await db.from('projects').insert({ name: `${P} Project Alih`, status: 'ACTIVE', start_date: day(-5), end_date: day(60) }).select('id').single()
  await db.rpc('set_project_managers', { p_project_id: prj.id, p_user_ids: [pm.id] })
  const mkTask = async (title, deadline = day(7)) => (await db.from('tasks').insert({
    code: `T-UJI-${rnd()}`, title: `${P} ${title}`, project_id: prj.id, assignee_id: mem.id, created_by: pm.id, priority: 'MEDIUM', status: 'IN_PROGRESS', deadline,
  }).select('id').single()).data.id
  const T1 = await mkTask('Review')
  const T2 = await mkTask('Alih manual')
  const T3 = await mkTask('Alih cuti', day(1))
  const T4 = await mkTask('Sesudah cuti', day(30))

  const ctx = async (u) => {
    const c = await browser.newContext()
    const p = await c.newPage()
    p.on('dialog', (d) => d.accept())
    p.on('pageerror', (e) => errors.push(`${u.email} ${String(e).slice(0, 120)}`))
    await loginPassword(p, u)
    return p
  }
  const m = await ctx(mem)
  const pmp = await ctx(pm)

  // 1. Review PM
  await m.goto(`${BASE}/tasks/${T1}`, { waitUntil: 'networkidle' })
  check('consultant: tombol "Submit sebagai Done" tidak ada', (await m.getByRole('button', { name: 'Submit sebagai Done' }).count()) === 0)
  await m.getByRole('button', { name: 'Submit untuk Review PM' }).click()
  const r1 = await until(async () => { const t = await task(T1); return t.status === 'REVIEW' && t.completed_at && t })
  check('submit consultant -> REVIEW + completed_at', r1)
  await m.goto(`${BASE}/tasks/${T1}`, { waitUntil: 'networkidle' })
  check('consultant: dropdown status hilang saat menunggu review', (await m.locator('#status_change').count()) === 0)
  check('consultant: badge MENUNGGU REVIEW PM', await seen(m.getByText('MENUNGGU REVIEW PM')))

  await pmp.goto(`${BASE}/tasks/${T1}`, { waitUntil: 'networkidle' })
  await pmp.locator(`#review_note_${T1}`).fill(`${P} lengkapi lampiran`)
  await pmp.getByRole('button', { name: 'Kembalikan ke Consultant' }).click()
  check('PM kembalikan -> IN_PROGRESS + completed_at kosong', await until(async () => { const t = await task(T1); return t.status === 'IN_PROGRESS' && !t.completed_at }))
  // Riwayat ditulis sesudah status berubah: tunggu.
  const act = await until(async () => (await db.from('activity_logs').select('metadata').eq('entity_id', T1).eq('action', 'TASK_STATUS_CHANGED')).data?.find((r) => r.metadata?.note))
  check('catatan PM tersimpan di riwayat', act?.metadata?.note === `${P} lengkapi lampiran`, JSON.stringify(act?.metadata ?? null))

  await m.goto(`${BASE}/tasks/${T1}`, { waitUntil: 'networkidle' })
  await m.getByRole('button', { name: 'Submit untuk Review PM' }).click()
  const r2 = await until(async () => { const t = await task(T1); return t.status === 'REVIEW' && t })
  await pmp.goto(`${BASE}/tasks/${T1}`, { waitUntil: 'networkidle' })
  await pmp.getByRole('button', { name: 'Setujui (Done)' }).click()
  check('PM setujui -> DONE, tanggal submit consultant tetap', await until(async () => { const t = await task(T1); return t.status === 'DONE' && r2 && t.completed_at === r2.completed_at }))

  // 2. Alih task sementara (pengajuan consultant, durasi dari Master Reference)
  await m.goto(`${BASE}/tasks/${T2}`, { waitUntil: 'networkidle' })
  await m.getByText('Ajukan alih task').click()
  await m.selectOption('#transfer_to', mem2.id)
  const opts = await m.locator('#transfer_duration option').allTextContents()
  check('pilihan durasi dari Master Reference tampil', opts.includes('1 hari') && opts.includes('3 bulan'), opts.join('|'))
  await m.selectOption('#transfer_duration', { label: '1 hari' })
  const s = await m.inputValue('#transfer_start'); const e = await m.inputValue('#transfer_end')
  check('durasi mengisi waktu selesai = mulai + 1 hari', s && e && new Date(e + ':00+07:00') - new Date(s + ':00+07:00') === 86400000, `${s} -> ${e}`)
  await m.getByRole('button', { name: 'Ajukan ke PM' }).click()
  const tr = await until(async () => { const t = await transfer(T2); return t?.status === 'PENDING' && t })
  check('pengajuan tersimpan PENDING ke pengganti', tr && tr.to_user_id === mem2.id && tr.kind === 'TEMPORARY')

  await pmp.goto(`${BASE}/tasks/alih`, { waitUntil: 'networkidle' })
  check('PM: bagian "Menunggu keputusan Anda" tampil', await seen(pmp.getByRole('heading', { name: /Menunggu keputusan Anda/ })))
  await pmp.getByRole('button', { name: 'Setujui', exact: true }).first().click()
  check('PM setujui -> ACTIVE, assignee pindah ke pengganti', await until(async () => { const t = await transfer(T2); const k = await task(T2); return t.status === 'ACTIVE' && k.assignee_id === mem2.id }))
  await pmp.goto(`${BASE}/tasks/${T2}`, { waitUntil: 'networkidle' })
  await pmp.getByRole('button', { name: /^Kembalikan ke / }).click()
  check('PM kembalikan -> DONE, assignee kembali', await until(async () => { const t = await transfer(T2); const k = await task(T2); return t.status === 'DONE' && k.assignee_id === mem.id }))

  // 3. Alih dari cuti (cuti mulai hari ini: waktu mulai = sekarang)
  const { data: leave } = await db.from('leave_requests').insert({ user_id: mem.id, kind: 'SAKIT', start_date: day(0), end_date: day(1), days: 2, status: 'APPROVED', reason: `${P} sakit` }).select('id').single()
  await m.goto(`${BASE}/tasks/alih?cuti=${leave.id}`, { waitUntil: 'networkidle' })
  check('dari cuti: keterangan cuti tampil', await seen(m.getByText(/Task dengan deadline sampai hari terakhir cuti/)))
  check('dari cuti: task deadline di masa cuti tercentang', await m.locator(`input[name="task_id"][value="${T3}"]`).isChecked())
  check('dari cuti: task sesudah cuti tidak tercentang', !(await m.locator(`input[name="task_id"][value="${T4}"]`).isChecked()))
  await m.selectOption('#transfer_to', mem2.id)
  await m.getByRole('button', { name: 'Ajukan ke PM' }).click()
  const tl = await until(async () => { const t = await transfer(T3); return t?.status === 'PENDING' && t })
  check('dari cuti: pengajuan PENDING + tertaut cuti (mulai hari ini tidak ditolak)', tl && tl.leave_request_id === leave.id)
  check('dari cuti: task sesudah cuti tidak ikut', !(await transfer(T4)))
  const m2 = await ctx(mem2)
  await m2.goto(`${BASE}/tasks/alih?cuti=${leave.id}`, { waitUntil: 'networkidle' })
  check('akses ?cuti: orang lain tidak melihat data cuti', (await m2.getByText(/Task dengan deadline sampai hari terakhir cuti/).count()) === 0)
  await pmp.goto(`${BASE}/tasks/alih`, { waitUntil: 'networkidle' })
  await pmp.getByPlaceholder('Catatan untuk pengaju (opsional)').fill(`${P} cari pengganti lain`)
  await pmp.getByRole('button', { name: 'Tolak', exact: true }).first().click()
  check('PM tolak -> REJECTED, task tetap pada consultant', await until(async () => { const t = await transfer(T3); const k = await task(T3); return t.status === 'REJECTED' && k.assignee_id === mem.id }))

  // 4. Penjadwal: tanpa token ditolak
  const res = await fetch(`${BASE}/api/cron/alih-task`)
  check('cron alih-task tanpa token -> 401', res.status === 401, res.status)
  check('tidak ada error halaman', errors.length === 0, errors.join(' | '))
} catch (err) {
  check('skrip selesai tanpa exception', false, err.stack ?? err)
} finally {
  await browser.close()
  cleanupResult = await runCleanup(db)
}
const failed = results.filter((r) => !r.ok)
writeOut('review-alih', { results, cleanup: cleanupResult })
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${r.name}${r.ok || !r.info ? '' : ' :: ' + r.info}`)
console.log(`\n${results.length - failed.length}/${results.length} lulus · cleanup ${cleanupResult?.ok ? 'bersih' : 'SISA ' + JSON.stringify(cleanupResult?.left)}`)
process.exit(failed.length || !cleanupResult?.ok ? 1 : 0)

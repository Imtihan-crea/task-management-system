// Uji C20 + C14 (page-level). Semua data berawalan "UJI-E2E"; server WAJIB tanpa
// BREVO (guard di lib.mjs). Pembersihan selalu jalan di finally.
//
// C20: Team Member tidak boleh membatalkan task, juga lewat server action langsung.
//  (a) tombol "Batalkan Task" tidak ada di detail task bagi member;
//  (b) request server action asli DIREKAM saat PM mengklik "Batalkan Task" (header
//      Next-Action + body multipart), lalu diputar ulang dengan cookie member untuk
//      task lain (id diganti). Dipilih rekam-ulang karena id action berubah tiap build
//      dan format body internal Next tidak perlu ditebak.
//  (c) PM project memang bisa membatalkan (sekaligus sumber rekaman).
// C14: task deadline kemarin (WIB) muncul di /tasks?view=overdue, deadline hari ini tidak.
import {
  guard, serviceClient, loadPlaywright, loginAdmin, loginPassword, makeUser,
  runCleanup, writeOut, BASE, PREFIX as P, day,
} from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const MSG = 'Hanya PM project atau Admin yang dapat membatalkan task.'
const status = async (id) => (await db.from('tasks').select('status').eq('id', id).single()).data?.status

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
try {
  const ctxPage = async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('dialog', (d) => d.accept())
    return { context, page }
  }
  const pm = await makeUser(db, 'pm', 'PROJECT_MANAGER', `${P} PM`)
  const mem = await makeUser(db, 'member', 'TEAM_MEMBER', `${P} Member`)
  const { data: proj, error: pe } = await db.from('projects').insert({ name: `${P} Project C20`, status: 'ACTIVE', start_date: day(-5), end_date: day(30) }).select('id').single()
  if (pe) throw new Error('project: ' + pe.message)
  const { error: me } = await db.rpc('set_project_managers', { p_project_id: proj.id, p_user_ids: [pm.id] })
  if (me) throw new Error('pm: ' + me.message)
  const mk = async (title, deadline) => {
    const { data, error } = await db.from('tasks').insert({
      title: `${P} ${title}`, project_id: proj.id, assignee_id: mem.id, created_by: pm.id,
      priority: 'MEDIUM', status: 'TODO', deadline,
    }).select('id').single()
    if (error) throw new Error(title + ': ' + error.message)
    return data.id
  }
  const tPm = await mk('C20 dibatalkan PM', day(7))
  const tMem = await mk('C20 target member', day(7))
  const tLate = await mk('C14 kemarin', day(-1))
  const tToday = await mk('C14 hari ini', day(0))

  // (c) PM membatalkan + rekam request server action
  const pmS = await ctxPage()
  await loginPassword(pmS.page, pm)
  await pmS.page.goto(`${BASE}/tasks/${tPm}`, { waitUntil: 'networkidle' })
  const reqP = pmS.page.waitForRequest((r) => r.method() === 'POST' && !!r.headers()['next-action'], { timeout: 20000 })
  await pmS.page.getByRole('button', { name: 'Batalkan Task' }).click()
  const rec = await reqP
  await pmS.page.waitForTimeout(2500)
  check('C20c PM project bisa membatalkan task', (await status(tPm)) === 'CANCELLED', await status(tPm))

  // (a) member: tombol tidak ada
  const memS = await ctxPage()
  await loginPassword(memS.page, mem)
  await memS.page.goto(`${BASE}/tasks/${tMem}`, { waitUntil: 'networkidle' })
  check('C20a halaman detail terbuka untuk member', (await memS.page.locator('h1').allInnerTexts()).join(' ').includes(P))
  check('C20a tombol "Batalkan Task" tidak tampil untuk member', (await memS.page.getByRole('button', { name: 'Batalkan Task' }).count()) === 0)

  // (b) putar ulang server action dengan cookie member untuk tMem
  const h = rec.headers()
  const body = (rec.postData() ?? '').split(tPm).join(tMem)
  check('C20b rekaman request memuat id task (bisa diganti)', body.includes(tMem) && !body.includes(tPm))
  const res = await memS.context.request.post(rec.url(), {
    headers: { 'next-action': h['next-action'], 'content-type': h['content-type'], accept: h.accept ?? 'text/x-component' },
    data: body,
  })
  const text = await res.text()
  check('C20b server action ditolak dengan pesan izin', text.includes(MSG), `HTTP ${res.status()}`)
  check('C20b status task di DB tidak berubah (TODO)', (await status(tMem)) === 'TODO', await status(tMem))

  // C14: halaman overdue
  const adm = await ctxPage()
  await loginAdmin(db, adm.page)
  await adm.page.goto(`${BASE}/tasks?view=overdue&q=${encodeURIComponent(P)}&project=${proj.id}`, { waitUntil: 'networkidle' })
  const main = await adm.page.locator('main').innerText()
  check('C14 deadline kemarin (WIB) muncul di tab Overdue', main.includes(`${P} C14 kemarin`))
  check('C14 deadline hari ini (WIB) tidak muncul di tab Overdue', !main.includes(`${P} C14 hari ini`))
  void tLate; void tToday
} catch (e) {
  check('EXC', false, e.message)
} finally {
  await browser.close()
  cleanupResult = await runCleanup(db)
}

writeOut('c20-cancel-result.json', { results, cleanup: cleanupResult.lines })
const failed = results.filter((r) => !r.ok)
console.log(`cek: ${results.length - failed.length}/${results.length} lulus`)
for (const r of failed) console.log(`  GAGAL ${r.name}: ${r.info}`)
console.log('pembersihan: ' + cleanupResult.lines.at(-1))
process.exit(failed.length === 0 && cleanupResult.ok ? 0 : 1)

// Uji klik alur yang menulis data. Semua data berawalan "UJI-E2E"; server
// lokal WAJIB dijalankan tanpa BREVO (guard di lib.mjs). Pembersihan selalu
// jalan di finally. Rahasia tidak pernah dicetak.
import {
  guard, serviceClient, loadPlaywright, loginAdmin, loginPassword, makeUser as makeTempUser,
  runCleanup, writeOut, BASE, PREFIX as P, day,
} from './lib.mjs'

await guard()
const db = serviceClient()
const ids = {}
const results = []
const errors = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 160) })
const makeUser = (key, role, name) => makeTempUser(db, key, role, name)

const browser = await loadPlaywright().chromium.launch({ headless: true })
async function ctx(label) {
  const c = await browser.newContext()
  const page = await c.newPage()
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => errors.push(`${label} ${page.url().replace(BASE, '')}: ${String(e).slice(0, 100)}`))
  return page
}
const go = (page, path) => page.goto(BASE + path, { waitUntil: 'networkidle' })
async function clickAndSettle(page, locator) {
  await locator.click()
  await page.waitForTimeout(2500)
  await page.waitForLoadState('networkidle')
}
async function statusText(form) {
  return (await form.locator('[role="status"],[role="alert"]').allInnerTexts().catch(() => [])).join(' | ')
}
async function step(name, fn) {
  try { await fn() } catch (e) { check(name, false, 'EXC ' + e.message) }
}

let cleanupResult
try {
const pm = await makeUser('pm', 'PROJECT_MANAGER', `${P} PM`)
const mem = await makeUser('member', 'TEAM_MEMBER', `${P} Member`)
const admin = await ctx('admin')
await loginAdmin(db, admin)

// S1 project
await step('S1 buat project', async () => {
  await go(admin, '/projects/new')
  const f = admin.locator('form:has(select[name="project_manager_ids"])')
  await f.locator('input[name="name"]').fill(`${P} Project`)
  await f.locator('input[name="client"]').fill('UJI').catch(() => {})
  await f.locator('select[name="project_manager_ids"]').selectOption([pm.id])
  await f.locator('input[name="start_date"]').fill(day(0))
  await f.locator('input[name="end_date"]').fill(day(30))
  await f.locator('select[name="status"]').selectOption('ACTIVE').catch(() => {})
  await clickAndSettle(admin, f.locator('button[type="submit"]'))
  const { data } = await db.from('projects').select('id, status').eq('name', `${P} Project`).maybeSingle()
  ids.project = data?.id
  const { data: pmLink } = await db.from('project_managers').select('user_id').eq('project_id', data?.id)
  check('S1 project tersimpan + PM terpasang', data && pmLink?.some((l) => l.user_id === pm.id), await statusText(f))
})

// S2 workstream
await step('S2 buat workstream', async () => {
  await go(admin, `/workstreams/new?project=${ids.project}`)
  const f = admin.locator('form:has(input[name="name"])').first()
  await f.locator('input[name="name"]').fill(`${P} WS`)
  await clickAndSettle(admin, f.locator('button[type="submit"]'))
  const { data } = await db.from('workstreams').select('id').eq('project_id', ids.project).eq('name', `${P} WS`).maybeSingle()
  ids.workstream = data?.id
  check('S2 workstream tersimpan', data, await statusText(f))
})

async function createTask(title, assigneeId) {
  await go(admin, '/tasks/new')
  const f = admin.locator('form:has(#task_title)')
  await f.locator('#task_title').fill(title)
  await f.locator('select[name="project_id"]').selectOption(ids.project)
  await f.locator('select[name="assignee_id"]').selectOption(assigneeId)
  await f.locator('input[name="deadline"]').fill(day(7))
  await clickAndSettle(admin, f.locator('button[type="submit"]'))
  const { data } = await db.from('tasks').select('id, status').eq('project_id', ids.project).eq('title', title).maybeSingle()
  return { data, msg: await statusText(f) }
}

// S3 task A + notifikasi
await step('S3 buat task A', async () => {
  const { data, msg } = await createTask(`${P} Task A`, mem.id)
  ids.taskA = data?.id
  const { data: n } = await db.from('notifications').select('type').eq('user_id', mem.id).eq('entity_id', data?.id)
  check('S3 task A tersimpan', data, msg)
  check('S3 member dapat TASK_ASSIGNED', n?.some((x) => x.type === 'TASK_ASSIGNED'))
})

// S4 submit DONE, S5 edit judul task DONE tetap DONE (A1)
await step('S4/S5 submit done lalu edit', async () => {
  await go(admin, `/tasks/${ids.taskA}`)
  await clickAndSettle(admin, admin.getByRole('button', { name: 'Submit sebagai Done' }))
  const { data: d1 } = await db.from('tasks').select('status, completed_at').eq('id', ids.taskA).single()
  check('S4 task A DONE + completed_at', d1.status === 'DONE' && d1.completed_at, d1.status)
  await go(admin, `/tasks/${ids.taskA}`)
  const f = admin.locator('form:has(#task_title)')
  await f.locator('#task_title').fill(`${P} Task A (ubah judul)`)
  await clickAndSettle(admin, f.locator('button[type="submit"]'))
  const { data: d2 } = await db.from('tasks').select('status, completed_at, title').eq('id', ids.taskA).single()
  check('S5 (A1) edit judul task DONE: tetap DONE', d2.status === 'DONE' && d2.completed_at === d1.completed_at && d2.title.endsWith('(ubah judul)'), `${d2.status} ${await statusText(f)}`)
})

await step('S6 buat task B', async () => {
  const { data, msg } = await createTask(`${P} Task B`, mem.id)
  ids.taskB = data?.id
  check('S6 task B tersimpan', data, msg)
})

// S7 member ubah status
const member = await ctx('member')
await step('S7 member ubah status task B', async () => {
  await loginPassword(member, mem)
  await go(member, `/tasks/${ids.taskB}`)
  const f = member.locator('form:has(select[name="status"]):has(button:has-text("Perbarui"))')
  await f.locator('select[name="status"]').selectOption('IN_PROGRESS')
  await clickAndSettle(member, f.locator('button[type="submit"]'))
  const { data } = await db.from('tasks').select('status').eq('id', ids.taskB).single()
  check('S7 member: task B IN_PROGRESS', data.status === 'IN_PROGRESS', await statusText(f))
  const res = await member.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
  check('S7 member tidak bisa buka /users', !member.url().includes('/users') || res.status() === 404, member.url().replace(BASE, ''))
})

// S8 member buat suggestion
await step('S8 member buat suggestion', async () => {
  await go(member, `/task-suggestions/new?project=${ids.project}`)
  const f = member.locator('form:has(textarea[name="description"]):has(input[name="title"])')
  await f.locator('select[name="project_id"]').selectOption(ids.project).catch(() => {})
  await f.locator('input[name="title"]').fill(`${P} Usulan`)
  await f.locator('textarea[name="description"]').fill('Usulan uji AFK')
  await f.locator('select[name="suggested_assignee_id"]').selectOption(mem.id).catch(() => {})
  await clickAndSettle(member, f.locator('button[type="submit"]'))
  const { data } = await db.from('task_suggestions').select('id, status').eq('project_id', ids.project).eq('title', `${P} Usulan`).maybeSingle()
  ids.suggestion = data?.id
  const { data: n } = await db.from('notifications').select('type').eq('user_id', pm.id).eq('entity_id', data?.id)
  check('S8 suggestion PENDING tersimpan', data?.status === 'PENDING', await statusText(f))
  check('S8 PM dapat notifikasi suggestion', n?.some((x) => x.type === 'SUGGESTION_CREATED'))
})

// S9 PM approve, ganti assignee ke PM, isi deadline + catatan (A9, B8, B10)
const pmPage = await ctx('pm')
await step('S9 PM approve suggestion', async () => {
  await loginPassword(pmPage, pm)
  await go(pmPage, `/task-suggestions/${ids.suggestion}`)
  const f = pmPage.locator('form:has(textarea[name="review_note"])')
  await f.locator('select[name="assignee_id"]').selectOption(pm.id)
  await f.locator('input[name="deadline"]').fill(day(10))
  await f.locator('select[name="priority"]').selectOption('HIGH')
  await f.locator('textarea[name="review_note"]').fill('Catatan approve uji')
  await clickAndSettle(pmPage, f.getByRole('button', { name: 'Setujui' }))
  const { data: s } = await db.from('task_suggestions').select('status, converted_task_id, review_note').eq('id', ids.suggestion).single()
  ids.taskFromSuggestion = s.converted_task_id
  const { data: t } = await db.from('tasks').select('assignee_id, deadline, priority, source_type, source_id').eq('id', s.converted_task_id).maybeSingle()
  // Notifikasi TASK_ASSIGNED ditulis di akhir action (setelah event review),
  // jadi tunggu sampai 10 detik sebelum menyimpulkan tidak ada.
  let nPm = []
  for (let i = 0; i < 20; i++) {
    nPm = (await db.from('notifications').select('type').eq('user_id', pm.id).eq('entity_id', s.converted_task_id)).data ?? []
    if (nPm.some((x) => x.type === 'TASK_ASSIGNED')) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const { data: nMem } = await db.from('notifications').select('type').eq('user_id', mem.id).eq('entity_id', s.converted_task_id)
  check('S9 suggestion CONVERTED + catatan tersimpan', s.status === 'CONVERTED' && s.review_note === 'Catatan approve uji', `${s.status} ${await statusText(f)}`)
  check('S9 (B8) task: assignee PM, deadline, HIGH', t && t.assignee_id === pm.id && t.deadline === day(10) && t.priority === 'HIGH', JSON.stringify(t))
  check('S9 (B10) task punya source SUGGESTION', t?.source_type === 'SUGGESTION' && t?.source_id === ids.suggestion)
  check('S9 (A9) PM dapat TASK_ASSIGNED', nPm?.some((x) => x.type === 'TASK_ASSIGNED'))
  check('S9 (A9) member usulan tidak dapat TASK_ASSIGNED', !nMem?.some((x) => x.type === 'TASK_ASSIGNED'))
})

// S10 meeting DRAFT tanpa undangan (B6)
await step('S10 PM buat meeting', async () => {
  await go(pmPage, `/meetings/new?project=${ids.project}`)
  const f = pmPage.locator('form:has(input[name="meeting_date"])')
  await f.locator('input[name="title"]').fill(`${P} Meeting`)
  await f.locator('select[name="project_id"]').selectOption(ids.project).catch(() => {})
  await f.locator('input[name="meeting_date"]').fill(day(1))
  await f.locator('input[name="start_time"]').fill('10:00')
  await f.locator('input[name="end_time"]').fill('11:00')
  await f.locator(`input[name="participant_ids"][value="${mem.id}"]`).check()
  await clickAndSettle(pmPage, f.locator('button[type="submit"]'))
  const { data } = await db.from('meetings').select('id, status').eq('title', `${P} Meeting`).maybeSingle()
  ids.meeting = data?.id
  const { data: n } = await db.from('notifications').select('type').eq('user_id', mem.id).eq('entity_id', data?.id)
  check('S10 meeting DRAFT tersimpan', data?.status === 'DRAFT', await statusText(f))
  check('S10 (B6) DRAFT: member belum diundang', !n?.some((x) => x.type === 'MEETING_INVITATION'))
})

await step('S11 jadwalkan meeting', async () => {
  await go(pmPage, `/meetings/${ids.meeting}`)
  await clickAndSettle(pmPage, pmPage.getByRole('button', { name: 'Jadwalkan Meeting' }))
  const { data } = await db.from('meetings').select('status').eq('id', ids.meeting).single()
  const { data: n } = await db.from('notifications').select('type').eq('user_id', mem.id).eq('entity_id', ids.meeting)
  check('S11 meeting SCHEDULED', data.status === 'SCHEDULED', data.status)
  check('S11 (B6) member dapat MEETING_INVITATION', n?.some((x) => x.type === 'MEETING_INVITATION'))
})

await step('S12 action item -> task', async () => {
  await go(pmPage, `/meetings/${ids.meeting}?tab=actions`)
  const cf = pmPage.locator('form:has(button:has-text("Tambah Action Item"))')
  await cf.locator('input[name="title"]').fill(`${P} Action Item`)
  await cf.locator('select[name="assignee_id"]').selectOption(mem.id).catch(() => {})
  await cf.locator('input[name="deadline"]').fill(day(5)).catch(() => {})
  await clickAndSettle(pmPage, cf.locator('button[type="submit"]'))
  const { data: ai } = await db.from('meeting_action_items').select('id').eq('meeting_id', ids.meeting).eq('title', `${P} Action Item`).maybeSingle()
  ids.actionItem = ai?.id
  check('S12 action item tersimpan', ai, await statusText(cf))
  await go(pmPage, `/meetings/${ids.meeting}?tab=actions`)
  const tf = pmPage.locator('form:has(input[name="action_item_id"])').first()
  await clickAndSettle(pmPage, tf.getByRole('button', { name: 'Buat Task' }))
  const { data: a2 } = await db.from('meeting_action_items').select('task_id').eq('id', ai?.id).single()
  ids.taskFromMeeting = a2.task_id
  const { data: t } = await db.from('tasks').select('assignee_id, deadline, source_type').eq('id', a2.task_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  check('S12 (B11) task dari action item: assignee+deadline+source', t && t.assignee_id === mem.id && t.deadline === day(5) && t.source_type === 'MEETING', JSON.stringify(t) + ' ' + (await statusText(tf)))
})

await step('S13 selesaikan meeting', async () => {
  await go(pmPage, `/meetings/${ids.meeting}`)
  await clickAndSettle(pmPage, pmPage.getByRole('button', { name: 'Selesaikan Meeting' }))
  const { data } = await db.from('meetings').select('status').eq('id', ids.meeting).single()
  check('S13 meeting COMPLETED', data.status === 'COMPLETED', data.status)
})

await step('S14 admin nonaktifkan member', async () => {
  await go(admin, `/users/${mem.id}`)
  const f = admin.locator('form:has(button:has-text("Nonaktifkan"))').first()
  await clickAndSettle(admin, f.getByRole('button', { name: 'Nonaktifkan' }))
  const { data } = await db.from('profiles').select('status').eq('id', mem.id).single()
  const msg = await statusText(admin.locator('main'))
  check('S14 member INACTIVE', data.status === 'INACTIVE', data.status)
  check('S14 (B13) peringatan task terbuka tampil', /task/i.test(msg), msg)
})

} finally {
  await browser.close()
  cleanupResult = await runCleanup(db)
}

writeOut('write-flow-result.json', { results, errors, cleanup: cleanupResult.lines })
const failed = results.filter((r) => !r.ok)
console.log(`cek: ${results.length - failed.length}/${results.length} lulus, error halaman: ${errors.length}`)
for (const r of failed) console.log(`  GAGAL ${r.name}: ${r.info}`)
console.log('pembersihan: ' + cleanupResult.lines.at(-1))
process.exit(failed.length === 0 && cleanupResult.ok ? 0 : 1)

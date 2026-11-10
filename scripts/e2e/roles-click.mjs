// Uji KLIK NYATA per role: tiap aksi utama harus jalan untuk role yang berhak
// (DB berubah, bukan hanya pesan sukses) dan tertutup untuk role yang tidak berhak
// (tombol/form tidak tampil, halaman 404/redirect, DAN server action yang diputar
// ulang dengan cookie role itu ditolak tanpa mengubah DB; pola C20b di c20-cancel.mjs).
// Semua data berawalan "UJI-E2E"; server WAJIB tanpa BREVO (guard di lib.mjs).
// Tidak ada klik yang mengirim email ke alamat sungguhan atau membuat link undangan/reset
// (form "Undang User" dan "Link reset/undangan" sengaja tidak disentuh). Rahasia tidak dicetak.
//
// MATRIKS HARAPAN (A = berhak, D = tidak berhak). Diturunkan dari lib/auth/permissions.ts,
// task-access.ts, project-access.ts, meetings/rules.ts, app/actions/*, docs/rbac-matrix-hasil.md,
// docs/audit-ui-rbac.md (A2, B1, B6, B8, B13, B14, C20 final).
// Kolom: ADM = admin, PM = PM project uji, PMX = PM lain (bukan PM project uji),
// MEM = Team Member assignee (punya task di project uji, peserta meeting uji),
// MEMX = Team Member lain (bukan assignee), VWR = Viewer (peserta meeting uji).
//
//  aksi                          ADM PM PMX MEM MEMX VWR   dasar
//  task.buat (project uji)        A   A   D   D   D    D    tasks.create + PM hanya project miliknya
//  task.ubah (form penuh)         A   A   D   D   D    D    ADMIN / PM pengelola (canFullEdit)
//  task.status                    A   A   D   A   D    D    canActOnTask (assignee boleh)
//  task.submit + evidence         A   A   D   A   D    D    canActOnTask + tasks.submitEvidenceOwn
//  task.batal                     A   A   D   D   D    D    canCancelTask (C20: assignee tidak boleh)
//  task.hapus                     A   A   D   D   D    D    ADMIN / PM pengelola
//  proj.buat                      A   A   A   D   D    D    projects.create (PM mana pun)
//  proj.ubah (settings + PM)      A   A   D   D   D    D    ADMIN / PM project itu
//  ws.buat / ws.ubah / ws.hapus   A   A   D   D   D    D    canManageProjectFor
//  sug.buat                       A   A   D   A   D    D    canSuggestForProject (assignee ikut project)
//  sug.approve/revisi/tolak       A   A   D   D   D    D    suggestions.review + scope project
//  mtg.buat (project uji)         A   A   D   A   D    D    meetings.create + assertCanCreateInProject
//  mtg.jadwal/selesai/batal       A   A   D   D   D    D    canManageMeetingFull (TM peserta & VWR tidak)
//  mtg.agenda/keputusan/action    A   A   D   A   D    D    canManageMeetingContent (TM peserta boleh)
//  mtg.ai->task                   A   A   D   D   D    D    canCreateTaskFromMeeting (TM tak punya tasks.create)
//  mtg.+peserta / mtg.-peserta    A   A   D   D   D    D    canManageMeetingFull
//  user.buat/ubah/status          A   D   D   D   D    D    requireAdmin
//  profil.nama, notif.dibaca, notif.pref   A A A A A A       semua role (milik sendiri)
//
// Pelonggaran yang disengaja (lihat juga laporan): (1) console "Failed to load resource"
// diabaikan karena muncul dari navigasi 404/redirect yang memang diuji; (2) PM lain (PMX)
// dianggap "berhak" hanya untuk proj.buat karena membuat project baru bukan hak per-project.
import crypto from 'node:crypto'
import {
  guard, serviceClient, loadPlaywright, loginAdmin, loginPassword, makeUser, ensureAdmin,
  runCleanup, writeOut, BASE, PREFIX as P, day,
} from './lib.mjs'

await guard()
const db = serviceClient()

const ROLES = ['ADM', 'PM', 'PMX', 'MEM', 'MEMX', 'VWR']
const EXP = {
  'task.buat': 'AADDDD', 'task.ubah': 'AADDDD', 'task.status': 'AADADD', 'task.submit': 'AADADD',
  'task.batal': 'AADDDD', 'task.hapus': 'AADDDD',
  'proj.buat': 'AAADDD', 'proj.ubah': 'AADDDD', 'ws.buat': 'AADDDD', 'ws.ubah': 'AADDDD', 'ws.hapus': 'AADDDD',
  'sug.buat': 'AADADD', 'sug.approve': 'AADDDD', 'sug.revisi': 'AADDDD', 'sug.tolak': 'AADDDD',
  'mtg.buat': 'AADADD', 'mtg.jadwal': 'AADDDD', 'mtg.agenda': 'AADADD', 'mtg.keputusan': 'AADADD',
  'mtg.action': 'AADADD', 'mtg.ai-task': 'AADDDD', 'mtg.+peserta': 'AADDDD', 'mtg.-peserta': 'AADDDD',
  'mtg.selesai': 'AADDDD', 'mtg.batal': 'AADDDD',
  'user.buat': 'ADDDDD', 'user.ubah': 'ADDDDD', 'user.status': 'ADDDDD',
  'profil.nama': 'AAAAAA', 'notif.dibaca': 'AAAAAA', 'notif.pref': 'AAAAAA',
}
const isA = (action, role) => EXP[action][ROLES.indexOf(role)] === 'A'

const results = []
const errs = Object.fromEntries(ROLES.map((r) => [r, []]))
const check = (role, action, name, ok, info = '') => results.push({ role, action, expect: isA(action, role) ? 'A' : 'D', name, ok: Boolean(ok), info: String(info ?? '').replace(/\s+/g, ' ').slice(0, 220) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase()

/** Ulangi fn sampai mengembalikan nilai truthy (hasil baca DB) atau waktu habis. */
async function until(fn, ms = 12000) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v || Date.now() - t0 > ms) return v
    await sleep(400)
  }
}
const one = async (p, label) => {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}
const get = (table, id, cols = '*') => db.from(table).select(cols).eq('id', id).maybeSingle().then((r) => r.data)
const count = async (table, build) => (await build(db.from(table).select('id', { count: 'exact', head: true }))).count ?? 0

/* ---------- browser ---------- */
let browser
const recs = {}
async function session(role, user) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => errs[role].push(`pageerror ${page.url().replace(BASE, '')}: ${String(e).slice(0, 120)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs[role].push(`console ${page.url().replace(BASE, '')}: ${m.text().slice(0, 120)}`)
  })
  if (role === 'ADM') await loginAdmin(db, page)
  else await loginPassword(page, user)
  return { context, page }
}
const settle = (page) => page.waitForLoadState('networkidle').catch(() => {})
async function go(page, path) {
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' })
  return res
}
const is404 = (res) => res?.status() === 404
const msgOf = async (scope) => (await scope.locator('[role="status"],[role="alert"]').allInnerTexts().catch(() => [])).join(' | ')

/** Klik tombol; tangkap request server action (untuk diputar ulang oleh role lain). */
async function press(page, locator, key, meta = {}) {
  const reqP = page.waitForRequest((r) => r.method() === 'POST' && !!r.headers()['next-action'], { timeout: 15000 }).catch(() => null)
  await locator.click()
  const req = await reqP
  await settle(page)
  if (key && req && !recs[key]) {
    const h = req.headers()
    recs[key] = { url: req.url(), headers: { 'next-action': h['next-action'], 'content-type': h['content-type'], accept: h.accept ?? 'text/x-component' }, body: req.postData() ?? '', meta }
  }
  return req
}

const DENY_RE = /tidak punya izin|Hanya PM project|tidak punya akses|Hanya Admin|Anda tidak/i
/** Putar ulang server action rekaman dengan cookie role ini; verify() membaca DB. */
async function denyReplay(role, page, action, key, swaps, verify) {
  const rec = recs[key]
  if (!rec) return check(role, action, `replay ${key}`, false, 'rekaman tidak ada (salah skrip / klik berhak gagal)')
  let body = rec.body
  for (const [a, b] of swaps) {
    if (!a || !body.includes(a)) return check(role, action, `replay ${key}`, false, 'rekaman tidak memuat nilai yang diganti (salah skrip)')
    body = body.split(a).join(b)
  }
  const res = await page.context().request.post(rec.url, { headers: rec.headers, data: body, maxRedirects: 0 })
  const text = await res.text().catch(() => '')
  const loc = res.headers()['x-action-redirect'] || res.headers().location || ''
  const denied = DENY_RE.test(text) || /denied|login|dashboard/.test(loc) || [303, 307, 308].includes(res.status())
  check(role, action, `replay ${key} ditolak server`, denied, `HTTP ${res.status()} ${loc || text.slice(0, 90)}`)
  const [ok, info] = await verify()
  check(role, action, `replay ${key}: DB tidak berubah`, ok, info)
}

/** Untuk role tak berhak: 404 / redirect / semua tombol tidak tampil. */
async function blocked(role, action, name, page, res, prefix, controls) {
  if (is404(res)) return check(role, action, name, true, 'halaman 404')
  if (!page.url().startsWith(BASE + prefix)) return check(role, action, name, true, 'redirect ' + page.url().replace(BASE, ''))
  let shown = 0
  for (const c of controls) shown += await c(page).count()
  check(role, action, name, shown === 0, shown === 0 ? 'halaman terbuka, kontrol tidak tampil' : `kontrol TAMPIL (${shown})`)
}
const btn = (name, exact = true) => (page) => page.getByRole('button', { name, exact })
const sel = (css) => (page) => page.locator(css)

/* ---------- data uji ---------- */
const users = {}
const fx = {}
const ids = {}
let cleanupResult
let extraLeft = {}
const T0 = new Date()
try {
  // Lantai bersih: sisa run yang terputus dibersihkan dulu (hanya awalan UJI-E2E).
  await runCleanup(db)
  const adm = await ensureAdmin(db)
  users.ADM = adm
  users.PM = await makeUser(db, 'pm', 'PROJECT_MANAGER', `${P} PM`)
  users.PMX = await makeUser(db, 'pmx', 'PROJECT_MANAGER', `${P} PM Lain`)
  users.MEM = await makeUser(db, 'member', 'TEAM_MEMBER', `${P} Member`)
  users.MEMX = await makeUser(db, 'memx', 'TEAM_MEMBER', `${P} Member Lain`)
  users.VWR = await makeUser(db, 'viewer', 'VIEWER', `${P} Viewer`)
  const tgt = await makeUser(db, 'target', 'TEAM_MEMBER', `${P} Target`)
  const vic = await makeUser(db, 'victim', 'TEAM_MEMBER', `${P} Korban`)
  const pm = users.PM, mem = users.MEM

  const mkProject = async (name, status = 'ACTIVE') => {
    const id = (await one(db.from('projects').insert({ name: `${P} ${name}`, status, start_date: day(-5), end_date: day(60) }).select('id').single(), name)).id
    await one(db.rpc('set_project_managers', { p_project_id: id, p_user_ids: [pm.id] }), 'pm ' + name)
    return id
  }
  const PRJ = await mkProject('Project Uji')
  const PA = await mkProject('Project Edit ADM')
  const PB = await mkProject('Project Edit PM')
  const PV = await mkProject('Project Korban')
  const mkTask = async (title, extra = {}) => (await one(db.from('tasks').insert({
    code: `T-UJI-${rnd()}`, title: `${P} ${title}`, project_id: PRJ, assignee_id: mem.id, created_by: pm.id,
    priority: 'MEDIUM', status: 'TODO', deadline: day(7), ...extra,
  }).select('id').single(), title)).id
  const mkWs = async (name) => (await one(db.from('workstreams').insert({ project_id: PRJ, name: `${P} ${name}` }).select('id').single(), name)).id
  const mkSug = async (title) => (await one(db.from('task_suggestions').insert({
    project_id: PRJ, title: `${P} ${title}`, description: 'usulan uji klik', suggested_by: mem.id, suggested_assignee_id: mem.id, suggested_priority: 'MEDIUM',
  }).select('id').single(), title)).id
  const mkMeeting = async (title, status, parts = [mem.id]) => {
    const id = (await one(db.from('meetings').insert({
      title: `${P} ${title}`, project_id: PRJ, meeting_type: 'INTERNAL_MEETING', status, meeting_date: day(3), start_time: '09:00', end_time: '10:00',
      organizer_id: adm.id, created_by: adm.id,
    }).select('id').single(), title)).id
    await one(db.from('meeting_participants').insert([{ meeting_id: id, user_id: adm.id, is_organizer: true }, ...parts.map((u) => ({ meeting_id: id, user_id: u, is_organizer: false }))]), 'peserta ' + title)
    return id
  }
  const mkAi = async (meetingId, title) => (await one(db.from('meeting_action_items').insert({
    meeting_id: meetingId, title: `${P} ${title}`, assignee_id: mem.id, deadline: day(5), priority: 'MEDIUM', created_by: adm.id,
  }).select('id').single(), title)).id

  // Korban (target replay dan pemeriksaan tombol role tak berhak)
  ids.vTask = await mkTask('Korban task')
  ids.vWs = await mkWs('WS korban')
  for (const k of ['approve', 'revise', 'reject']) ids['vSug_' + k] = await mkSug('Usulan korban ' + k)
  ids.vMtg = await mkMeeting('Meeting korban konten', 'SCHEDULED', [mem.id, users.VWR.id])
  ids.vMtgDraft = await mkMeeting('Meeting korban draft', 'DRAFT', [mem.id, users.VWR.id])
  ids.vMtgDone = await mkMeeting('Meeting korban selesai', 'SCHEDULED', [mem.id, users.VWR.id])
  ids.vMtgCancel = await mkMeeting('Meeting korban batal', 'SCHEDULED', [mem.id, users.VWR.id])
  ids.vAi = await mkAi(ids.vMtg, 'AI korban')
  ids.vPart = (await db.from('meeting_participants').select('id').eq('meeting_id', ids.vMtg).eq('user_id', mem.id).single()).data.id
  // Fixture per role berhak (ADM dan PM): tiap klik berhak punya target sendiri
  for (const r of ['ADM', 'PM']) {
    fx[r] = {
      tEdit: await mkTask(`Task ubah ${r}`), tStatus: await mkTask(`Task status ${r}`), tSubmit: await mkTask(`Task submit ${r}`),
      tCancel: await mkTask(`Task batal ${r}`), tDel: await mkTask(`Task hapus ${r}`),
      wsEdit: await mkWs(`WS ubah ${r}`), wsDel: await mkWs(`WS hapus ${r}`),
      sApprove: await mkSug(`Usulan approve ${r}`), sRevise: await mkSug(`Usulan revisi ${r}`), sReject: await mkSug(`Usulan tolak ${r}`),
      mDraft: await mkMeeting(`Meeting jadwal ${r}`, 'DRAFT'), mWork: await mkMeeting(`Meeting kerja ${r}`, 'SCHEDULED'),
      mDone: await mkMeeting(`Meeting selesai ${r}`, 'SCHEDULED'), mCancel: await mkMeeting(`Meeting batal ${r}`, 'SCHEDULED'),
    }
    fx[r].aiWork = await mkAi(fx[r].mWork, `AI kerja ${r}`)
    fx[r].partMem = (await db.from('meeting_participants').select('id').eq('meeting_id', fx[r].mWork).eq('user_id', mem.id).single()).data.id
  }
  fx.ADM.project = PA; fx.PM.project = PB
  // Task status/submit untuk MEM (assignee)
  fx.MEM = { tStatus: await mkTask('Task status MEM'), tSubmit: await mkTask('Task submit MEM') }
  const prjMain = `/projects/${PRJ}`

  /* ---------- aksi ---------- */
  const ACTIONS = []
  const act = (name, fn) => ACTIONS.push([name, fn])

  // ===== TASK =====
  act('task.buat', async (role, page) => {
    const a = 'task.buat'
    if (isA(a, role)) {
      const title = `${P} Task buat ${role}`
      await go(page, '/tasks/new')
      const f = page.locator('form:has(#task_title)')
      await f.locator('#task_title').fill(title)
      await f.locator('select[name="project_id"]').selectOption(PRJ)
      await f.locator('select[name="assignee_id"]').selectOption(mem.id)
      await f.locator('input[name="deadline"]').fill(day(7))
      const req = await press(page, f.getByRole('button', { name: 'Buat Task' }), 'task.create', { title })
      const t = await until(async () => (await db.from('tasks').select('id, status, project_id, assignee_id').eq('title', title).maybeSingle()).data)
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: task tersimpan (TODO, project, assignee)', t && t.status === 'TODO' && t.project_id === PRJ && t.assignee_id === mem.id, await msgOf(f))
    } else {
      const res = await go(page, '/tasks/new')
      if (page.url().startsWith(BASE + '/tasks/new') && !is404(res)) {
        const vals = await page.locator('#task_project option').evaluateAll((os) => os.map((o) => o.value))
        check(role, a, 'form tidak menawarkan project uji', !vals.includes(PRJ), vals.length + ' opsi')
      } else check(role, a, 'halaman /tasks/new ditolak', true, is404(res) ? '404' : 'redirect ' + page.url().replace(BASE, ''))
      const rt = `${P} Task replay ${role}`
      await denyReplay(role, page, a, 'task.create', [[recs['task.create']?.meta.title, rt]], async () => {
        const n = await count('tasks', (q) => q.eq('title', rt))
        return [n === 0, `task replay=${n}`]
      })
    }
  })
  act('task.ubah', async (role, page) => {
    const a = 'task.ubah'
    if (isA(a, role)) {
      const id = fx[role].tEdit, title = `${P} Task diubah ${role}`
      await go(page, `/tasks/${id}`)
      const f = page.locator('form:has(#task_title)')
      await f.locator('#task_title').fill(title)
      await f.locator('#task_priority').selectOption('HIGH')
      const req = await press(page, f.getByRole('button', { name: 'Simpan Perubahan' }), 'task.update', { id })
      const t = await until(async () => { const r = await get('tasks', id, 'title, priority'); return r?.title === title && r.priority === 'HIGH' && r })
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: judul + prioritas berubah', t, await msgOf(f))
    } else {
      const res = await go(page, `/tasks/${ids.vTask}`)
      await blocked(role, a, 'form Ubah Task tidak tampil/ditolak', page, res, `/tasks/${ids.vTask}`, [sel('#task_title'), btn('Simpan Perubahan')])
      await denyReplay(role, page, a, 'task.update', [[recs['task.update']?.meta.id, ids.vTask]], async () => {
        const r = await get('tasks', ids.vTask, 'title, priority')
        return [r.title === `${P} Korban task` && r.priority === 'MEDIUM', `${r.title} ${r.priority}`]
      })
    }
  })
  act('task.status', async (role, page) => {
    const a = 'task.status'
    if (isA(a, role)) {
      const id = fx[role].tStatus
      await go(page, `/tasks/${id}`)
      const f = page.locator('form:has(#status_change)')
      await f.locator('#status_change').selectOption('IN_PROGRESS')
      const req = await press(page, f.getByRole('button', { name: 'Perbarui' }), 'task.status', { id })
      const t = await until(async () => (await get('tasks', id, 'status'))?.status === 'IN_PROGRESS')
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: status IN_PROGRESS', t, await msgOf(f))
    } else {
      const res = await go(page, `/tasks/${ids.vTask}`)
      await blocked(role, a, 'form Ubah Status tidak tampil/ditolak', page, res, `/tasks/${ids.vTask}`, [sel('#status_change')])
      await denyReplay(role, page, a, 'task.status', [[recs['task.status']?.meta.id, ids.vTask]], async () => {
        const r = await get('tasks', ids.vTask, 'status'); return [r.status === 'TODO', r.status]
      })
    }
  })
  act('task.submit', async (role, page) => {
    const a = 'task.submit'
    if (isA(a, role)) {
      const id = fx[role].tSubmit, url = `https://example.com/uji-e2e-evidence-${role}`
      await go(page, `/tasks/${id}`)
      const ef = page.locator('form:has(#evidence_url)')
      await ef.locator('#evidence_url').fill(url)
      const r1 = await press(page, ef.getByRole('button', { name: 'Simpan', exact: true }), 'task.evidence', { id })
      const ev = await until(async () => (await get('tasks', id, 'evidence_url'))?.evidence_url === url)
      check(role, a, 'Evidence: klik terkirim + DB evidence_url tersimpan', r1 && ev, await msgOf(ef))
      await go(page, `/tasks/${id}`)
      const req = await press(page, page.getByRole('button', { name: 'Submit sebagai Done' }), 'task.submit', { id })
      const t = await until(async () => { const r = await get('tasks', id, 'status, completed_at, evidence_url'); return r?.status === 'DONE' && r.completed_at && r.evidence_url === url && r })
      check(role, a, 'Submit sebagai Done: klik terkirim', req)
      check(role, a, 'DB: DONE + completed_at + evidence tetap', t)
    } else {
      const res = await go(page, `/tasks/${ids.vTask}`)
      await blocked(role, a, 'Submit/Evidence tidak tampil/ditolak', page, res, `/tasks/${ids.vTask}`, [btn('Submit sebagai Done'), sel('#evidence_url')])
      await denyReplay(role, page, a, 'task.submit', [[recs['task.submit']?.meta.id, ids.vTask]], async () => {
        const r = await get('tasks', ids.vTask, 'status, completed_at'); return [r.status === 'TODO' && !r.completed_at, r.status]
      })
      await denyReplay(role, page, a, 'task.evidence', [[recs['task.evidence']?.meta.id, ids.vTask]], async () => {
        const r = await get('tasks', ids.vTask, 'evidence_url'); return [!r.evidence_url, String(r.evidence_url)]
      })
    }
  })
  act('task.batal', async (role, page) => {
    const a = 'task.batal'
    if (isA(a, role)) {
      const id = fx[role].tCancel
      await go(page, `/tasks/${id}`)
      const req = await press(page, page.getByRole('button', { name: 'Batalkan Task' }), 'task.cancel', { id })
      const t = await until(async () => { const r = await get('tasks', id, 'status, cancelled_at'); return r?.status === 'CANCELLED' && r.cancelled_at })
      check(role, a, 'klik terkirim', req)
      check(role, a, 'DB: CANCELLED + cancelled_at', t)
    } else {
      const res = await go(page, `/tasks/${ids.vTask}`)
      await blocked(role, a, 'tombol Batalkan Task tidak tampil/ditolak', page, res, `/tasks/${ids.vTask}`, [btn('Batalkan Task')])
      await denyReplay(role, page, a, 'task.cancel', [[recs['task.cancel']?.meta.id, ids.vTask]], async () => {
        const r = await get('tasks', ids.vTask, 'status'); return [r.status === 'TODO', r.status]
      })
    }
  })
  act('task.hapus', async (role, page) => {
    const a = 'task.hapus'
    if (isA(a, role)) {
      const id = fx[role].tDel
      await go(page, `/tasks/${id}`)
      const req = await press(page, page.getByRole('button', { name: 'Hapus Task' }), 'task.delete', { id })
      const t = await until(async () => (await get('tasks', id, 'is_deleted'))?.is_deleted === true)
      check(role, a, 'klik terkirim', req)
      check(role, a, 'DB: is_deleted = true', t)
    } else {
      const res = await go(page, `/tasks/${ids.vTask}`)
      await blocked(role, a, 'tombol Hapus Task tidak tampil/ditolak', page, res, `/tasks/${ids.vTask}`, [btn('Hapus Task')])
      await denyReplay(role, page, a, 'task.delete', [[recs['task.delete']?.meta.id, ids.vTask]], async () => {
        const r = await get('tasks', ids.vTask, 'is_deleted'); return [r.is_deleted === false, String(r.is_deleted)]
      })
    }
  })

  // ===== PROJECT + WORKSTREAM =====
  act('proj.buat', async (role, page) => {
    const a = 'proj.buat'
    if (isA(a, role)) {
      const name = `${P} Project buat ${role}`
      await go(page, '/projects/new')
      const f = page.locator('form:has(select[name="project_manager_ids"])')
      await f.locator('input[name="name"]').fill(name)
      await f.locator('select[name="project_manager_ids"]').selectOption([role === 'PMX' ? users.PMX.id : pm.id])
      await f.locator('input[name="start_date"]').fill(day(0))
      await f.locator('input[name="end_date"]').fill(day(30))
      await f.locator('select[name="status"]').selectOption('ACTIVE')
      const req = await press(page, f.getByRole('button', { name: 'Buat Project' }), 'proj.create', { name })
      const p = await until(async () => (await db.from('projects').select('id, status').eq('name', name).maybeSingle()).data)
      const links = p ? (await db.from('project_managers').select('user_id').eq('project_id', p.id)).data : []
      const want = role === 'PMX' ? users.PMX.id : pm.id
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: project ACTIVE + PM terpasang', p && p.status === 'ACTIVE' && links.some((l) => l.user_id === want), await msgOf(f))
    } else {
      const res = await go(page, '/projects/new')
      await blocked(role, a, '/projects/new ditolak', page, res, '/projects/new', [sel('select[name="project_manager_ids"]')])
      const rn = `${P} Project replay ${role}`
      await denyReplay(role, page, a, 'proj.create', [[recs['proj.create']?.meta.name, rn]], async () => {
        const n = await count('projects', (q) => q.eq('name', rn)); return [n === 0, `project replay=${n}`]
      })
    }
  })
  act('proj.ubah', async (role, page) => {
    const a = 'proj.ubah'
    if (isA(a, role)) {
      const id = fx[role].project, name = `${P} Project diubah ${role}`
      const pmSet = role === 'ADM' ? [users.PMX.id] : [pm.id, users.PMX.id]
      await go(page, `/projects/${id}?tab=settings`)
      const f = page.locator('form:has(#proj_name)')
      await f.locator('#proj_name').fill(name)
      await f.locator('#proj_status').selectOption('ON_HOLD')
      await f.locator('select[name="project_manager_ids"]').selectOption(pmSet)
      const req = await press(page, f.getByRole('button', { name: 'Simpan Perubahan' }), 'proj.update', { id })
      const ok = await until(async () => {
        const r = await get('projects', id, 'name, status'); if (r?.name !== name || r.status !== 'ON_HOLD') return false
        const l = (await db.from('project_managers').select('user_id').eq('project_id', id)).data.map((x) => x.user_id).sort()
        return JSON.stringify(l) === JSON.stringify([...pmSet].sort())
      })
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: nama, status, dan daftar PM berubah', ok, await msgOf(f))
    } else {
      const res = await go(page, `${prjMain}?tab=settings`)
      await blocked(role, a, 'form Pengaturan project tidak tampil/ditolak', page, res, prjMain, [sel('#proj_name'), (pg) => pg.locator('a[href*="tab=settings"]')])
      await denyReplay(role, page, a, 'proj.update', [[recs['proj.update']?.meta.id, PV]], async () => {
        const r = await get('projects', PV, 'name, status'); return [r.name === `${P} Project Korban` && r.status === 'ACTIVE', `${r.name} ${r.status}`]
      })
    }
  })
  act('ws.buat', async (role, page) => {
    const a = 'ws.buat'
    if (isA(a, role)) {
      const name = `${P} WS buat ${role}`
      await go(page, `/workstreams/new?project=${PRJ}`)
      const f = page.locator('form:has(#ws_name)')
      await f.locator('#ws_name').fill(name)
      const req = await press(page, f.getByRole('button', { name: 'Buat Workstream' }), 'ws.create', { name })
      const w = await until(async () => (await db.from('workstreams').select('id').eq('project_id', PRJ).eq('name', name).maybeSingle()).data)
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: workstream tersimpan', w, await msgOf(f))
    } else {
      const res = await go(page, `/workstreams/new?project=${PRJ}`)
      await blocked(role, a, '/workstreams/new ditolak', page, res, '/workstreams/new', [sel('#ws_name')])
      const rn = `${P} WS replay ${role}`
      await denyReplay(role, page, a, 'ws.create', [[recs['ws.create']?.meta.name, rn]], async () => {
        const n = await count('workstreams', (q) => q.eq('name', rn)); return [n === 0, `ws replay=${n}`]
      })
    }
  })
  const wsLi = (page, name) => page.locator('li', { hasText: name }).last()
  act('ws.ubah', async (role, page) => {
    const a = 'ws.ubah'
    if (isA(a, role)) {
      const id = fx[role].wsEdit, name = `${P} WS diubah ${role}`
      await go(page, `${prjMain}?tab=workstreams`)
      const li = wsLi(page, `${P} WS ubah ${role}`)
      await li.locator('summary').click()
      await li.getByLabel('Nama Workstream').fill(name)
      const req = await press(page, li.getByRole('button', { name: 'Simpan', exact: true }), 'ws.update', { id })
      const ok = await until(async () => (await get('workstreams', id, 'name'))?.name === name)
      check(role, a, 'klik terkirim', req)
      check(role, a, 'DB: nama workstream berubah', ok)
    } else {
      const res = await go(page, `${prjMain}?tab=workstreams`)
      await blocked(role, a, 'tombol Ubah workstream tidak tampil/ditolak', page, res, prjMain, [(pg) => pg.locator('summary', { hasText: 'Ubah' })])
      await denyReplay(role, page, a, 'ws.update', [[recs['ws.update']?.meta.id, ids.vWs]], async () => {
        const r = await get('workstreams', ids.vWs, 'name'); return [r.name === `${P} WS korban`, r.name]
      })
    }
  })
  act('ws.hapus', async (role, page) => {
    const a = 'ws.hapus'
    if (isA(a, role)) {
      const id = fx[role].wsDel
      await go(page, `${prjMain}?tab=workstreams`)
      const li = wsLi(page, `${P} WS hapus ${role}`)
      const req = await press(page, li.getByRole('button', { name: 'Hapus', exact: true }), 'ws.delete', { id })
      const ok = await until(async () => !(await get('workstreams', id, 'id')))
      check(role, a, 'klik terkirim', req)
      check(role, a, 'DB: workstream terhapus', ok)
    } else {
      const res = await go(page, `${prjMain}?tab=workstreams`)
      await blocked(role, a, 'tombol Hapus workstream tidak tampil/ditolak', page, res, prjMain, [btn('Hapus')])
      await denyReplay(role, page, a, 'ws.delete', [[recs['ws.delete']?.meta.id, ids.vWs]], async () => {
        const r = await get('workstreams', ids.vWs, 'id'); return [Boolean(r), r ? 'ada' : 'HILANG']
      })
    }
  })

  // ===== SUGGESTION =====
  act('sug.buat', async (role, page) => {
    const a = 'sug.buat'
    if (isA(a, role)) {
      const title = `${P} Usulan buat ${role}`
      await go(page, `/task-suggestions/new?project=${PRJ}`)
      const f = page.locator('form:has(textarea[name="description"]):has(input[name="title"])')
      await f.locator('select[name="project_id"]').selectOption(PRJ).catch(() => {})
      await f.locator('input[name="title"]').fill(title)
      await f.locator('textarea[name="description"]').fill('Usulan uji klik role')
      const req = await press(page, f.getByRole('button', { name: 'Submit Suggestion' }), 'sug.create', { title })
      const s = await until(async () => (await db.from('task_suggestions').select('id, status, suggested_by, project_id').eq('title', title).maybeSingle()).data)
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: usulan PENDING atas nama pembuat', s && s.status === 'PENDING' && s.suggested_by === users[role].id && s.project_id === PRJ, await msgOf(f))
    } else {
      const res = await go(page, `/task-suggestions/new?project=${PRJ}`)
      const f = page.locator('form:has(textarea[name="description"]):has(input[name="title"])')
      if (is404(res) || (await f.count()) === 0) check(role, a, 'form usulan tidak tampil/ditolak', true, '404/tanpa form')
      else {
        const vals = await f.locator('select[name="project_id"] option').evaluateAll((os) => os.map((o) => o.value))
        check(role, a, 'form tidak menawarkan project uji', !vals.includes(PRJ), vals.length + ' opsi')
      }
      const rt = `${P} Usulan replay ${role}`
      await denyReplay(role, page, a, 'sug.create', [[recs['sug.create']?.meta.title, rt]], async () => {
        const n = await count('task_suggestions', (q) => q.eq('title', rt)); return [n === 0, `usulan replay=${n}`]
      })
    }
  })
  const sugCase = (action, label, field, decisionBtn, expectStatus, victim, recKey, needsDeadline) => act(action, async (role, page) => {
    if (isA(action, role)) {
      const id = fx[role][field]
      await go(page, `/task-suggestions/${id}`)
      const f = page.locator('form:has(textarea[name="review_note"])')
      if (needsDeadline) {
        await f.locator('#review_assignee').selectOption(mem.id)
        await f.locator('#review_deadline').fill(day(10))
      }
      await f.locator('#review_note').fill(`Catatan ${label} ${role}`)
      const req = await press(page, f.getByRole('button', { name: decisionBtn, exact: true }), recKey, { id })
      const s = await until(async () => { const r = await get('task_suggestions', id, 'status, review_note, converted_task_id'); return r?.status === expectStatus && r })
      check(role, action, 'klik terkirim', req, await msgOf(f))
      check(role, action, `DB: status ${expectStatus} + catatan tersimpan`, s && s.review_note === `Catatan ${label} ${role}`, await msgOf(f))
      if (needsDeadline) {
        const t = s?.converted_task_id ? await get('tasks', s.converted_task_id, 'deadline, assignee_id, source_type') : null
        check(role, action, 'DB: task hasil approve punya deadline + assignee + sumber SUGGESTION', t && t.deadline === day(10) && t.assignee_id === mem.id && t.source_type === 'SUGGESTION', JSON.stringify(t))
      }
    } else {
      const res = await go(page, `/task-suggestions/${victim}`)
      await blocked(role, action, `tombol ${decisionBtn} tidak tampil/ditolak`, page, res, `/task-suggestions/${victim}`, [btn(decisionBtn)])
      await denyReplay(role, page, action, recKey, [[recs[recKey]?.meta.id, victim]], async () => {
        const r = await get('task_suggestions', victim, 'status, converted_task_id'); return [r.status === 'PENDING' && !r.converted_task_id, r.status]
      })
    }
  })
  sugCase('sug.approve', 'approve', 'sApprove', 'Setujui', 'CONVERTED', ids.vSug_approve, 'sug.approve', true)
  sugCase('sug.revisi', 'revisi', 'sRevise', 'Minta Revisi', 'REVISION_REQUESTED', ids.vSug_revise, 'sug.revise', false)
  sugCase('sug.tolak', 'tolak', 'sReject', 'Tolak', 'REJECTED', ids.vSug_reject, 'sug.reject', false)

  // ===== MEETING =====
  act('mtg.buat', async (role, page) => {
    const a = 'mtg.buat'
    if (isA(a, role)) {
      const title = `${P} Meeting buat ${role}`
      await go(page, '/meetings/new')
      const f = page.locator('form:has(input[name="meeting_date"])')
      await f.locator('select[name="project_id"]').selectOption(PRJ)
      await f.locator('input[name="title"]').fill(title)
      await f.locator('input[name="meeting_date"]').fill(day(2))
      await f.locator('input[name="start_time"]').fill('10:00')
      await f.locator('input[name="end_time"]').fill('11:00')
      const req = await press(page, f.getByRole('button', { name: 'Buat Meeting' }), 'mtg.create', { title })
      const m = await until(async () => (await db.from('meetings').select('id, status, created_by, project_id').eq('title', title).maybeSingle()).data)
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: meeting DRAFT dibuat oleh role ini di project uji', m && m.status === 'DRAFT' && m.created_by === users[role].id && m.project_id === PRJ, await msgOf(f))
    } else {
      const title = `${P} Meeting ditolak ${role}`
      const res = await go(page, '/meetings/new')
      if (!page.url().startsWith(BASE + '/meetings/new') || is404(res)) check(role, a, '/meetings/new ditolak', true, 'redirect/404')
      else {
        const f = page.locator('form:has(input[name="meeting_date"])')
        const vals = await f.locator('select[name="project_id"] option').evaluateAll((os) => os.map((o) => o.value))
        if (!vals.includes(PRJ)) check(role, a, 'form tidak menawarkan project uji', true, vals.length + ' opsi')
        else {
          await f.locator('select[name="project_id"]').selectOption(PRJ)
          await f.locator('input[name="title"]').fill(title)
          await f.locator('input[name="meeting_date"]').fill(day(2))
          await f.locator('input[name="start_time"]').fill('10:00')
          await f.locator('input[name="end_time"]').fill('11:00')
          await press(page, f.getByRole('button', { name: 'Buat Meeting' }), null)
          const n = await count('meetings', (q) => q.eq('title', title))
          check(role, a, 'form ditawarkan tetapi submit ditolak, DB tanpa meeting', n === 0 && /izin|akses/i.test(await msgOf(f)), await msgOf(f))
        }
      }
      const rt = `${P} Meeting replay ${role}`
      await denyReplay(role, page, a, 'mtg.create', [[recs['mtg.create']?.meta.title, rt]], async () => {
        const n = await count('meetings', (q) => q.eq('title', rt)); return [n === 0, `meeting replay=${n}`]
      })
    }
  })
  const mtgLifecycle = (action, field, victim, buttonName, expectStatus, fromStatus, recKey) => act(action, async (role, page) => {
    if (isA(action, role)) {
      const id = fx[role][field]
      await go(page, `/meetings/${id}`)
      const req = await press(page, page.getByRole('button', { name: buttonName }), recKey, { id })
      const ok = await until(async () => (await get('meetings', id, 'status'))?.status === expectStatus)
      check(role, action, 'klik terkirim', req)
      check(role, action, `DB: status ${expectStatus}`, ok)
    } else {
      const res = await go(page, `/meetings/${victim}`)
      await blocked(role, action, `tombol ${buttonName} tidak tampil/ditolak`, page, res, `/meetings/${victim}`, [btn(buttonName)])
      await denyReplay(role, page, action, recKey, [[recs[recKey]?.meta.id, victim]], async () => {
        const r = await get('meetings', victim, 'status'); return [r.status === fromStatus, r.status]
      })
    }
  })
  mtgLifecycle('mtg.jadwal', 'mDraft', ids.vMtgDraft, 'Jadwalkan Meeting', 'SCHEDULED', 'DRAFT', 'mtg.schedule')
  // Konten meeting: ADM/PM di meeting kerja sendiri; MEM (peserta) di meeting korban konten.
  const contentCase = (action, tab, buttonName, fillAndKey, verify, recKey) => act(action, async (role, page) => {
    if (isA(action, role)) {
      const mid = role === 'MEM' ? ids.vMtg : fx[role].mWork
      const text = `${P} ${action} ${role}`
      await go(page, `/meetings/${mid}?tab=${tab}`)
      const f = page.locator('form').filter({ has: page.getByRole('button', { name: buttonName, exact: true }) }).last()
      await fillAndKey(f, text)
      const req = await press(page, f.getByRole('button', { name: buttonName, exact: true }), recKey, { id: mid, text })
      const ok = await until(async () => verify(mid, text))
      check(role, action, 'klik terkirim', req, await msgOf(f))
      check(role, action, 'DB: baris baru tersimpan', ok, await msgOf(f))
    } else {
      const res = await go(page, `/meetings/${ids.vMtg}?tab=${tab}`)
      await blocked(role, action, `form ${buttonName} tidak tampil/ditolak`, page, res, `/meetings/${ids.vMtg}`, [btn(buttonName)])
      const rt = `${P} ${action} replay ${role}`
      await denyReplay(role, page, action, recKey, [[recs[recKey]?.meta.id, ids.vMtg], [recs[recKey]?.meta.text, rt]], async () => {
        const v = await verify(ids.vMtg, rt); return [!v, v ? 'baris replay ADA' : 'tidak ada']
      })
    }
  })
  contentCase('mtg.agenda', 'agenda', '+ Tambah', (f, t) => f.getByLabel('Judul Agenda').fill(t),
    async (m, t) => (await db.from('meeting_agendas').select('id').eq('meeting_id', m).eq('title', t).maybeSingle()).data, 'mtg.agenda')
  contentCase('mtg.keputusan', 'decisions', '+ Tambah', (f, t) => f.getByLabel('Decision').fill(t),
    async (m, t) => (await db.from('meeting_decisions').select('id').eq('meeting_id', m).eq('decision', t).maybeSingle()).data, 'mtg.decision')
  contentCase('mtg.action', 'actions', '+ Tambah Action Item', (f, t) => f.getByLabel('Judul Action Item').fill(t),
    async (m, t) => (await db.from('meeting_action_items').select('id').eq('meeting_id', m).eq('title', t).maybeSingle()).data, 'mtg.action')
  act('mtg.ai-task', async (role, page) => {
    const a = 'mtg.ai-task'
    if (isA(a, role)) {
      const mid = fx[role].mWork, aid = fx[role].aiWork
      await go(page, `/meetings/${mid}?tab=actions`)
      const card = page.locator(`li:has(input[name="title"][value="${P} AI kerja ${role}"])`).first()
      const f = card.locator('form:has(input[name="action_item_id"])')
      const req = await press(page, f.getByRole('button', { name: 'Buat Task' }), 'mtg.aitask', { mid, aid })
      const ai = await until(async () => { const r = await get('meeting_action_items', aid, 'task_id'); return r?.task_id && r })
      const t = ai ? await get('tasks', ai.task_id, 'assignee_id, deadline, source_type, project_id') : null
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: task dibuat dari action item (assignee, deadline, sumber MEETING, project)', t && t.assignee_id === mem.id && t.deadline === day(5) && t.source_type === 'MEETING' && t.project_id === PRJ, JSON.stringify(t))
    } else {
      const res = await go(page, `/meetings/${ids.vMtg}?tab=actions`)
      await blocked(role, a, 'tombol Buat Task tidak tampil/ditolak', page, res, `/meetings/${ids.vMtg}`, [btn('Buat Task')])
      const m = recs['mtg.aitask']?.meta
      await denyReplay(role, page, a, 'mtg.aitask', [[m?.mid, ids.vMtg], [m?.aid, ids.vAi]], async () => {
        const r = await get('meeting_action_items', ids.vAi, 'task_id'); return [!r.task_id, String(r.task_id)]
      })
    }
  })
  act('mtg.+peserta', async (role, page) => {
    const a = 'mtg.+peserta'
    if (isA(a, role)) {
      const mid = fx[role].mWork, add = role === 'ADM' ? users.MEMX : users.VWR
      await go(page, `/meetings/${mid}`)
      const f = page.locator('form:has(select[name="user_id"])')
      await f.locator('select[name="user_id"]').selectOption(add.id)
      const req = await press(page, f.getByRole('button', { name: '+ Tambah Peserta' }), 'mtg.addp', { mid, uid: add.id })
      const ok = await until(async () => (await db.from('meeting_participants').select('id').eq('meeting_id', mid).eq('user_id', add.id).maybeSingle()).data)
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: peserta baru tercatat', ok, await msgOf(f))
    } else {
      const res = await go(page, `/meetings/${ids.vMtg}`)
      await blocked(role, a, 'form tambah peserta tidak tampil/ditolak', page, res, `/meetings/${ids.vMtg}`, [sel('select[name="user_id"]'), btn('+ Tambah Peserta')])
      const m = recs['mtg.addp']?.meta
      await denyReplay(role, page, a, 'mtg.addp', [[m?.mid, ids.vMtg], [m?.uid, vic.id]], async () => {
        const n = await count('meeting_participants', (q) => q.eq('meeting_id', ids.vMtg).eq('user_id', vic.id)); return [n === 0, `peserta korban=${n}`]
      })
    }
  })
  act('mtg.-peserta', async (role, page) => {
    const a = 'mtg.-peserta'
    if (isA(a, role)) {
      const mid = fx[role].mWork, pid = fx[role].partMem
      await go(page, `/meetings/${mid}`)
      const li = page.locator('li', { hasText: new RegExp(`${P} Member(?! Lain)`) }).last()
      const req = await press(page, li.getByRole('button', { name: 'Hapus', exact: true }), 'mtg.rmp', { mid, pid })
      const ok = await until(async () => !(await get('meeting_participants', pid, 'id')))
      check(role, a, 'klik terkirim', req)
      check(role, a, 'DB: peserta terhapus', ok)
    } else {
      const res = await go(page, `/meetings/${ids.vMtg}`)
      await blocked(role, a, 'tombol Hapus peserta tidak tampil/ditolak', page, res, `/meetings/${ids.vMtg}`, [btn('Hapus')])
      const m = recs['mtg.rmp']?.meta
      await denyReplay(role, page, a, 'mtg.rmp', [[m?.mid, ids.vMtg], [m?.pid, ids.vPart]], async () => {
        const r = await get('meeting_participants', ids.vPart, 'id'); return [Boolean(r), r ? 'ada' : 'HILANG']
      })
    }
  })
  mtgLifecycle('mtg.selesai', 'mDone', ids.vMtgDone, 'Selesaikan Meeting', 'COMPLETED', 'SCHEDULED', 'mtg.complete')
  mtgLifecycle('mtg.batal', 'mCancel', ids.vMtgCancel, 'Batalkan Meeting', 'CANCELLED', 'SCHEDULED', 'mtg.cancel')

  // ===== USERS (admin) =====
  act('user.buat', async (role, page) => {
    const a = 'user.buat'
    if (isA(a, role)) {
      const email = 'uji-e2e-formnew@example.com', pw = crypto.randomBytes(12).toString('base64url')
      await go(page, '/users/new')
      const f = page.locator('form:has(#create_email)')
      await f.locator('#create_full_name').fill(`${P} User Baru`)
      await f.locator('#create_email').fill(email)
      await f.locator('#create_password').fill(pw)
      await f.locator('#create_role').selectOption('TEAM_MEMBER')
      const req = await press(page, f.getByRole('button', { name: 'Buat User' }), 'user.create', { email })
      const u = await until(async () => { const r = (await db.from('profiles').select('id, role, status').eq('email', email).maybeSingle()).data; return r?.role === 'TEAM_MEMBER' && r.status === 'ACTIVE' && r })
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: profil TEAM_MEMBER ACTIVE tercatat', u, await msgOf(f))
      const s = await session('ADM-login', { email, password: pw }).catch((e) => ({ err: e }))
      check(role, a, 'user baru benar-benar bisa login dengan password itu', s.page && /dashboard/.test(s.page.url()), s.err?.message ?? '')
      await s.context?.close()
    } else {
      const res = await go(page, '/users/new')
      await blocked(role, a, '/users/new ditolak', page, res, '/users/new', [sel('#create_email')])
      const re = `uji-e2e-rp-${role.toLowerCase()}@example.com`
      await denyReplay(role, page, a, 'user.create', [[recs['user.create']?.meta.email, re]], async () => {
        const n = await count('profiles', (q) => q.eq('email', re)); return [n === 0, `profil replay=${n}`]
      })
    }
  })
  act('user.ubah', async (role, page) => {
    const a = 'user.ubah'
    if (isA(a, role)) {
      const name = `${P} Nama Baru`
      await go(page, `/users/${tgt.id}`)
      const f = page.locator('form:has(#edit_full_name)')
      await f.locator('#edit_full_name').fill(name)
      await f.locator('#edit_role').selectOption('VIEWER')
      const req = await press(page, f.getByRole('button', { name: 'Simpan Perubahan' }), 'user.update', { id: tgt.id })
      const ok = await until(async () => { const r = await get('profiles', tgt.id, 'full_name, role'); return r?.full_name === name && r.role === 'VIEWER' })
      check(role, a, 'klik terkirim', req, await msgOf(f))
      check(role, a, 'DB: nama dan role berubah', ok, await msgOf(f))
    } else {
      const res = await go(page, `/users/${tgt.id}`)
      await blocked(role, a, '/users/[id] ditolak', page, res, `/users/${tgt.id}`, [sel('#edit_full_name')])
      await denyReplay(role, page, a, 'user.update', [[recs['user.update']?.meta.id, vic.id]], async () => {
        const r = await get('profiles', vic.id, 'full_name, role'); return [r.full_name === `${P} Korban` && r.role === 'TEAM_MEMBER', `${r.full_name} ${r.role}`]
      })
    }
  })
  act('user.status', async (role, page) => {
    const a = 'user.status'
    if (isA(a, role)) {
      await go(page, `/users/${tgt.id}`)
      const req = await press(page, page.getByRole('button', { name: 'Nonaktifkan', exact: true }), 'user.status', { id: tgt.id })
      const off = await until(async () => (await get('profiles', tgt.id, 'status'))?.status === 'INACTIVE')
      check(role, a, 'Nonaktifkan: klik terkirim + DB INACTIVE', req && off)
      await go(page, `/users/${tgt.id}`)
      await press(page, page.getByRole('button', { name: 'Aktifkan', exact: true }), null)
      const on = await until(async () => (await get('profiles', tgt.id, 'status'))?.status === 'ACTIVE')
      check(role, a, 'Aktifkan: klik terkirim + DB ACTIVE', on)
    } else {
      const res = await go(page, `/users/${tgt.id}`)
      await blocked(role, a, 'tombol Nonaktifkan tidak tampil/ditolak', page, res, `/users/${tgt.id}`, [btn('Nonaktifkan')])
      await denyReplay(role, page, a, 'user.status', [[recs['user.status']?.meta.id, vic.id]], async () => {
        const r = await get('profiles', vic.id, 'status'); return [r.status === 'ACTIVE', r.status]
      })
    }
  })

  // ===== SEMUA ROLE =====
  act('profil.nama', async (role, page) => {
    const a = 'profil.nama', name = `${P} Nama Sendiri ${role}`
    await go(page, '/profile')
    const f = page.locator('form:has(#full_name)')
    await f.locator('#full_name').fill(name)
    const req = await press(page, f.getByRole('button', { name: 'Simpan', exact: true }), null)
    const ok = await until(async () => (await get('profiles', users[role].id, 'full_name'))?.full_name === name)
    check(role, a, 'klik terkirim', req, await msgOf(f))
    check(role, a, 'DB: nama profil sendiri berubah', ok, await msgOf(f))
  })
  act('notif.dibaca', async (role, page) => {
    const a = 'notif.dibaca'
    // Disemai tepat sebelum klik: role dengan banyak notifikasi lain memindahkan yang lama ke halaman berikut.
    await one(db.from('notifications').insert({ user_id: users[role].id, type: 'TASK_ASSIGNED', title: `${P} notif ${role}`, message: 'uji klik', entity_type: 'task', entity_id: ids.vTask }), 'notif')
    await go(page, '/notifications')
    const li = page.locator('li', { hasText: `${P} notif ${role}` }).last()
    const req = await press(page, li.getByRole('button', { name: 'Tandai dibaca' }), null)
    const ok = await until(async () => (await db.from('notifications').select('is_read, read_at').eq('user_id', users[role].id).eq('title', `${P} notif ${role}`).maybeSingle()).data?.is_read === true)
    check(role, a, 'klik terkirim', req)
    check(role, a, 'DB: notifikasi is_read = true', ok)
  })
  act('notif.pref', async (role, page) => {
    const a = 'notif.pref'
    await go(page, '/notifications')
    const f = page.locator('form:has(button:has-text("Simpan Preferensi"))')
    const cb = f.locator('input[name="email_digest_daily"]')
    const was = await cb.isChecked()
    await cb.setChecked(!was)
    const req = await press(page, f.getByRole('button', { name: 'Simpan Preferensi' }), null)
    const ok = await until(async () => (await db.from('notification_preferences').select('email_digest_daily').eq('user_id', users[role].id).maybeSingle()).data?.email_digest_daily === !was)
    check(role, a, 'klik terkirim', req, await msgOf(f))
    check(role, a, `DB: email_digest_daily ${was} -> ${!was}`, ok, await msgOf(f))
  })

  /* ---------- jalan: satu context per role, ditutup sesudahnya ---------- */
  // Urutan: pemilik rekaman (ADM, PM, MEM) dulu, lalu role yang hanya memutar ulang.
  for (const role of ['ADM', 'PM', 'MEM', 'PMX', 'MEMX', 'VWR']) {
    browser = await loadPlaywright().chromium.launch({ headless: true })
    const { context, page } = await session(role, users[role])
    for (const [name, fn] of ACTIONS) {
      try { await fn(role, page) } catch (e) { check(role, name, 'EXC', false, e.message.split('\n')[0]) }
    }
    await context.close()
    await browser.close()
  }
} catch (e) {
  results.push({ role: '-', action: 'setup', expect: '-', name: 'EXC', ok: false, info: String(e.message).slice(0, 220) })
} finally {
  await browser?.close().catch(() => {})
  cleanupResult = await runCleanup(db)
  const like = (t, c) => count(t, (q) => q.like(c, `${P}%`))
  extraLeft = {
    suggestions: await like('task_suggestions', 'title'), workstreams: await like('workstreams', 'name'),
    activity_projects: 0,
  }
  extraLeft.users_auth = (await db.auth.admin.listUsers({ perPage: 200 })).data?.users?.filter((u) => /^uji-e2e-.*@example\.com$/.test(u.email ?? '')).length ?? -1
}

/* ---------- laporan ---------- */
for (const role of ROLES) {
  const e = errs[role]
  results.push({ role, action: 'err.halaman', expect: 'A', name: 'tanpa error halaman/console', ok: e.length === 0, info: e.slice(0, 2).join(' || ') })
}
// Setiap sel matriks wajib punya minimal satu cek; yang bolong dihitung gagal.
for (const action of Object.keys(EXP)) {
  for (const role of ROLES) {
    if (!results.some((r) => r.action === action && r.role === role)) results.push({ role, action, expect: isA(action, role) ? 'A' : 'D', name: 'tidak diuji', ok: false, info: 'sel tanpa cek (setup gagal?)' })
  }
}
const actions = [...Object.keys(EXP), 'err.halaman']
const w = (s, n) => String(s).padEnd(n)
console.log('\n' + w('aksi', 15) + ROLES.map((r) => w(r, 8)).join(''))
for (const action of actions) {
  const cells = ROLES.map((role) => {
    const rs = results.filter((r) => r.action === action && r.role === role)
    if (rs.length === 0) return '-'
    return (rs.every((r) => r.ok) ? 'OK' : 'GAGAL') + (action === 'err.halaman' ? '' : isA(action, role) ? '+' : '-')
  })
  console.log(w(action, 15) + cells.map((c) => w(c, 8)).join(''))
}
console.log('(OK+ = berhak dan jalan; OK- = tidak berhak dan tertutup)')
const failed = results.filter((r) => !r.ok)
const extraOk = Object.values(extraLeft).every((n) => n === 0)
console.log(`\ncek: ${results.length - failed.length}/${results.length} lulus, ${failed.length} gagal; error halaman/console: ${ROLES.reduce((n, r) => n + errs[r].length, 0)}`)
for (const r of failed) console.log(`  GAGAL [${r.role}] ${r.action} :: ${r.name} :: ${r.info}`)
console.log('pembersihan: ' + cleanupResult.lines.at(-1) + ' ekstra: ' + JSON.stringify(extraLeft))
writeOut('roles-click-result.json', { started: T0.toISOString(), results, errors: errs, cleanup: cleanupResult.lines, extraLeft })
process.exit(failed.length === 0 && cleanupResult.ok && extraOk ? 0 : 1)

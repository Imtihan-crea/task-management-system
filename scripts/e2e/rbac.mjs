// Matriks RBAC end-to-end: tiap role membuka tiap halaman; dicatat akses
// (boleh / redirect / 404 / pesan "tidak punya izin") dan tombol aksi yang
// tampil, lalu dibandingkan dengan aturan yang dimaksud (permissions.ts,
// task-access.ts, project-access.ts, meetings/rules.ts, guard halaman).
// Ketidaksesuaian hanya DILAPORKAN, tidak diperbaiki. Data berawalan UJI-E2E,
// dibersihkan di finally. Rahasia tidak pernah dicetak.
import fs from 'node:fs'
import path from 'node:path'
import {
  guard, serviceClient, loadPlaywright, loginAdmin, loginPassword, makeUser,
  ensureAdmin, runCleanup, writeOut, BASE, OUT_DIR, PREFIX as P, day,
} from './lib.mjs'

await guard()
const db = serviceClient()
const ROLES = ['ADMIN', 'PM_A', 'PM_B', 'MEMBER', 'VIEWER']
const MANAGERS = ['ADMIN', 'PM_A']

/* ---------- label tombol -> kategori aksi ---------- */
const CATS = [
  ['delete', /^Hapus (Task|Project|Workstream)/i],
  ['delete-item', /^Hapus\b/i],
  ['submit', /^(Submit sebagai Done|Submit untuk Review PM|Submit Evidence)/i],
  ['status', /^Perbarui/i],
  ['approve', /^(Setujui|Tolak|Minta Revisi)/i],
  ['schedule', /^Jadwalkan Meeting/i],
  ['complete', /^Selesaikan Meeting/i],
  ['cancel', /^Batalkan Meeting/i],
  ['suggest', /^(Usulkan Task|Submit Suggestion)/i],
  ['add', /^(Tambah|Buat) (Task|Workstream|Project|Meeting|User|Action|agenda|decision|Peserta)/i],
  ['edit', /^(Simpan Perubahan|Edit)\b/i],
  ['cancel-task', /^Batalkan Task/i],
]
// Tombol yang wajar ada di halaman form/detail (submit form, tautan tambah) untuk role yang boleh masuk.
const OPTIONAL = {
  'workstreams/new': ['add'], 'meetings/new': ['add'], 'meetings/[id]': ['add', 'edit'],
  'task-suggestions/new': ['suggest'], users: ['add'], 'users/[id]': ['edit'], 'users/new': ['add'],
}
const catOf = (text) => CATS.find(([, re]) => re.test(text.replace(/^\+\s*/, '')))?.[0]

/* ---------- aturan yang dimaksud (bagan wewenang COA, 19 Nov 2026) ---------- */
// Akses: 'ALLOW' | 'DENY' (redirect/404/pesan izin). Aksi: himpunan kategori yang HARUS tampil.
// MEMBER = Project Officer dengan task di project A (anggota A). VIEWER = Guest tanpa task.
const only = (allowed, a = []) => Object.fromEntries(ROLES.map((r) => [r, allowed.includes(r) ? { access: 'ALLOW', actions: a } : { access: 'DENY', actions: [] }]))
function intended(key) {
  const open = (actions = {}) => Object.fromEntries(ROLES.map((r) => [r, { access: 'ALLOW', actions: actions[r] ?? [] }]))
  switch (key) {
    case 'portal': case 'dashboard': case 'activity': case 'notifications': case 'profile': return open()
    case 'tasks': return open({ ADMIN: ['add', 'suggest'], PM_A: ['add', 'suggest'], PM_B: ['add', 'suggest'], MEMBER: ['add', 'suggest'], VIEWER: ['suggest'] })
    case 'projects': return open({ ADMIN: ['add'] }) // COA: buat project hanya Admin
    case 'meetings': return open({ ADMIN: ['add'], PM_A: ['add'], PM_B: ['add'], MEMBER: ['add'] })
    case 'task-suggestions': return open({ ADMIN: ['suggest'], PM_A: ['suggest'], PM_B: ['suggest'], MEMBER: ['suggest'], VIEWER: ['suggest'] }) // Guest boleh usul (pemilik 19 Nov)
    case 'tasks/[id]': {
      const m = only(['ADMIN', 'PM_A', 'MEMBER']) // Guest hanya task miliknya
      m.ADMIN.actions = ['cancel-task', 'delete', 'edit', 'status', 'submit']
      m.PM_A.actions = ['cancel-task', 'delete', 'edit', 'status', 'submit']
      m.MEMBER.actions = ['edit', 'status', 'submit'] // COA: ubah task ya, batal/hapus tidak
      return m
    }
    case 'tasks/new': return only(['ADMIN', 'PM_A', 'PM_B', 'MEMBER'], ['add'])
    case 'projects/[id]': case 'projects/[id]:tab': case 'projects/[id]:settings': case 'projects/[id]:workstreams': {
      // Admin/PM: semua project; Project Officer: project tempat ia punya task; Guest tanpa task: tidak.
      const m = only(['ADMIN', 'PM_A', 'PM_B', 'MEMBER'])
      if (key === 'projects/[id]') { m.ADMIN.actions = m.PM_A.actions = ['suggest']; m.MEMBER.actions = ['suggest'] }
      if (key === 'projects/[id]:settings') { m.ADMIN.actions = ['edit', 'suggest']; m.PM_A.actions = ['suggest']; m.MEMBER.actions = ['suggest'] }
      if (key === 'projects/[id]:workstreams') { m.ADMIN.actions = m.PM_A.actions = ['add', 'suggest']; m.MEMBER.actions = ['suggest'] }
      if (key === 'projects/[id]:tab') { m.ADMIN.actions = m.PM_A.actions = m.MEMBER.actions = null }
      return m
    }
    case 'workstreams/new': return only(MANAGERS)
    case 'meetings/new': return only(['ADMIN', 'PM_A', 'PM_B', 'MEMBER'])
    case 'meetings/[id]': case 'meetings/[id]:tab': {
      const m = only(['ADMIN', 'PM_A', 'MEMBER'])
      // Tombol jadwal/selesai/batal hanya di halaman utama; tab hanya dibandingkan aksesnya.
      // COA: Project Officer kelola meeting di project tempat ia punya task.
      const manage = key === 'meetings/[id]' ? ['cancel', 'complete'] : null
      m.ADMIN.actions = manage
      m.PM_A.actions = manage
      m.MEMBER.actions = manage
      return m
    }
    case 'task-suggestions/new': return only(['ADMIN', 'PM_A', 'PM_B', 'MEMBER', 'VIEWER'])
    case 'task-suggestions/[id]': {
      const m = only(['ADMIN', 'PM_A', 'MEMBER'])
      m.ADMIN.actions = ['approve']
      m.PM_A.actions = ['approve']
      return m
    }
    case 'users': case 'users/[id]': case 'users/new': case 'projects/new': case 'master-reference': case 'settings/hr': case 'cuti/persetujuan':
      return only(['ADMIN'], null)
    case 'tracker/rekap': case 'clients': return only(['ADMIN', 'PM_A', 'PM_B', 'MEMBER'], null)
    default: throw new Error('tidak ada aturan untuk ' + key)
  }
}

// Kartu Portal per peran (Guest: Client Management ditahan sampai konfirmasi pemilik).
const ALL_CARDS = ['Project & Task', 'Meeting', 'Daily Tracker & HR', 'Cuti', 'Client Management', 'Admin & Sistem']
const CARDS = { ADMIN: ALL_CARDS, PM_A: ALL_CARDS, PM_B: ALL_CARDS, MEMBER: ALL_CARDS, VIEWER: ALL_CARDS.filter((c) => c !== 'Client Management') }

const SHOT_DIR = path.join(OUT_DIR, 'portal-shots')
const SHOT_VIEWS = [
  { name: 'hp390', opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'laptop1366', opts: { viewport: { width: 1366, height: 768 } } },
]

/** Kartu aplikasi yang tampil di Portal dibandingkan dengan CARDS[role]. */
async function portalCards(page, role) {
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle', timeout: 45000 })
  const seen = await page.locator('main ul li a .font-heading').allInnerTexts()
  const want = CARDS[role]
  const mismatch = JSON.stringify(seen) === JSON.stringify(want) ? [] : [`kartu: seharusnya ${want.join(', ')}; nyata ${seen.join(', ')}`]
  return { page: 'portal:kartu', path: '/portal', role, observed: seen.join(' | '), actions: [], mismatch, texts: seen }
}

async function probe(page, role, label, path, ruleKey) {
  const want = intended(ruleKey ?? label)
  let navError = ''
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => { navError = e.message.slice(0, 100); return null })
  const u = new URL(page.url())
  const reqPath = path.split('?')[0]
  const body = await page.locator('body').innerText().catch(() => '')
  let observed
  if (navError) observed = 'ERR ' + navError
  else if (u.pathname !== reqPath) observed = `redirect ${u.pathname}${u.search}`
  // Halaman streaming bisa mengirim status 200 walau isinya 404, jadi cek teksnya juga.
  else if (res?.status() === 404 || /This page could not be found/i.test(body)) observed = '404'
  else if (/tidak punya izin/i.test(body)) observed = 'pesan izin'
  else observed = 'boleh'
  const texts = await page.locator('main button, main a').evaluateAll((els) => els.map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean)).catch(() => [])
  const actions = [...new Set(texts.map(catOf).filter(Boolean))].sort()
  const access = observed === 'boleh' ? 'ALLOW' : 'DENY'
  const exp = want[role]
  const mism = []
  if (access !== exp.access) mism.push(`akses: seharusnya ${exp.access}, nyata ${observed}`)
  if (access === 'ALLOW' && exp.actions) {
    const lack = exp.actions.filter((a) => !actions.includes(a))
    const opt = OPTIONAL[ruleKey ?? label] ?? []
    const extra = actions.filter((a) => !exp.actions.includes(a) && !opt.includes(a) && a !== 'delete-item')
    if (lack.length) mism.push(`aksi kurang: ${lack.join(',')}`)
    if (extra.length) mism.push(`aksi berlebih: ${extra.join(',')}`)
  }
  return ({ page: label, path: path.replace(/[0-9a-f-]{36}/g, '<id>'), role, observed, actions, mismatch: mism, texts: [...new Set(texts.map((t) => t.split('\n')[0].slice(0, 40)))] })
}

/* ---------- data uji ---------- */
const results = []
let cleanupResult
const browser = await loadPlaywright().chromium.launch({ headless: true })
try {
  const users = {
    PM_A: await makeUser(db, 'rbac-pma', 'PROJECT_MANAGER', `${P} PM A`),
    PM_B: await makeUser(db, 'rbac-pmb', 'PROJECT_MANAGER', `${P} PM B`),
    MEMBER: await makeUser(db, 'rbac-member', 'TEAM_MEMBER', `${P} Member`),
    VIEWER: await makeUser(db, 'rbac-viewer', 'VIEWER', `${P} Viewer`),
  }
  const adminProf = await ensureAdmin(db)
  const one = async (q) => { const { data, error } = await q.select('id').single(); if (error) throw new Error(error.message); return data.id }
  const pa = await one(db.from('projects').insert({ name: `${P} RBAC A`, status: 'ACTIVE', start_date: day(0), end_date: day(30) }))
  const pb = await one(db.from('projects').insert({ name: `${P} RBAC B`, status: 'ACTIVE', start_date: day(0), end_date: day(30) }))
  const must = async (q) => { const { error } = await q; if (error) throw new Error(error.message) }
  await must(db.from('project_managers').insert([{ project_id: pa, user_id: users.PM_A.id }, { project_id: pb, user_id: users.PM_B.id }]))
  await one(db.from('workstreams').insert({ project_id: pa, name: `${P} WS A` }))
  const task = await one(db.from('tasks').insert({ code: `T-UJI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, project_id: pa, title: `${P} Task A1`, assignee_id: users.MEMBER.id, created_by: adminProf.id, deadline: day(7) }))
  await one(db.from('tasks').insert({ code: `T-UJI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, project_id: pb, title: `${P} Task B1`, assignee_id: users.PM_B.id, created_by: adminProf.id, deadline: day(7) }))
  const sug = await one(db.from('task_suggestions').insert({ project_id: pa, title: `${P} Usulan`, description: 'uji rbac', suggested_by: users.MEMBER.id }))
  const meet = await one(db.from('meetings').insert({ title: `${P} Meeting A`, project_id: pa, status: 'SCHEDULED', meeting_date: day(1), start_time: '10:00', end_time: '11:00', organizer_id: users.PM_A.id, created_by: users.PM_A.id }))
  await must(db.from('meeting_participants').insert([{ meeting_id: meet, user_id: users.PM_A.id, is_organizer: true }, { meeting_id: meet, user_id: users.MEMBER.id, is_organizer: false }]))

  /* ---------- halaman yang diuji ---------- */
  const pages = [
    ['dashboard', '/dashboard'], ['tasks', '/tasks'], ['tasks/[id]', `/tasks/${task}`], ['tasks/new', '/tasks/new'],
    ['projects', '/projects'],
    ...['', '?tab=tasks', '?tab=workstreams', '?tab=meetings', '?tab=activity', '?tab=members', '?tab=settings'].map((t) => ['projects/[id]' + (t ? ' ' + t : ''), `/projects/${pa}${t}`, 'projects/[id]' + (t === '?tab=settings' ? ':settings' : t === '?tab=workstreams' ? ':workstreams' : t ? ':tab' : '')]),
    ['workstreams/new', `/workstreams/new?project=${pa}`],
    ['meetings', '/meetings'], ['meetings/new', '/meetings/new'],
    ...['', '?tab=agenda', '?tab=notes', '?tab=decisions', '?tab=actions'].map((t) => ['meetings/[id]' + (t ? ' ' + t : ''), `/meetings/${meet}${t}`, t ? 'meetings/[id]:tab' : 'meetings/[id]']),
    ['task-suggestions', '/task-suggestions'], ['task-suggestions/new', `/task-suggestions/new?project=${pa}`], ['task-suggestions/[id]', `/task-suggestions/${sug}`],
    ['activity', '/activity'], ['users', '/users'], ['users/[id]', `/users/${users.MEMBER.id}`], ['users/new', '/users/new'],
    ['notifications', '/notifications'], ['profile', '/profile'],
    // Portal dan URL halaman berizin (COA): dibuka langsung, harus ditolak bila tak berizin.
    ['portal', '/portal'], ['projects/new', '/projects/new'], ['tracker/rekap', '/tracker/rekap'], ['master-reference', '/master-reference'],
    ['settings/hr', '/settings/hr'], ['cuti/persetujuan', '/cuti/persetujuan'], ['clients', '/clients'],
  ]

  // Satu role sekali jalan (RAM terbatas): konteks dibuka lalu ditutup per role.
  const rows = []
  for (const role of ROLES) {
    const c = await browser.newContext()
    const page = await c.newPage()
    page.on('dialog', (d) => d.accept())
    if (role === 'ADMIN') await loginAdmin(db, page)
    else await loginPassword(page, users[role])
    for (const [label, path, ruleKey] of pages) rows.push(await probe(page, role, label, path, ruleKey))
    rows.push(await portalCards(page, role))
    // Screenshot Portal per peran (HP dan laptop), memakai sesi yang sama.
    const state = await c.storageState()
    await c.close()
    for (const v of SHOT_VIEWS) {
      const sc = await browser.newContext({ ...v.opts, storageState: state })
      const sp = await sc.newPage()
      await sp.goto(BASE + '/portal', { waitUntil: 'networkidle', timeout: 45000 })
      fs.mkdirSync(SHOT_DIR, { recursive: true })
      await sp.screenshot({ path: path.join(SHOT_DIR, `portal_${role}_${v.name}.png`), fullPage: true })
      await sc.close()
    }
  }
  results.push(...rows)
} finally {
  await browser.close()
  cleanupResult = await runCleanup(db)
}

writeOut('rbac-result.json', { results, cleanup: cleanupResult.lines })
const bad = results.filter((r) => r.mismatch.length)
console.log(`diuji ${results.length} kombinasi halaman x role; ketidaksesuaian: ${bad.length}`)
for (const r of bad) console.log(`  ${r.role} ${r.page}: ${r.mismatch.join('; ')}`)
console.log('pembersihan: ' + cleanupResult.lines.at(-1))
process.exit(cleanupResult.ok ? 0 : 1)

// Uji manual docs/audit-ui-rbac.md bagian F yang belum tercakup e2e lain:
// F2 (A2), F4 (A4), F5 (A5), F6 (A6), F8 (A12), PM-PINDAH, A8.
// Semua data berawalan "UJI-E2E"; server WAJIB tanpa BREVO (guard di lib.mjs).
// Tidak ada tombol yang mengirim email/membuat link yang diklik (A8 hanya cek tampil).
// Pembersihan selalu jalan di finally.
import {
  guard, serviceClient, loadPlaywright, loginAdmin, loginPassword, makeUser,
  runCleanup, writeOut, BASE, PREFIX as P, day,
} from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const DENIED = 'Anda tidak punya izin untuk melakukan aksi ini.'

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
try {
  // Satu context per sesi, ditutup sesudah dipakai (RAM sempit).
  const session = async (user) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('dialog', (d) => d.accept())
    if (user === 'admin') await loginAdmin(db, page)
    else await loginPassword(page, user)
    return { context, page }
  }
  const go = (page, path) => page.goto(BASE + path, { waitUntil: 'networkidle' })
  const optionValues = (page, sel) => page.locator(`${sel} option`).evaluateAll((os) => os.map((o) => o.value))
  const mkTask = async (title, projectId, assignee, createdBy) => {
    const { data, error } = await db.from('tasks').insert({
      code: `T-UJI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: `${P} ${title}`, project_id: projectId,
      assignee_id: assignee, created_by: createdBy, priority: 'MEDIUM', status: 'TODO', deadline: day(7),
    }).select('id').single()
    if (error) throw new Error(title + ': ' + error.message)
    return data.id
  }
  const mkProject = async (name, pmIds) => {
    const { data, error } = await db.from('projects').insert({ name: `${P} ${name}`, status: 'ACTIVE', start_date: day(-5), end_date: day(30) }).select('id').single()
    if (error) throw new Error(name + ': ' + error.message)
    const { error: me } = await db.rpc('set_project_managers', { p_project_id: data.id, p_user_ids: pmIds })
    if (me) throw new Error('pm ' + name + ': ' + me.message)
    return data.id
  }

  const pmx = await makeUser(db, 'pmx', 'PROJECT_MANAGER', `${P} PM X`)
  const pmy = await makeUser(db, 'pmy', 'PROJECT_MANAGER', `${P} PM Y`)
  const mem = await makeUser(db, 'member', 'TEAM_MEMBER', `${P} Member`)
  const inv = await makeUser(db, 'inv', 'TEAM_MEMBER', `${P} Invited`)
  const old = await makeUser(db, 'pmold', 'PROJECT_MANAGER', `${P} PM Lama`)

  const projY = await mkProject('Project Y', [pmy.id])
  const projA = await mkProject('Project A', [pmx.id])
  const projS = await mkProject('Project PM Nonaktif', [old.id, pmx.id])
  const { data: mtg, error: mErr } = await db.from('meetings').insert({
    title: `${P} Meeting Y`, project_id: projY, meeting_type: 'INTERNAL_MEETING', status: 'SCHEDULED',
    meeting_date: day(3), start_time: '09:00', end_time: '10:00', organizer_id: pmy.id, created_by: pmy.id,
  }).select('id').single()
  if (mErr) throw new Error('meeting: ' + mErr.message)
  const { error: ppe } = await db.from('meeting_participants').insert([
    { meeting_id: mtg.id, user_id: pmy.id, is_organizer: true },
    { meeting_id: mtg.id, user_id: pmx.id, is_organizer: false },
    { meeting_id: mtg.id, user_id: mem.id, is_organizer: false },
  ])
  if (ppe) throw new Error('peserta: ' + ppe.message)
  const tY = await mkTask('F4 task project Y untuk PM X', projY, pmx.id, pmy.id)
  const tA = await mkTask('PINDAH task project A', projA, mem.id, pmx.id)

  // F2 (A2). Pemilik MENERIMA perilaku ini sebagai desain (docs A2: DITERIMA, 8 Nov 2026):
  // PM peserta memang kelola penuh. Cek ini mengunci perilaku itu; member peserta jadi kontrol negatif.
  {
    const { context, page } = await session(pmx)
    await go(page, `/meetings/${mtg.id}`)
    check('F2 halaman meeting terbuka untuk PM X (peserta)', (await page.locator('h1').allInnerTexts()).join(' ').includes(P))
    const full = (await page.getByRole('button', { name: 'Selesaikan Meeting' }).count()) > 0
    const cancel = (await page.getByRole('button', { name: 'Batalkan Meeting' }).count()) > 0
    const del = (await page.getByRole('button', { name: 'Hapus', exact: true }).count()) > 0
    check('F2 [A2 diterima sesuai desain] PM peserta melihat Selesaikan/Batalkan/Hapus peserta', full && cancel && del, `selesai=${full} batal=${cancel} hapus=${del}`)
    await context.close()
    const m = await session(mem)
    await go(m.page, `/meetings/${mtg.id}`)
    const mFull = await m.page.getByRole('button', { name: /Selesaikan Meeting|Batalkan Meeting/ }).count()
    const mDel = await m.page.getByRole('button', { name: 'Hapus', exact: true }).count()
    check('F2 kontrol: Team Member peserta tidak melihat Selesaikan/Batalkan/Hapus peserta', mFull === 0 && mDel === 0, `lifecycle=${mFull} hapus=${mDel}`)
    await m.context.close()
  }

  // F4 (A4)
  {
    const { context, page } = await session(pmx)
    const res = await page.goto(`${BASE}/tasks/${tY}`, { waitUntil: 'networkidle' })
    const h1 = (await page.locator('h1').allInnerTexts()).join(' ')
    check('F4 PM yang di-assign task di project lain bisa membuka /tasks/<id>', res?.status() === 200 && h1.includes(`${P} F4`), `HTTP ${res?.status()} h1=${h1}`)
    check('F4 bukan halaman 404', !(await page.locator('body').innerText()).match(/404|could not be found|tidak ditemukan/i))
    // Bukan PM project itu: form Ubah Task penuh tidak tampil.
    check('F4 form "Ubah Task" tidak tampil (bukan PM project Y)', (await page.locator('#task_project').count()) === 0)
    await context.close()
  }

  // PM-PINDAH
  {
    const { context, page } = await session(pmx)
    await go(page, `/tasks/${tA}`)
    const vals = await optionValues(page, '#task_project')
    check('PM-PINDAH form edit memuat project sendiri', vals.includes(projA), vals.join(','))
    check('PM-PINDAH pilihan project B (tidak dikelola) tidak tersedia', !vals.includes(projY), vals.join(','))
    const reqP = page.waitForRequest((r) => r.method() === 'POST' && !!r.headers()['next-action'], { timeout: 20000 })
    await page.locator('form:has(#task_project)').getByRole('button', { name: 'Simpan Perubahan' }).click()
    const rec = await reqP
    await page.waitForTimeout(2500)
    const h = rec.headers()
    const orig = rec.postData() ?? ''
    // Body multipart: ganti hanya nilai field project_id.
    const body = orig.replace(/(name="(?:_\d+_)?project_id"\r?\n\r?\n)[^\r\n]*/, `$1${projY}`)
    check('PM-PINDAH rekaman memuat project_id yang bisa diganti', body !== orig && body.includes(projY))
    const res = await context.request.post(rec.url(), {
      headers: { 'next-action': h['next-action'], 'content-type': h['content-type'], accept: h.accept ?? 'text/x-component' },
      data: body,
    })
    const text = await res.text()
    check('PM-PINDAH server action dengan project_id B ditolak', text.includes(DENIED), `HTTP ${res.status()}`)
    const { data: row } = await db.from('tasks').select('project_id').eq('id', tA).single()
    check('PM-PINDAH project_id task di DB tidak berubah', row?.project_id === projA, row?.project_id)
    await context.close()
  }

  // F5 (A5): login saat ACTIVE, baru dijadikan INVITED lewat service role.
  {
    const { context, page } = await session(inv)
    const { error } = await db.from('profiles').update({ status: 'INVITED' }).eq('id', inv.id)
    if (error) throw new Error('set INVITED: ' + error.message)
    let navs = 0
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++ })
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'load' }).catch(() => {})
    await page.waitForTimeout(4000)
    const path = new URL(page.url()).pathname
    check('F5 INVITED membuka /dashboard diarahkan ke /accept-invite', path === '/accept-invite', page.url())
    check('F5 tanpa loop redirect (navigasi utama <= 4 dalam 4 dtk)', navs <= 4, `navigasi=${navs}`)
    await context.close()
  }

  // F6 (A6), A8, F8 sebagai admin
  {
    const { context, page } = await session('admin')
    const adminId = (await db.from('profiles').select('id').eq('email', 'uji-e2e-admin@example.com').single()).data?.id

    await go(page, `/users/${pmx.id}`)
    const sv = await optionValues(page, '#edit_status')
    check('F6 Edit User: tidak ada opsi INVITED (user ACTIVE)', sv.length > 0 && !sv.includes('INVITED'), sv.join(','))
    check('A8 user ACTIVE: tombol "Link reset Password" tampil', (await page.getByRole('button', { name: 'Link reset Password' }).count()) === 1)

    await go(page, `/users/${inv.id}`)
    check('A8 user INVITED: tombol "Link undangan baru" tampil', (await page.getByRole('button', { name: 'Link undangan baru' }).count()) === 1)
    check('F6 user INVITED: status terkunci (select disabled)', await page.locator('#edit_status').isDisabled())

    await go(page, `/users/${adminId}`)
    check('F6 admin tidak bisa mengubah status dirinya (select disabled)', await page.locator('#edit_status').isDisabled())
    check('F6 admin: tombol Nonaktifkan untuk diri sendiri tidak tampil', (await page.getByRole('button', { name: /^(Nonaktifkan|Aktifkan)$/ }).count()) === 0)
    check('F6 admin: catatan "tidak dapat mengubah status Anda sendiri" tampil', (await page.locator('main').innerText()).includes('tidak dapat mengubah status Anda sendiri'))

    // F8 (A12): PM lama jadi INACTIVE sesudah ditugaskan.
    const { error } = await db.from('profiles').update({ status: 'INACTIVE' }).eq('id', old.id)
    if (error) throw new Error('set INACTIVE: ' + error.message)
    await go(page, `/projects/${projS}?tab=settings`)
    const main = await page.locator('main').innerText()
    check('F8 Settings: PM nonaktif tampil dengan penanda "No longer active"', main.includes('No longer active') && main.includes(`${P} PM Lama`), main.match(/No longer active[^\n]*/)?.[0])
    const { data: links } = await db.from('project_managers').select('user_id').eq('project_id', projS)
    check('F8 PM nonaktif tidak hilang diam-diam dari DB sebelum disimpan', (links ?? []).some((l) => l.user_id === old.id), (links ?? []).length)
    await context.close()
  }
} catch (e) {
  check('EXC', false, e.message)
} finally {
  await browser.close()
  cleanupResult = await runCleanup(db)
}

writeOut('manual-f-result.json', { results, cleanup: cleanupResult.lines })
const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${r.name}${r.info ? ' :: ' + r.info : ''}`)
console.log(`cek: ${results.length - failed.length}/${results.length} lulus`)
console.log('pembersihan: ' + cleanupResult.lines.at(-1))
process.exit(failed.length === 0 && cleanupResult.ok ? 0 : 1)

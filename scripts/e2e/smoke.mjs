// Smoke test: login sebagai admin uji sementara, buka semua halaman, satu submit Create
// Task yang PASTI ditolak validasi (deadline < start date). Memakai project/user UJI-E2E
// buatan skrip (dihapus di finally), jadi data nyata tidak mungkin terbuat.
import { guard, serviceClient, loadPlaywright, loginAdmin, runCleanup, BASE, PREFIX, writeOut } from './lib.mjs'

await guard()
const db = serviceClient()
const out = { pages: [], consoleErrors: [], a13: null, login: null }
const browser = await loadPlaywright().chromium.launch({ headless: true })
const page = await browser.newPage()
const rel = () => page.url().replace(BASE, '')
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(`${rel()}: ${m.text().slice(0, 160)}`) })
page.on('pageerror', (e) => out.consoleErrors.push(`${rel()}: pageerror ${String(e).slice(0, 160)}`))

async function visit(path) {
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 60)}` }))
  const body = await page.locator('body').innerText().catch(() => '')
  const bad = /Application error|Something went wrong|This page could not be found|Internal Server Error/i.test(body)
  out.pages.push({ path, status: res?.status?.(), final: rel(), bad })
}
const firstHref = async (listPath, re) => {
  await page.goto(BASE + listPath, { waitUntil: 'networkidle' })
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  return hrefs.find((h) => re.test(h ?? ''))
}
const UUID = '[0-9a-f-]{36}'

try {
  const adminId = await loginAdmin(db, page)
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
  out.login = rel()
  if (!out.login.includes('dashboard')) throw new Error('login admin gagal: ' + out.login)

  for (const p of ['/dashboard', '/tasks', '/tasks?view=overdue', '/projects', '/meetings', '/task-suggestions', '/activity', '/activity?entity=meeting&actor=a', '/users', '/notifications', '/profile', '/tasks/new', '/meetings/new', '/task-suggestions/new']) await visit(p)
  const proj = await firstHref('/projects', new RegExp(`^/projects/${UUID}$`))
  if (proj) {
    for (const t of ['', '?tab=tasks', '?tab=workstreams', '?tab=meetings', '?tab=activity', '?tab=members', '?tab=settings']) await visit(proj + t)
    await visit(`/workstreams/new?project=${proj.split('/').pop()}`)
  }
  const task = await firstHref('/tasks', new RegExp(`^/tasks/${UUID}$`))
  if (task) await visit(task)
  const mtg = await firstHref('/meetings', new RegExp(`^/meetings/${UUID}$`))
  if (mtg) for (const t of ['', '?tab=agenda', '?tab=notes', '?tab=decisions', '?tab=actions', '?tab=activity']) await visit(mtg + t)
  const usr = await firstHref('/users', new RegExp(`^/users/${UUID}$`))
  if (usr) await visit(usr)
  const sug = await firstHref('/task-suggestions', new RegExp(`^/task-suggestions/${UUID}$`))
  if (sug) await visit(sug)

  // A13: submit ditolak validasi server; isian harus tetap ada.
  const { data: ujiProject, error: pe } = await db.from('projects').insert({ name: `${PREFIX} smoke project`, status: 'ACTIVE' }).select('id').single()
  if (pe) throw new Error('project uji: ' + pe.message)
  await page.goto(BASE + '/tasks/new', { waitUntil: 'networkidle' })
  const title = `${PREFIX} smoke - jangan disimpan`
  // Dibatasi ke form: role="alert" di level halaman juga dipakai route announcer Next.
  const form = page.locator('form:has(#task_title)')
  await form.locator('#task_title').fill(title)
  await form.locator('select[name="project_id"]').selectOption(ujiProject.id)
  await form.locator('select[name="assignee_id"]').selectOption(adminId)
  await form.locator('input[name="start_date"]').fill('2026-12-10')
  await form.locator('input[name="deadline"]').fill('2026-12-01')
  await form.locator('button[type="submit"]').click()
  await form.locator('[role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {})
  out.a13 = {
    alert: (await form.locator('[role="alert"]').first().innerText().catch(() => '')).slice(0, 120),
    titleKept: (await form.locator('#task_title').inputValue().catch(() => '')) === title,
    url: rel(),
  }
} finally {
  await browser.close()
  const c = await runCleanup(db)
  out.cleanup = c.lines.at(-1)
  out.cleanupOk = c.ok
}

writeOut('smoke-result.json', out)
const bad = out.pages.filter((p) => p.bad || p.status !== 200)
const a13ok = out.a13 && out.a13.alert && out.a13.titleKept
console.log(out.cleanup)
console.log(`halaman: ${out.pages.length}, bermasalah: ${bad.length}, console error: ${out.consoleErrors.length}, A13 ${a13ok ? 'OK' : 'GAGAL'}`)
for (const p of bad) console.log(`  ${p.path} -> ${p.status} ${p.final}${p.bad ? ' [halaman error]' : ''}`)
process.exit(bad.length === 0 && a13ok && out.cleanupOk ? 0 : 1)

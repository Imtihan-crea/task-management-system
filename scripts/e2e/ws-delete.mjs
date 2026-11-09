// Hapus Workstream lewat klik (dialog konfirmasi diterima) benar-benar menghapus baris.
// Regresi 8 Nov 2026: onSubmit lokal menimpa onSubmit useFormAction, action tidak terpanggil.
import { guard, serviceClient, loadPlaywright, loginAdmin, runCleanup, BASE, PREFIX } from './lib.mjs'
await guard()
const db = serviceClient()
const browser = await loadPlaywright().chromium.launch({ headless: true })
const page = await browser.newPage()
let ok = false
try {
  await loginAdmin(db, page)
  const { data: p, error: pe } = await db.from('projects').insert({ name: `${PREFIX} ws-del`, status: 'ACTIVE' }).select('id').single()
  if (pe) throw pe
  const { data: w, error: we } = await db.from('workstreams').insert({ project_id: p.id, name: `${PREFIX} ws hapus` }).select('id').single()
  if (we) throw we
  await page.goto(`${BASE}/projects/${p.id}?tab=workstreams`, { waitUntil: 'networkidle' })
  page.once('dialog', (d) => d.accept())
  await page.locator(`form:has(input[name="id"][value="${w.id}"]) button[type="submit"]`).filter({ hasText: /^Hapus$/ }).click()
  for (let i = 0; i < 20 && !ok; i++) {
    await page.waitForTimeout(500)
    const { data } = await db.from('workstreams').select('id').eq('id', w.id)
    ok = (data ?? []).length === 0
  }
} finally {
  await browser.close()
  const c = await runCleanup(db)
  console.log(c.lines.at(-1))
}
console.log('hapus workstream lewat klik:', ok ? 'LULUS' : 'GAGAL')
process.exit(ok ? 0 : 1)

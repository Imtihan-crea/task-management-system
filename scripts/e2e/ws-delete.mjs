// Hapus Workstream lewat klik (dialog konfirmasi diterima) benar-benar menghapus baris.
// Regresi 8 Nov 2026: onSubmit lokal menimpa onSubmit useFormAction, action tidak terpanggil.
import { guard, serviceClient, loadPlaywright, loginAdmin, runCleanup, BASE, PREFIX } from './lib.mjs'
await guard()
const db = serviceClient()
const browser = await loadPlaywright().chromium.launch({ headless: true })
const page = await browser.newPage()
let ok = false
let okBaru = false
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
  // Kode tidak bentrok setelah hapus Workstream non-terakhir: tambah B, C (kode A sudah dihapus di atas),
  // hapus B, lalu buat lewat UI -> harus sukses (trigger lama count+1 akan bentrok dengan C).
  const mk = (n) => db.from('workstreams').insert({ project_id: p.id, name: `${PREFIX} ws ${n}` }).select('id').single()
  const { data: b } = await mk('b'); await mk('c')
  await db.from('workstreams').delete().eq('id', b.id)
  await page.goto(`${BASE}/workstreams/new?project=${p.id}`, { waitUntil: 'networkidle' })
  await page.locator('input[name="name"]').fill(`${PREFIX} ws baru`)
  await page.getByRole('button', { name: 'Buat Workstream' }).click()
  for (let i = 0; i < 20 && !okBaru; i++) {
    await page.waitForTimeout(500)
    const { data } = await db.from('workstreams').select('id').eq('project_id', p.id).eq('name', `${PREFIX} ws baru`)
    okBaru = (data ?? []).length === 1
  }
} finally {
  await browser.close()
  const c = await runCleanup(db)
  console.log(c.lines.at(-1))
}
console.log('hapus workstream lewat klik:', ok ? 'LULUS' : 'GAGAL')
console.log('buat workstream setelah hapus non-terakhir:', okBaru ? 'LULUS' : 'GAGAL')
process.exit(ok && okBaru ? 0 : 1)

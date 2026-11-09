/**
 * Uji lib/utils/paginate.ts — allRows (halaman 1000, error dilempar).
 * Jalankan: npm run test:paginate
 */
import { allRows } from '../lib/utils/paginate'

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

// Sumber palsu dengan n baris; mencatat rentang yang diminta.
function sumber(n: number, errorDiHalaman = -1) {
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    if (calls.length - 1 === errorDiHalaman) return { data: null, error: { message: 'boom' } }
    const rows = []
    for (let i = from; i <= Math.min(to, n - 1); i++) rows.push(i)
    return { data: rows, error: null }
  }
  return { page, calls }
}

async function main() {
  for (const [n, halaman] of [[0, 1], [1, 1], [999, 1], [1000, 2], [1001, 2], [2500, 3], [3000, 4]] as const) {
    const s = sumber(n)
    const rows = await allRows<number>(s.page)
    cek(`n=${n} jumlah baris`, rows.length, n)
    cek(`n=${n} urut tanpa duplikat`, rows.every((v, i) => v === i), true)
    cek(`n=${n} jumlah halaman`, s.calls.length, halaman)
  }
  const s = sumber(2500)
  await allRows(s.page)
  cek('rentang from/to', s.calls, [[0, 999], [1000, 1999], [2000, 2999]])

  const e = sumber(2500, 1)
  let pesan = ''
  await allRows(e.page).catch((x: Error) => { pesan = x.message })
  cek('error dilempar dengan pesan', pesan, '[cron:meetings] query gagal: boom')
  cek('berhenti di halaman error', e.calls.length, 2)

  const nul = await allRows<number>(async () => ({ data: null, error: null }))
  cek('data null = kosong', nul, [])

  console.log(`LULUS: ${ok}`)
  console.log(`GAGAL: ${gagal}`)
  if (gagal > 0) process.exit(1)
}
main()

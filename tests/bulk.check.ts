/**
 * Uji lib/bulk.ts — aksi massal: batas & validasi id, ringkasan hasil,
 * item tak berizin dilewati (bukan menghentikan semua), export terpilih.
 * Jalankan: npm run test:bulk
 */
import { BULK_MAX, onlySelected, parseBulkIds, readInput, runBulk, selectedIds, summarizeBulk, toForm } from '../lib/bulk'

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

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

async function main() {
  // parseBulkIds: input klien tidak tepercaya.
  cek('bukan array', parseBulkIds('a'), 'Pilih minimal satu item.')
  cek('kosong', parseBulkIds([]), 'Pilih minimal satu item.')
  cek('isi bukan string', parseBulkIds([1]), 'Pilihan tidak valid.')
  cek('karakter aneh (injeksi filter)', parseBulkIds(['a,b']), 'Pilihan tidak valid.')
  cek('duplikat dibuang', parseBulkIds([uuid(1), uuid(1), uuid(2)]), [uuid(1), uuid(2)])
  cek('tepat batas', (parseBulkIds(Array.from({ length: BULK_MAX }, (_, i) => uuid(i))) as string[]).length, BULK_MAX)
  cek('lewat batas', parseBulkIds(Array.from({ length: BULK_MAX + 1 }, (_, i) => uuid(i))), `Maksimal ${BULK_MAX} item sekali proses. Kurangi pilihan.`)
  cek('batas khusus', parseBulkIds([uuid(1), uuid(2)], 1), 'Maksimal 1 item sekali proses. Kurangi pilihan.')

  // readInput
  cek('input string', readInput({ status: 'TODO' }, 'status'), 'TODO')
  cek('input bukan string', readInput({ status: 5 }, 'status'), '')
  cek('input null', readInput(null, 'status'), '')

  // toForm
  const fd = toForm({ id: 'x', kosong: null, pm: ['a', 'b'] })
  cek('toForm nilai', fd.get('id'), 'x')
  cek('toForm null jadi kosong', fd.get('kosong'), '')
  cek('toForm array berulang', fd.getAll('pm'), ['a', 'b'])

  // summarizeBulk
  cek('semua berhasil', summarizeBulk([{ success: 'ok' }, undefined]), { ok: 2, skipped: 0, message: '2 berhasil.', tone: 'success' })
  cek(
    'sebagian dilewati, alasan dikelompokkan',
    summarizeBulk([{ success: 'ok' }, { error: 'Tidak punya izin.' }, { error: 'Tidak punya izin.' }, { error: 'Task terkunci.' }]),
    { ok: 1, skipped: 3, message: '1 berhasil, 3 dilewati: Tidak punya izin (2); Task terkunci.', tone: 'warning' }
  )
  cek('semua gagal', summarizeBulk([{ error: 'X.' }]).tone, 'error')
  cek(
    'alasan > 3 diringkas',
    summarizeBulk([{ error: 'A' }, { error: 'B' }, { error: 'C' }, { error: 'D' }, { error: 'E' }]).message,
    '0 berhasil, 5 dilewati: A; B; C; 2 alasan lain.'
  )
  cek('kata kerja', summarizeBulk([{}], 'dibatalkan').message, '1 dibatalkan.')

  // runBulk: item tak berizin dilewati, item lain tetap jalan, urutan berurutan.
  const izin = new Set([uuid(1), uuid(3)])
  const urutan: string[] = []
  const r = await runBulk([uuid(1), uuid(2), uuid(3)], async (id) => {
    urutan.push(id)
    return izin.has(id) ? { success: 'ok' } : { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  })
  cek('runBulk ringkasan', r.message, '2 berhasil, 1 dilewati: Anda tidak punya izin untuk melakukan aksi ini.')
  cek('runBulk berurutan', urutan, [uuid(1), uuid(2), uuid(3)])

  const err = await runBulk([uuid(1), uuid(2)], async (id) => {
    if (id === uuid(1)) throw new Error('db putus')
    return { success: 'ok' }
  })
  cek('error satu item tidak menghentikan', [err.ok, err.skipped], [1, 1])

  let diteruskan = false
  try {
    await runBulk([uuid(1)], async () => {
      throw new Error('NEXT_REDIRECT')
    }, { rethrow: (e) => { if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e } })
  } catch {
    diteruskan = true
  }
  cek('redirect diteruskan', diteruskan, true)

  cek('runBulk id tidak valid tidak memanggil fn', (await runBulk('x', async () => { throw new Error('dipanggil') })).message, 'Pilih minimal satu item.')

  // Export terpilih
  cek('tanpa ids = semua', selectedIds(new URLSearchParams('format=pdf')), null)
  const pilih = selectedIds(new URLSearchParams(`ids=${uuid(1)},${uuid(3)},bad id`))!
  cek('ids disaring', [...pilih], [uuid(1), uuid(3)])
  cek('onlySelected', onlySelected([{ id: uuid(1) }, { id: uuid(2) }, { id: uuid(3) }], pilih).length, 2)
  cek('onlySelected null', onlySelected([{ id: uuid(1) }], null).length, 1)
  cek('onlySelected idOf', onlySelected([{ user_id: uuid(3) }], pilih, (r) => r.user_id).length, 1)

  console.log(`bulk: ${ok} lulus, ${gagal} gagal`)
  if (gagal > 0) process.exit(1)
}

main()

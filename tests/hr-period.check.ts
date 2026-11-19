/**
 * Uji lib/hr/period.ts + pengelompokan klien (breakdown 'client').
 * Jalankan: npm run test:hr-period
 */
import { MAX_RANGE_DAYS, parsePeriod, periodSummary, weekFromKey, weekKey } from '../lib/hr/period'
import { DEFAULT_RULES, NO_CLIENT, breakdown, workingDays, type LogRow } from '../lib/hr/tracker'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}
const TODAY = '2026-11-19'
const p = (i: Parameters<typeof parsePeriod>[0]) => parsePeriod(i, TODAY)

// Minggu ISO
cek('W47 2026 = 16-22 Nov', [p({ periode: 'minggu', minggu: '2026-W47' }).period.from, p({ periode: 'minggu', minggu: '2026-W47' }).period.to], ['2026-11-16', '2026-11-22'])
cek('W01 2026 mulai 29 Des 2025 (lintas tahun)', weekFromKey('2026-W01'), '2025-12-29')
cek('W53 2026 sah (2026 punya 53 minggu)', weekFromKey('2026-W53'), '2026-12-28')
cek('W53 2025 tidak ada', weekFromKey('2025-W53'), null)
cek('W00 / W54 / format salah ditolak', [weekFromKey('2026-W00'), weekFromKey('2026-W54'), weekFromKey('2026-47')], [null, null, null])
cek('weekKey 1 Jan 2027 masuk W53 2026', weekKey('2027-01-01'), '2026-W53')
cek('minggu tanpa nilai = minggu ini', p({ periode: 'minggu' }).period.query.minggu, '2026-W47')
cek('minggu sebelum W01 2026 -> W52 2025', p({ periode: 'minggu', minggu: '2026-W01' }).period.prev.minggu, '2025-W52')
cek('minggu sah tanpa error', p({ minggu: '2026-W10' }).error, null)
cek('minggu tak sah -> error + bulan ini', [p({ periode: 'minggu', minggu: '2025-W53' }).error !== null, p({ periode: 'minggu', minggu: '2025-W53' }).period.mode], [true, 'bulan'])

// Bulan, termasuk URL lama
const lama = p({ bulan: '2026-02' })
cek('?bulan= lama', [lama.period.mode, lama.period.from, lama.period.to, lama.period.month, lama.error], ['bulan', '2026-02-01', '2026-02-28', '2026-02', null])
cek('tanpa param = bulan ini', p({}).period.month, '2026-11')
cek('bulan tak sah -> error', p({ bulan: '2026-13' }).error !== null, true)
cek('bulan prev/next lintas tahun', [p({ bulan: '2026-01' }).period.prev.bulan, p({ bulan: '2026-12' }).period.next.bulan], ['2025-12', '2027-01'])

// Rentang
const r = p({ periode: 'rentang', dari: '2026-11-01', sampai: '2026-11-15' })
cek('rentang sah', [r.period.mode, r.period.from, r.period.to, r.period.month, r.error], ['rentang', '2026-11-01', '2026-11-15', null, null])
cek('rentang tanpa periode (dari+sampai)', p({ dari: '2026-11-01', sampai: '2026-11-15' }).period.mode, 'rentang')
cek('rentang = satu bulan penuh -> month', p({ periode: 'rentang', dari: '2026-11-01', sampai: '2026-11-30' }).period.month, '2026-11')
cek('rentang terbalik ditolak', p({ periode: 'rentang', dari: '2026-11-15', sampai: '2026-11-01' }).error !== null, true)
cek('rentang 366 hari sah', p({ periode: 'rentang', dari: '2026-01-01', sampai: '2027-01-01' }).error, null)
cek('rentang 367 hari ditolak', p({ periode: 'rentang', dari: '2026-01-01', sampai: '2027-01-02' }).error, `Rentang maksimal ${MAX_RANGE_DAYS} hari.`)
cek('tanggal mustahil ditolak', p({ periode: 'rentang', dari: '2026-02-30', sampai: '2026-03-05' }).error !== null, true)
cek('rentang kurang salah satu ditolak', p({ periode: 'rentang', dari: '2026-11-01' }).error !== null, true)
cek('rentang geser sepanjang rentang', [r.period.prev.dari, r.period.prev.sampai, r.period.next.dari, r.period.next.sampai], ['2026-10-17', '2026-10-31', '2026-11-16', '2026-11-30'])

// Target rentang dengan libur: 1-15 Nov 2026 = 10 hari kerja (Sen-Jum) minus 1 libur Rabu 4 Nov = 9
const cal = [{ day: '2026-11-04', kind: 'HOLIDAY' as const }]
const wd = workingDays('2026-11-01', '2026-11-15', cal).length
cek('hari kerja rentang minus libur', wd, 9)
const log = (date: string, min: number, client?: string | null): LogRow => ({ user_id: 'u', work_date: date, project_name: 'P', category: 'K', duration_minutes: min, client })
const logs = [log('2026-11-02', 8 * 60 * 9)] // 72 jam = tepat target 9 x 8
const sr = periodSummary(r.period, logs, wd, DEFAULT_RULES, 999, 0)
cek('target rentang = hari kerja x 8; target terkunci diabaikan', [sr.targetHours, sr.effectiveness, sr.status], [72, 100, 'SESUAI'])
const bulanPenuh = p({ periode: 'bulan', bulan: '2026-11' }).period
cek('bulan penuh memakai target terkunci', periodSummary(bulanPenuh, logs, 20, DEFAULT_RULES, 100, 0).targetHours, 100)
cek('cuti mengurangi target bila aturan menyala', periodSummary(r.period, logs, wd, { ...DEFAULT_RULES, leaveReducesTarget: true }, null, 2).targetHours, 56)
const minggu = p({ periode: 'minggu', minggu: '2026-W47' }).period
cek('minggu memakai ambang mingguan (36 jam = SESUAI bukan KURANG)', periodSummary(minggu, [log('2026-11-16', 36 * 60)], 5, DEFAULT_RULES, 999, 0).status, 'SESUAI')
cek('rentang 5 hari kerja: 36 jam >= 5x7 = SESUAI', periodSummary(r.period, [log('2026-11-02', 36 * 60)], 5, DEFAULT_RULES, null, 0).status, 'SESUAI')

// Pengelompokan klien
const klien = breakdown(
  [log('2026-11-02', 120, 'Klien A'), log('2026-11-02', 60, ' Klien A '), log('2026-11-03', 30, 'Klien B'), log('2026-11-03', 30, null), log('2026-11-03', 30, ''), log('2026-11-03', 30, '   '), log('2026-11-03', 60)],
  'client'
)
cek('klien urut jam terbesar, kosong/spasi/null = Internal', klien.map((k) => [k.key, k.hours, k.percent]), [['Klien A', 3, 50], [NO_CLIENT, 2.5, 41.67], ['Klien B', 0.5, 8.33]])
cek('breakdown tanpa klien tetap jalan', breakdown([log('2026-11-02', 60)], 'project_name')[0].key, 'P')

console.log(`hr-period: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)

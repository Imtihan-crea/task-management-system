import { SPECIAL_KIND, SPECIAL_REASONS, type LeaveType } from '@/lib/hr/leave'

/** Penjelasan jenis bawaan (kode dari migrasi 026/027). Jenis buatan HR memakai penjelasan dari Master Reference. */
const GUIDE: Record<string, string> = {
  CUTI: 'Libur pribadi yang tetap digaji: liburan, mudik, urusan keluarga atau pribadi. Hak 12 hari kerja per tahun setelah bekerja 12 bulan (UU Ketenagakerjaan Pasal 79); jumlah per orang diisi HR. Izin pribadi yang dulu dicatat sebagai "Izin" kini masuk sini.',
  SAKIT: 'Tidak bisa bekerja karena sakit, termasuk berobat atau tindakan medis (mis. operasi gigi). Tetap digaji (Pasal 93). Lampirkan tautan surat dokter bila lebih dari 1 hari.',
  KHUSUS: 'Untuk peristiwa penting tertentu, tetap digaji. Pilih alasannya; lama maksimal sudah ditentukan:',
  TANPA_GAJI: 'Libur yang tidak digaji, bila jatah cuti lain tidak cocok atau sudah habis. Contoh: saldo Cuti Tahunan habis, merawat keluarga yang sakit lama, umrah, studi atau ujian, pindah rumah/kota, mengurus dokumen, atau istirahat panjang. Wajib disetujui atasan/HR.',
}

const yn = (b: boolean) => (b ? 'ya' : 'tidak')

/** Status per jenis: selalu dari Master Reference supaya sesuai pengaturan HR. */
const status = (t: LeaveType) =>
  `Dihitung jam kerja: ${yn(t.counts_hours)}. Memotong jatah cuti tahunan: ${yn(t.uses_quota)}. Batas: ${t.max_days ? `${t.max_days} hari kerja per pengajuan` : 'tidak ada batas khusus'}.`

/**
 * Panduan jenis cuti untuk karyawan dan penyetuju. Dasar: UU 13/2003 (Ketenagakerjaan)
 * jo. UU 6/2023 (Cipta Kerja) Pasal 79, 81, 82, 93; UU 4/2024 (KIA). Keputusan pemilik 19 Nov 2026.
 * `types` = jenis aktif (Master Reference); `jointUsesQuota` = aturan HR cuti bersama memotong jatah.
 */
export function LeaveGuide({ types, jointUsesQuota }: { types: LeaveType[]; jointUsesQuota: boolean }) {
  const counted = types.filter((t) => t.counts_hours).map((t) => t.label)
  const notCounted = types.filter((t) => !t.counts_hours).map((t) => t.label)
  return (
    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
      <details>
        <summary className="min-h-[44px] cursor-pointer text-lg font-bold">Panduan jenis cuti</summary>
        <div className="mt-3 space-y-4 text-sm leading-relaxed">
          {types.map((t) => (
            <div key={t.code}>
              <h3 className="font-semibold">{t.label}</h3>
              <p>{GUIDE[t.code] ?? t.description ?? ''}</p>
              {t.code === SPECIAL_KIND && (
                <>
                  <ul className="mt-1 list-disc pl-5">
                    {SPECIAL_REASONS.map((r) => (
                      <li key={r.value}>
                        {r.label}: {r.maxDays ? `maks ${r.maxDays} hari kerja` : `maks ${r.maxSpan} hari kalender`}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">Istri melahirkan/keguguran: 2 hari, dapat ditambah 3 hari sesuai kesepakatan (UU KIA). Melahirkan: 3 bulan, dapat diperpanjang 3 bulan dengan surat dokter (ajukan lagi).</p>
                </>
              )}
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{status(t)}</p>
            </div>
          ))}
          <div>
            <h3 className="font-semibold">Cuti bersama</h3>
            <p>
              Hari cuti bersama dari pemerintah ada di kalender kerja dan perusahaan ikut libur.{' '}
              {jointUsesQuota
                ? 'Seperti praktik umum perusahaan swasta, setiap hari cuti bersama (Senin–Jumat) memotong saldo cuti tahunan secara otomatis; tidak perlu diajukan.'
                : 'Menurut aturan HR saat ini, cuti bersama tidak memotong saldo cuti tahunan dan tidak perlu diajukan.'}
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Pengaruh ke Daily Tracker</h3>
            <p>
              {counted.length ? `Setiap hari ${counted.join(', ')} yang disetujui dihitung sebagai jam kerja penuh (jam per hari di Pengaturan HR, bawaan 8 jam).` : 'Tidak ada jenis cuti yang dihitung sebagai jam kerja.'}
              {notCounted.length ? ` ${notCounted.join(', ')} tidak dihitung.` : ''} Hari cuti tidak perlu diisi di Daily Tracker.
            </p>
          </div>
        </div>
      </details>
    </section>
  )
}

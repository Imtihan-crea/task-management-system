import { SPECIAL_REASONS } from '@/lib/hr/leave'

/**
 * Panduan jenis cuti untuk karyawan dan penyetuju. Dasar: UU 13/2003 (Ketenagakerjaan)
 * jo. UU 6/2023 (Cipta Kerja) Pasal 79, 81, 82, 93; UU 4/2024 (KIA). Keputusan pemilik 19 Nov 2026.
 */
export function LeaveGuide() {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <details>
        <summary className="min-h-[44px] cursor-pointer text-lg font-bold">Panduan jenis cuti</summary>
        <div className="mt-3 space-y-4 text-sm leading-relaxed">
          <div>
            <h3 className="font-semibold">Cuti Tahunan</h3>
            <p>Libur pribadi yang tetap digaji: liburan, mudik, urusan keluarga atau pribadi. Hak 12 hari kerja per tahun setelah bekerja 12 bulan (UU Ketenagakerjaan Pasal 79); jumlah per orang diisi HR. Memotong saldo cuti. Izin pribadi yang dulu dicatat sebagai &quot;Izin&quot; kini masuk sini.</p>
          </div>
          <div>
            <h3 className="font-semibold">Cuti bersama</h3>
            <p>Hari cuti bersama dari pemerintah ada di kalender kerja dan perusahaan ikut libur. Seperti praktik umum perusahaan swasta, setiap hari cuti bersama (Senin–Jumat) memotong saldo Cuti Tahunan secara otomatis; tidak perlu diajukan.</p>
          </div>
          <div>
            <h3 className="font-semibold">Cuti Sakit</h3>
            <p>Tidak bisa bekerja karena sakit, termasuk berobat atau tindakan medis (mis. operasi gigi). Tetap digaji (Pasal 93). Lampirkan tautan surat dokter bila lebih dari 1 hari. Tidak memotong saldo cuti.</p>
          </div>
          <div>
            <h3 className="font-semibold">Cuti Khusus</h3>
            <p>Untuk peristiwa penting tertentu, tetap digaji dan tidak memotong saldo cuti. Pilih alasannya; lama maksimal sudah ditentukan:</p>
            <ul className="mt-1 list-disc pl-5">
              {SPECIAL_REASONS.map((r) => (
                <li key={r.value}>
                  {r.label}: {r.maxDays ? `maks ${r.maxDays} hari kerja` : `maks ${r.maxSpan} hari kalender`}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">Istri melahirkan/keguguran: 2 hari, dapat ditambah 3 hari sesuai kesepakatan (UU KIA). Melahirkan: 3 bulan, dapat diperpanjang 3 bulan dengan surat dokter (ajukan lagi).</p>
          </div>
          <div>
            <h3 className="font-semibold">Cuti di Luar Tanggungan</h3>
            <p>Libur yang tidak digaji, bila jatah cuti lain tidak cocok atau sudah habis. Contoh: saldo Cuti Tahunan habis, merawat keluarga yang sakit lama, umrah, studi atau ujian, pindah rumah/kota, mengurus dokumen, atau istirahat panjang. Wajib disetujui atasan/HR.</p>
          </div>
          <div>
            <h3 className="font-semibold">Pengaruh ke Daily Tracker</h3>
            <p>Setiap hari Cuti Tahunan, Cuti Sakit, dan Cuti Khusus yang disetujui dihitung sebagai jam kerja penuh (jam per hari di Pengaturan HR, bawaan 8 jam). Cuti di Luar Tanggungan tidak dihitung. Hari cuti tidak perlu diisi di Daily Tracker.</p>
          </div>
        </div>
      </details>
    </section>
  )
}

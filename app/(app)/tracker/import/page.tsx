import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { ImportTrackerForm } from '@/components/tracker/ImportTrackerForm'

export default async function ImportTrackerPage() {
  await requirePermission('hr.manage')

  return (
    <AppShell>
      <Link href="/tracker/rekap" className="inline-flex min-h-[44px] items-center text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
        &larr; Kembali ke Rekap
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Import Histori Daily Tracker</h1>

      <div className="mt-4 rounded-2xl bg-white p-5 text-sm shadow dark:bg-zinc-900">
        <p>
          Format: file Excel dengan satu sheet per bulan bernama <b>Daily &lt;Bulan&gt;</b> (mis. Daily Oktober 26).
          Semua sheet berawalan &quot;Daily &quot; dibaca, kecuali Daily 2025, Daily 2026, dan Daily Sum. Baris 1 adalah judul
          kolom. Kolom A sampai M:
        </p>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          A Tanggal, B Minggu Ke- (diabaikan), C Nama, D Divisi (diabaikan), E Proyek, F Aktifitas, G Detail Pekerjaan,
          H Jam Mulai, I Jam Selesai, J Durasi (diabaikan, dihitung otomatis), K Lokasi, L Kategori Aktifitas, M
          Output/Deliverables.
        </p>
        <ul className="mt-2 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
          <li>Nama dicocokkan dengan nama di profil user. Bila ada nama yang tidak cocok, tidak ada yang disimpan dan daftar namanya ditampilkan.</li>
          <li>
            Proyek dicocokkan ke project TMS, lalu ke daftar Proyek di Master Reference; bila tidak ada, ditulis
            apa adanya sebagai teks bebas. Kategori dan Lokasi dicocokkan ke Master Reference dengan cara yang sama.
          </li>
          <li>
            Baris dilewati (dihitung per alasan) bila tanggal atau jam tidak valid, jam selesai tidak setelah jam
            mulai, tanggal di masa depan, Proyek kosong, atau jamnya bentrok dengan entri yang diisi di aplikasi.
            Selesai 00:00 dibaca tengah malam (24:00); Kategori/Lokasi kosong dicatat sebagai teks bebas.
          </li>
          <li>Jam yang tumpang tindih di dalam file tidak diperiksa: data disalin apa adanya supaya total jam sama dengan sheet.</li>
          <li>
            Import ulang aman: hanya entri hasil import sebelumnya pada tanggal yang ada di file yang diganti.
            Entri yang diisi atau diubah lewat aplikasi tidak pernah disentuh.
          </li>
          <li>
            Sheet <strong>Leave Form</strong> (bila ada) ikut diimport: catatan cuti/izin/sakit (izin dicatat sebagai Cuti Tahunan) masuk sebagai pengajuan
            yang sudah disetujui; tanggal masuk dan hak cuti hanya diisi bila di profil masih kosong.
          </li>
        </ul>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
        <ImportTrackerForm />
      </div>
    </AppShell>
  )
}

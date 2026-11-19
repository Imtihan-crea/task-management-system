import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { loadReferences } from '@/lib/hr/data'
import { buildImport, buildLeaveImport, datesByUser, dropAppOverlaps, rangesByUser, summarize, type AppEntry, type LeaveBuild, type SheetInput } from '@/lib/hr/import-tracker'
import { loadCalendar } from '@/lib/hr/data'
import { leaveDays } from '@/lib/hr/leave'
import { allRows } from '@/lib/utils/paginate'
import { todayISO } from '@/lib/utils/dates'
import { logActivity } from '@/lib/activity-log/service'

export type TrackerImportState = { error?: string; errors?: string[]; success?: string } | undefined

const BATCH = 500
const IN_CHUNK = 100

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

/**
 * Inti import histori Daily Tracker (dipanggil action setelah cek izin hr.manage).
 * - Nama tak dikenal = tidak ada yang disimpan.
 * - Baris yang bentrok jam dengan entri APP dilewati (jam tidak terhitung dua kali).
 * - Import ulang: hanya tanggal yang ada di berkas yang diganti (per user), dan
 *   hanya baris IMPORT. Entri yang diubah karyawan sudah menjadi APP (lihat
 *   saveWorkLog) sehingga tidak tertimpa.
 * - Baris baru dimasukkan dulu, baru baris lama dihapus, supaya gagal di tengah tidak mengosongkan data.
 * shortcut: tanpa transaksi DB; gagal di tengah bisa menyisakan baris lama dan baru bersamaan, import ulang memperbaikinya.
 */
export async function runTrackerImport(sheets: SheetInput[], actorId: string): Promise<TrackerImportState> {
  const admin = createAdminClient()
  const [users, projects, refs] = await Promise.all([
    allRows<{ id: string; full_name: string | null }>((f, t) => admin.from('profiles').select('id, full_name').is('deleted_at', null).order('id').range(f, t)),
    allRows<{ id: string; name: string }>((f, t) => admin.from('projects').select('id, name').order('id').range(f, t)),
    loadReferences(['ACTIVITY_CATEGORY', 'WORK_LOCATION', 'INTERNAL_PROJECT']),
  ])

  let build = buildImport(sheets, { users, projects, refs, today: todayISO() })
  const leaveBuild = buildLeaveImport(sheets, { users, today: todayISO() })
  build = { ...build, unknownNames: [...new Set([...build.unknownNames, ...leaveBuild.unknownNames])].sort((a, b) => a.localeCompare(b, 'id')) }

  if (build.sheets.length === 0) {
    return { error: 'Tidak ada sheet "Daily <Bulan>" di file ini (sheet Daily 2025, Daily 2026, dan Daily Sum diabaikan).' }
  }
  if (build.unknownNames.length > 0) {
    const shown = build.unknownNames.slice(0, 20)
    const more = build.unknownNames.length - shown.length
    return {
      error: `${build.unknownNames.length} nama tidak cocok dengan nama di profil user. Tidak ada yang disimpan. Perbaiki nama di profil atau di berkas.`,
      errors: more > 0 ? [...shown, `...dan ${more} nama lain`] : shown,
    }
  }

  // Entri APP dan baris IMPORT lama di tanggal-tanggal berkas, per user.
  const app: AppEntry[] = []
  const oldIds: string[] = []
  try {
    for (const [userId, dates] of datesByUser(build.rows)) {
      for (const part of chunks(dates, IN_CHUNK)) {
        const rows = await allRows<AppEntry & { id: string; source: string }>((f, t) =>
          admin
            .from('work_logs')
            .select('id, user_id, work_date, start_time, end_time, source')
            .eq('user_id', userId)
            .in('work_date', part)
            .order('id')
            .range(f, t)
        )
        for (const r of rows) {
          if (r.source === 'IMPORT') oldIds.push(r.id)
          else app.push(r)
        }
      }
    }
  } catch {
    return { error: 'Gagal membaca data lama. Tidak ada yang diubah.' }
  }
  build = dropAppOverlaps(build, app)
  if (build.rows.length === 0) return { error: `Tidak ada aktivitas yang bisa diimport. ${summarize(build)}` }

  for (const part of chunks(build.rows, BATCH)) {
    const { error } = await admin.from('work_logs').insert(part)
    if (error) {
      console.warn('[hr-import] insert failed:', error.message)
      return { error: 'Gagal menyimpan sebagian data. Import ulang file yang sama untuk merapikan.' }
    }
  }

  for (const part of chunks(oldIds, 200)) {
    const { error } = await admin.from('work_logs').delete().in('id', part)
    if (error) {
      console.warn('[hr-import] delete old failed:', error.message)
      return { error: 'Data baru tersimpan tetapi sebagian data lama gagal diganti. Import ulang file yang sama untuk merapikan.' }
    }
  }

  const leaveNote = await importLeave(leaveBuild)
  if ('error' in leaveNote) return { error: leaveNote.error }

  const ranges = [...rangesByUser(build.rows).values()]
  await logActivity({
    actorUserId: actorId,
    action: 'TRACKER_IMPORTED',
    entityType: 'hr',
    entityId: `import:${new Date().toISOString()}`,
    metadata: {
      rows: build.rows.length,
      users: ranges.length,
      from: ranges.reduce((m, r) => (r.from < m ? r.from : m), ranges[0].from),
      to: ranges.reduce((m, r) => (r.to > m ? r.to : m), ranges[0].to),
      replaced: oldIds.length,
      skipped_overlap: build.skipped.overlap,
      leave: leaveBuild.leave.length,
    },
  })
  return { success: `${summarize(build)} ${leaveNote.note}`.trim() }
}

/**
 * Leave Form: log jadi cuti/izin/sakit DISETUJUI (source IMPORT; import ulang mengganti
 * IMPORT di tanggal yang sama, entri APP tidak disentuh). Tanggal masuk dan hak cuti
 * hanya diisi bila di profil masih kosong (tidak menimpa isian HR).
 */
async function importLeave(b: LeaveBuild): Promise<{ note: string } | { error: string }> {
  if (!b.leave.length && !b.employees.length) return { note: '' }
  const admin = createAdminClient()
  const dates = b.leave.map((l) => l.date).sort()
  const calendar = dates.length ? await loadCalendar(dates[0], dates[dates.length - 1]) : []
  for (const l of b.leave) {
    const { error: de } = await admin.from('leave_requests').delete().eq('user_id', l.user_id).eq('source', 'IMPORT').eq('start_date', l.date).eq('end_date', l.date)
    if (de) return { error: 'Data tracker tersimpan, tetapi cuti gagal diimport. Import ulang file yang sama.' }
  }
  if (b.leave.length) {
    const { error } = await admin.from('leave_requests').insert(
      b.leave.map((l) => ({ user_id: l.user_id, kind: l.kind, start_date: l.date, end_date: l.date, days: leaveDays(l.date, l.date, calendar), reason: l.reason, status: 'APPROVED', source: 'IMPORT', decided_at: new Date().toISOString(), decision_note: 'Diimport dari Leave Form sheet' }))
    )
    if (error) {
      console.warn('[hr-import] leave insert failed:', error.message)
      return { error: 'Data tracker tersimpan, tetapi cuti gagal diimport. Import ulang file yang sama.' }
    }
  }
  let filled = 0
  for (const e of b.employees) {
    const { data: cur } = await admin.from('profiles').select('join_date, annual_leave_quota').eq('id', e.user_id).single<{ join_date: string | null; annual_leave_quota: number | null }>()
    const patch: Record<string, unknown> = {}
    if (!cur?.join_date && e.join_date) patch.join_date = e.join_date
    if (cur?.annual_leave_quota === null && e.quota !== null) patch.annual_leave_quota = e.quota
    if (Object.keys(patch).length) {
      await admin.from('profiles').update(patch).eq('id', e.user_id)
      filled++
    }
  }
  return { note: `Leave Form: ${b.leave.length} hari cuti diimport sebagai disetujui (Izin dicatat sebagai Cuti Tahunan)${b.skipped ? `, ${b.skipped} baris dilewati` : ''}; data masuk/hak cuti diisi untuk ${filled} orang${b.unmatchedEmployees.length ? ` (${b.unmatchedEmployees.length} nama di bagian kanan tidak cocok profil, dilewati: ${b.unmatchedEmployees.join(', ')})` : ''}.` }
}

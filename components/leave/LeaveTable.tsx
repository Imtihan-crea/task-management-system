import type { ReactNode } from 'react'
import type { LeaveRecord } from '@/lib/hr/data'
import { KIND_LABEL, STATUS_LABEL } from '@/lib/hr/leave'
import { formatDate } from '@/lib/utils/dates'

const STATUS_TONE: Record<LeaveRecord['status'], string> = {
  PENDING: 'text-amber-800 dark:text-amber-300',
  APPROVED: 'text-green-700 dark:text-green-400',
  REJECTED: 'text-red-700 dark:text-red-400',
  CANCELLED: 'text-zinc-600 dark:text-zinc-400',
}

export const range = (l: Pick<LeaveRecord, 'start_date' | 'end_date'>) =>
  l.start_date === l.end_date ? formatDate(l.start_date) : `${formatDate(l.start_date)} – ${formatDate(l.end_date)}`

/** Tabel pengajuan; `person` dan `actions` opsional per baris. */
export function LeaveTable({
  rows,
  person,
  actions,
  empty = 'Belum ada pengajuan.',
}: {
  rows: LeaveRecord[]
  person?: (l: LeaveRecord) => string
  actions?: (l: LeaveRecord) => ReactNode
  empty?: string
}) {
  if (!rows.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400">{empty}</p>
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
            {person && <th className="py-2 pr-3">Nama</th>}
            <th className="py-2 pr-3">Jenis</th>
            <th className="py-2 pr-3">Tanggal</th>
            <th className="py-2 pr-3 text-right">Hari kerja</th>
            <th className="py-2 pr-3">Keterangan</th>
            <th className="py-2 pr-3">Status</th>
            {actions && <th className="py-2"><span className="sr-only">Tindakan</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-b align-top last:border-0">
              {person && <td className="py-2 pr-3">{person(l)}</td>}
              <td className="py-2 pr-3">{KIND_LABEL[l.kind]}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{range(l)}</td>
              <td className="py-2 pr-3 text-right">{l.days}</td>
              <td className="py-2 pr-3">
                {l.reason ?? '-'}
                {l.attachment_url && (
                  <a href={l.attachment_url} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-kasuat-deep-gold hover:underline">Lampiran</a>
                )}
                {l.decision_note && <p className="text-xs text-zinc-600 dark:text-zinc-400">Catatan: {l.decision_note}</p>}
              </td>
              <td className={`py-2 pr-3 font-semibold ${STATUS_TONE[l.status]}`}>{STATUS_LABEL[l.status]}</td>
              {actions && <td className="min-w-64 py-2">{actions(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

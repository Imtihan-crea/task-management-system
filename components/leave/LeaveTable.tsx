import type { ReactNode } from 'react'
import type { LeaveRecord } from '@/lib/hr/data'
import { SPECIAL_LABEL, STATUS_LABEL } from '@/lib/hr/leave'
import { formatDate } from '@/lib/utils/dates'
import { BulkCheckbox } from '@/components/ui/BulkSelect'

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
  labels,
  person,
  actions,
  empty = 'Belum ada pengajuan.',
  selectable,
}: {
  rows: LeaveRecord[]
  /** kode jenis -> label (dari Master Reference) */
  labels: Record<string, string>
  person?: (l: LeaveRecord) => string
  actions?: (l: LeaveRecord) => ReactNode
  empty?: string
  /** Kolom pilih (wajib di dalam BulkSelectProvider); baris yang tidak bisa dipilih tanpa kotak. */
  selectable?: (l: LeaveRecord) => boolean
}) {
  if (!rows.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400">{empty}</p>
  return (
    <div className="scroll-x-hint relative md:overflow-x-auto">
      <table className="stack-table w-full text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
            {selectable && <th className="w-12 py-2"><span className="sr-only">Pilih</span></th>}
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
              {selectable && <td className="py-0">{selectable(l) && <BulkCheckbox id={l.id} label={`${person ? `${person(l)} ` : ''}${labels[l.kind] ?? l.kind} ${range(l)}`} />}</td>}
              {person && <td data-label="Nama" className="py-2 pr-3 font-semibold md:font-normal">{person(l)}</td>}
              <td data-label="Jenis" className="py-2 pr-3"><span>{labels[l.kind] ?? l.kind}{l.special_reason && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{SPECIAL_LABEL[l.special_reason] ?? l.special_reason}</span>}</span></td>
              <td data-label="Tanggal" className="py-2 pr-3 whitespace-nowrap">{range(l)}</td>
              <td data-label="Hari kerja" className="py-2 pr-3 text-right">{l.days}</td>
              <td data-label="Keterangan" className="py-2 pr-3">
                <span>
                {l.reason ?? '-'}
                {l.attachment_url && (
                  <a href={l.attachment_url} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-kasuat-deep-gold hover:underline">Lampiran</a>
                )}
                {l.decision_note && <span className="block text-xs text-zinc-600 dark:text-zinc-400">Catatan: {l.decision_note}</span>}
                </span>
              </td>
              <td data-label="Status" className={`py-2 pr-3 font-semibold ${STATUS_TONE[l.status]}`}>{STATUS_LABEL[l.status]}</td>
              {actions && <td className="py-2 md:min-w-64">{actions(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

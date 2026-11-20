import Link from 'next/link'
import { formatDateTime } from '@/lib/utils/dates'
import { TRANSFER_STATUS_LABEL, isoToWibLocal } from '@/lib/tasks/transfer-rules'
import type { TransferView } from '@/lib/data/task-transfers'
import { TransferCancelForm, TransferDecisionForm, TransferEndForm } from '@/components/tasks/TransferForms'

export function transferRange(t: Pick<TransferView, 'kind' | 'starts_at' | 'ends_at'>): string {
  return t.kind === 'PERMANENT' ? 'Permanen' : `${formatDateTime(t.starts_at)} s/d ${formatDateTime(t.ends_at)}`
}

/** Ringkasan satu alih task + tombol sesuai peran (PM/Admin project, atau pengaju). */
export function TransferCard({
  t,
  canManage,
  userId,
  showTask = false,
}: {
  t: TransferView
  canManage: boolean
  userId: string
  showTask?: boolean
}) {
  const isRequester = t.requested_by === userId
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 dark:border-zinc-700">
      <div className="text-sm">
        {showTask && t.task && (
          <p className="font-semibold">
            <Link href={`/tasks/${t.task.id}`} className="underline">
              {t.task.code} {t.task.title}
            </Link>
          </p>
        )}
        <p>
          <span className="font-semibold">{TRANSFER_STATUS_LABEL[t.status]}</span> · {t.fromName} → {t.toName}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {transferRange(t)}
          {t.kind === 'TEMPORARY' && (t.auto_return ? ' · kembali otomatis' : ' · PM memutuskan saat masa habis')}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">Diajukan {t.requesterName}, {formatDateTime(t.created_at)}</p>
        {t.note && <p className="text-zinc-600 dark:text-zinc-400">Catatan: {t.note}</p>}
        {t.decision_note && <p className="text-zinc-600 dark:text-zinc-400">Catatan PM: {t.decision_note}</p>}
      </div>
      {t.status === 'PENDING' && canManage && !isRequester && <TransferDecisionForm items={[{ id: t.id, label: '' }]} />}
      {(t.status === 'PENDING' || t.status === 'SCHEDULED') && (canManage || isRequester) && <TransferCancelForm items={[{ id: t.id, label: '' }]} />}
      {(t.status === 'ACTIVE' || t.status === 'EXPIRED') && canManage && (
        <TransferEndForm id={t.id} fromName={t.fromName} toName={t.toName} endsAt={t.ends_at ? isoToWibLocal(t.ends_at) : ''} />
      )}
    </div>
  )
}

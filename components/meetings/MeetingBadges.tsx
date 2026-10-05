import type { MeetingStatus, MeetingType } from '@/types/meeting'
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/types/meeting'

const BASE =
  'inline-flex min-h-[28px] items-center rounded-full border px-2 py-0.5 text-xs font-semibold'

const STATUS_STYLE: Record<MeetingStatus, string> = {
  DRAFT: 'border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300',
  SCHEDULED: 'border-blue-400 text-blue-600 dark:text-blue-300',
  COMPLETED: 'border-green-500 text-green-600 dark:text-green-300',
  CANCELLED: 'border-red-400 text-red-600 dark:text-red-300',
}

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={`${BASE} ${STATUS_STYLE[status]}`}>{MEETING_STATUS_LABELS[status]}</span>
  )
}

export function MeetingTypeBadge({ type }: { type: MeetingType }) {
  return (
    <span
      className={`${BASE} border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300`}
    >
      {MEETING_TYPE_LABELS[type]}
    </span>
  )
}
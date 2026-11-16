import { CommentForm } from '@/components/tracker/CommentForm'
import type { LogComment, ReviewLog } from '@/lib/hr/data'
import { formatDate, formatDateTime } from '@/lib/utils/dates'

const hours = (min: number) => (min / 60).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export function CommentThread({ comments }: { comments: LogComment[] }) {
  if (!comments.length) return null
  return (
    <ul className="mt-1 space-y-1">
      {comments.map((c) => (
        <li key={c.id} className="rounded-lg bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-800">
          <span className="font-semibold">{c.author}</span> · {formatDateTime(c.created_at)}
          <p className="whitespace-pre-line text-sm">{c.body}</p>
        </li>
      ))}
    </ul>
  )
}

/** Daftar aktivitas untuk pemeriksa (PM View / rekap HR), dengan komentar. */
export function ReviewLogList({
  logs,
  comments,
  showPerson,
  showProject,
}: {
  logs: ReviewLog[]
  comments: Map<string, LogComment[]>
  showPerson: boolean
  showProject: boolean
}) {
  if (!logs.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Belum ada aktivitas.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
            <th className="py-2 pr-3">Tanggal</th>
            {showPerson && <th className="py-2 pr-3">Nama</th>}
            <th className="py-2 pr-3">Jam</th>
            {showProject && <th className="py-2 pr-3">Proyek</th>}
            <th className="py-2 pr-3">Aktivitas &amp; komentar</th>
            <th className="py-2 pr-3">Kategori</th>
            <th className="py-2">Output</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b align-top last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(l.work_date)}</td>
              {showPerson && <td className="py-2 pr-3">{l.person}</td>}
              <td className="py-2 pr-3 whitespace-nowrap">{l.start_time.slice(0, 5)}–{l.end_time.slice(0, 5)} ({hours(l.duration_minutes)} j)</td>
              {showProject && <td className="py-2 pr-3">{l.project}</td>}
              <td className="min-w-64 py-2 pr-3">
                <p className="font-medium">{l.activity}</p>
                {l.detail && <p className="text-xs text-zinc-600 dark:text-zinc-400">{l.detail}</p>}
                <CommentThread comments={comments.get(l.id) ?? []} />
                <CommentForm logId={l.id} />
              </td>
              <td className="py-2 pr-3">{l.category}</td>
              <td className="py-2">{l.output || <span className="font-semibold text-red-700">Kosong</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

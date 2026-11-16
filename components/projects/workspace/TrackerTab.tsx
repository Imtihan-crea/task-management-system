import Link from 'next/link'
import { ReviewLogList } from '@/components/tracker/ReviewLogList'
import { loadComments, loadReviewLogs } from '@/lib/hr/data'
import { breakdown, monthRange } from '@/lib/hr/tracker'

const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const shiftMonth = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + d, 1))
  return t.toISOString().slice(0, 7)
}

/** PM View (sheet "Month Track – PM View"): aktivitas tracker yang dicatat ke project ini. */
export async function TrackerTab({ projectId, month }: { projectId: string; month: string }) {
  const [from, to] = monthRange(month)
  const logs = await loadReviewLogs({ projectId, from, to })
  const comments = await loadComments(logs.map((l) => l.id))
  const perPerson = breakdown(
    logs.map((l) => ({ user_id: l.user_id, work_date: l.work_date, project_name: l.person, category: l.category, duration_minutes: l.duration_minutes })),
    'project_name'
  )
  const perCategory = breakdown(
    logs.map((l) => ({ user_id: l.user_id, work_date: l.work_date, project_name: l.project, category: l.category, duration_minutes: l.duration_minutes })),
    'category'
  )
  const href = (m: string) => `/projects/${projectId}?tab=tracker&bulan=${m}`

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Daily Tracker {month}</h2>
        <nav aria-label="Pilih bulan" className="flex gap-3 text-sm font-semibold">
          <Link href={href(shiftMonth(month, -1))} className="text-kasuat-deep-gold hover:underline">Bulan sebelumnya</Link>
          <Link href={href(shiftMonth(month, 1))} className="text-kasuat-deep-gold hover:underline">Bulan berikutnya</Link>
        </nav>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { title: 'Jam per orang', key: 'Nama', rows: perPerson },
          { title: 'Jam per kategori', key: 'Kategori', rows: perCategory },
        ].map((t) => (
          <div key={t.title} className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
            <h3 className="mb-2 font-semibold">{t.title}</h3>
            {t.rows.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Tidak ada data.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                    <th className="py-2 pr-3">{t.key}</th>
                    <th className="py-2 pr-3 text-right">Jam</th>
                    <th className="py-2 pr-3 text-right">Aktivitas</th>
                    <th className="py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.key}</td>
                      <td className="py-2 pr-3 text-right">{num(r.hours)}</td>
                      <td className="py-2 pr-3 text-right">{r.count}</td>
                      <td className="py-2 text-right">{num(r.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h3 className="mb-2 font-semibold">Aktivitas ({logs.length})</h3>
        <ReviewLogList logs={logs} comments={comments} showPerson showProject={false} />
      </div>
    </section>
  )
}

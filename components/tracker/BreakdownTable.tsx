import type { Breakdown } from '@/lib/hr/tracker'

const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

export function BreakdownTable({ title, rows, keyLabel }: { title: string; rows: Breakdown[]; keyLabel: string }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Tidak ada data.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
              <th className="py-2 pr-3">{keyLabel}</th>
              <th className="py-2 pr-3 text-right">Jam</th>
              <th className="py-2 pr-3 text-right">Aktivitas</th>
              <th className="py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
  )
}

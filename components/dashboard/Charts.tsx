/**
 * Grafik SVG tanpa dependensi (§54): warna mengikuti chart specification.
 * Menyertakan ringkasan teks untuk screen reader (§31, §67).
 */

const STATUS_COLORS: Record<string, string> = {
  TODO: '#A6A6A6',
  IN_PROGRESS: '#BE9B5C',
  REVIEW: '#5B8DEF',
  BLOCKED: '#D64545',
  DONE: '#3E9B4F',
}

export function StatusDonut({
  segments,
}: {
  segments: { label: string; value: number; status: string }[]
}) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  const R = 54
  const C = 2 * Math.PI * R

  type Arc = { label: string; value: number; status: string; dash: number; offset: number }
  const arcs: Arc[] = segments.reduce(
    (out: { acc: number; list: Arc[] }, s) => {
      const frac = total === 0 ? 0 : s.value / total
      return {
        acc: out.acc + frac * C,
        list: [...out.list, { ...s, dash: frac * C, offset: out.acc }],
      }
    },
    { acc: 0, list: [] as Arc[] }
  ).list

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 140 140"
        role="img"
        aria-label={`Total ${total} task: ${segments
          .map((s) => `${s.label} ${s.value}`)
          .join(', ')}`}
        className="h-32 w-32 shrink-0"
      >
        <circle cx="70" cy="70" r={R} fill="none" stroke="#E2E2E2" strokeWidth="18" />
        {arcs.map(
          (s) =>
            s.dash > 0 && (
              <circle
                key={s.status}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={STATUS_COLORS[s.status] ?? '#A6A6A6'}
                strokeWidth="18"
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.offset + C * 0.25}
                strokeLinecap="butt"
              />
            )
        )}
        <text
          x="70"
          y="66"
          textAnchor="middle"
          className="fill-kasuat-black font-heading dark:fill-zinc-100"
          fontSize="24"
          fontWeight="700"
        >
          {total}
        </text>
        <text x="70" y="84" textAnchor="middle" fontSize="11" fill="#A6A6A6">
          Total Task
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.status} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[s.status] ?? '#A6A6A6' }}
            />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-semibold">
              {s.value}
              <span className="ml-1 font-normal text-zinc-500">
                ({total === 0 ? 0 : Math.round((s.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PriorityBars({
  items,
}: {
  items: { label: string; value: number }[]
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul
      className="flex flex-col gap-3"
      aria-label={`Prioritas task: ${items.map((i) => `${i.label} ${i.value}`).join(', ')}`}
    >
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-sm text-zinc-500">{i.label}</span>
          <div
            className="h-4 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            role="progressbar"
            aria-valuenow={i.value}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={`${i.label}: ${i.value}`}
          >
            <div
              className="h-4 rounded-full bg-kasuat-gold"
              style={{ width: `${Math.round((i.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-semibold">{i.value}</span>
        </li>
      ))}
    </ul>
  )
}

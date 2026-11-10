import { requireProfile } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils/dates'
import { UPDATE_LOG } from '@/lib/update-log'

function Section({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <h3 className={`text-sm font-bold ${tone}`}>{label}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default async function UpdateLogPage() {
  await requireProfile()

  return (
    <AppShell>
      <PageHeader title="Update Log" subtitle="Fitur yang ditambah atau dikurangi di setiap versi aplikasi." />

      <div className="mt-4 flex flex-col gap-4">
        {UPDATE_LOG.map((entry, i) => (
          <section
            key={`${entry.date}-${entry.version ?? i}`}
            className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-bold">{entry.title ?? formatDate(entry.date)}</h2>
              {entry.title && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{formatDate(entry.date)}</span>
              )}
              {entry.version && (
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{entry.version}</span>
              )}
              {i === 0 && (
                <span className="rounded-full bg-kasuat-gold px-2 py-0.5 text-xs font-semibold text-kasuat-black">
                  Latest
                </span>
              )}
            </div>
            <Section label="Added" items={entry.added} tone="text-emerald-700 dark:text-emerald-400" />
            <Section label="Removed" items={entry.removed} tone="text-red-700 dark:text-red-400" />
            <Section label="Pending" items={entry.pending ?? []} tone="text-amber-800 dark:text-amber-300" />
          </section>
        ))}
      </div>
    </AppShell>
  )
}

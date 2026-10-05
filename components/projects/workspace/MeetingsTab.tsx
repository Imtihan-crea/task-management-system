import Link from 'next/link'
import { getMeetingScope, fetchMeetings } from '@/lib/data/meetings'
import { MeetingResults } from '@/components/meetings/MeetingResults'

/**
 * Tab Meetings di Project Detail (§2B, §11).
 * Menampilkan meeting project ini + tombol + New Meeting (project terkunci).
 */
export async function MeetingsTab({
  projectId,
  userId,
  role,
  canCreate,
}: {
  projectId: string
  userId: string
  role: string
  canCreate: boolean
}) {
  const scope = await getMeetingScope(userId, role)

  // Hitung untuk header tab.
  const rows = await fetchMeetings(scope, {
    tab: 'all',
    q: '',
    project: projectId,
    type: '',
    status: '',
    organizer: '',
    dateFrom: '',
    dateTo: '',
  })

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          Meetings ({rows.length})
        </h2>
        {canCreate && (
          <Link
            href={`/meetings/new?project=${projectId}`}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black"
          >
            + New Meeting
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-heading text-lg font-semibold">No meetings yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Buat meeting pertama untuk project ini.
          </p>
          {canCreate && (
            <div className="mt-4 flex justify-center">
              <Link
                href={`/meetings/new?project=${projectId}`}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black"
              >
                + New Meeting
              </Link>
            </div>
          )}
        </div>
      ) : (
        <MeetingResults
          scope={scope}
          filters={{
            tab: 'all',
            q: '',
            project: projectId,
            type: '',
            status: '',
            organizer: '',
            dateFrom: '',
            dateTo: '',
          }}
        />
      )}
    </section>
  )
}
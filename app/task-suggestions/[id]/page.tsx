import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { SUGGESTION_STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { formatDate } from '@/lib/utils/dates'
import { ResubmitForm, ReviewForm } from '@/components/suggestions/SuggestionForms'
import { getActiveUsers } from '@/lib/data/users'
import { isProjectManager } from '@/lib/data/projects'
import type { TaskSuggestion } from '@/types/suggestion'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

export default async function SuggestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireProfile()
  const { id } = await params

  const admin = createAdminClient()
  const { data: suggestion } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', id)
    .single<TaskSuggestion>()

  if (!suggestion) notFound()

  const isCreator = suggestion.suggested_by === profile.id
  const isAdmin = profile.role === 'ADMIN'
  const isPM = profile.role === 'PROJECT_MANAGER'
  const pmInScope = isPM && (await isProjectManager(suggestion.project_id, profile.id))

  // Scope baca: creator, PM dalam scope, admin. Member lain tidak boleh.
  if (!isCreator && !isAdmin && !pmInScope) {
    notFound()
  }

  const canReview =
    can(profile.role, 'suggestions.review') &&
    (isAdmin || pmInScope) &&
    suggestion.status === 'PENDING'
  const canResubmit = isCreator && suggestion.status === 'REVISION_REQUESTED'

  const [{ data: project }, { data: workstream }, { data: creator }, { data: reviewer }, { data: reviewerAssignee }] =
    await Promise.all([
      admin.from('projects').select('code, name').eq('id', suggestion.project_id).single<{ code: string; name: string }>(),
      suggestion.workstream_id
        ? admin.from('workstreams').select('code, name').eq('id', suggestion.workstream_id).single<{ code: string; name: string }>()
        : Promise.resolve({ data: null }),
      admin.from('profiles').select('full_name, email').eq('id', suggestion.suggested_by).single<{ full_name: string | null; email: string }>(),
      suggestion.reviewer_id
        ? admin.from('profiles').select('full_name, email').eq('id', suggestion.reviewer_id).single<{ full_name: string | null; email: string }>()
        : Promise.resolve({ data: null }),
      suggestion.suggested_assignee_id
        ? admin.from('profiles').select('full_name, email').eq('id', suggestion.suggested_assignee_id).single<{ full_name: string | null; email: string }>()
        : Promise.resolve({ data: null }),
    ])

  let convertedTaskCode: string | null = null
  if (suggestion.converted_task_id) {
    const { data: converted } = await admin
      .from('tasks')
      .select('code')
      .eq('id', suggestion.converted_task_id)
      .single<{ code: string }>()
    convertedTaskCode = converted?.code ?? null
  }

  // Data untuk form resubmit (creator saja) dan review (reviewer).
  const [workstreamsRes, users] = canResubmit || canReview
    ? await Promise.all([
        admin.from('workstreams').select('id, project_id, code, name').eq('project_id', suggestion.project_id).order('name', { ascending: true }).limit(200),
        getActiveUsers(),
      ])
    : [{ data: [] }, []]

  return (
    <AppShell>
      <Link href="/task-suggestions" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Suggestions
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">
          {suggestion.code}
        </span>
        <h1 className="text-2xl font-bold">{suggestion.title}</h1>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Suggestion Detail</h2>
          <dl>
            <Row label="Project" value={project ? `${project.code} · ${project.name}` : '-'} />
            <Row label="Workstream" value={workstream ? `${workstream.code} · ${workstream.name}` : '-'} />
            <Row label="Description" value={suggestion.description} />
            <Row
              label="Suggested Assignee"
              value={reviewerAssignee ? reviewerAssignee.full_name || reviewerAssignee.email : '-'}
            />
            <Row label="Suggested Priority" value={suggestion.suggested_priority ?? '-'} />
            <Row
              label="Suggested Deadline"
              value={suggestion.suggested_deadline ? formatDate(suggestion.suggested_deadline) : '-'}
            />
            <Row
              label="Suggested By"
              value={creator ? creator.full_name || creator.email : '-'}
            />
            <Row label="Status" value={SUGGESTION_STATUS_LABELS[suggestion.status]} />
            <Row
              label="Reviewer"
              value={reviewer ? reviewer.full_name || reviewer.email : '-'}
            />
            <Row label="Review Note" value={suggestion.review_note || '-'} />
            <Row
              label="Reviewed At"
              value={suggestion.reviewed_at ? formatDate(suggestion.reviewed_at) : '-'}
            />
          </dl>

          {convertedTaskCode && suggestion.converted_task_id && (
            <Link
              href={`/tasks/${suggestion.converted_task_id}`}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
            >
              View Task {convertedTaskCode}
            </Link>
          )}
        </section>

        <div className="flex flex-col gap-6">
          {canReview && (
            <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
              <h2 className="mb-4 text-lg font-bold">Review Suggestion</h2>
              <ReviewForm
                id={suggestion.id}
                users={users}
                suggestedAssigneeId={suggestion.suggested_assignee_id}
              />
            </section>
          )}

          {canResubmit && (
            <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
              <h2 className="mb-4 text-lg font-bold">Fix & Resubmit</h2>
              <ResubmitForm
                id={suggestion.id}
                title={suggestion.title}
                description={suggestion.description}
                workstreamId={suggestion.workstream_id}
                assigneeId={suggestion.suggested_assignee_id}
                priority={suggestion.suggested_priority}
                deadline={suggestion.suggested_deadline}
                workstreams={(workstreamsRes.data ?? []) as { id: string; project_id: string; code: string; name: string }[]}
                users={users}
                projectId={suggestion.project_id}
              />
            </section>
          )}
        </div>
      </div>
    </AppShell>
  )
}

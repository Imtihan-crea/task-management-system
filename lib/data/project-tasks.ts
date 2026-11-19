import 'server-only'

import { allRows } from '@/lib/utils/paginate'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/auth/current-access'
import type { TaskStatus } from '@/types/task'
import type { UserRole } from '@/types/profile'
import { seesOwnProjectsOnly } from '@/lib/auth/roles'

export type ProjectTaskRow = {
  id: string
  code: string
  title: string
  workstream_id: string | null
  assignee_id: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: TaskStatus
  start_date: string | null
  deadline: string
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
}

export type ProjectTaskViewer = { id: string; role: UserRole; managesProject: boolean }
export type ProjectTaskFilters = { ws: string; status: string; priority: string }

/**
 * Task di tab Tasks workspace project: semua baris, sudah dibatasi per viewer,
 * difilter dan diurutkan. Dipakai tab dan export Excel supaya identik.
 * `workstreams` tidak terfilter (untuk dropdown tab).
 */
export async function loadProjectTasks(projectId: string, viewer: ProjectTaskViewer, filters: ProjectTaskFilters) {
  const admin = createAdminClient()

  let taskQuery = admin
    .from('tasks')
    .select('id, code, title, workstream_id, assignee_id, priority, status, start_date, deadline, completed_at, cancelled_at, created_at')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
  // Project Officer / Guest tanpa izin ubah task di project ini: hanya task miliknya.
  if (seesOwnProjectsOnly(viewer.role) && !viewer.managesProject) taskQuery = taskQuery.eq('assignee_id', viewer.id)
  // Urutan dipasang sekali: builder PostgREST mutable, .order di dalam callback menumpuk per halaman.
  const orderedTasks = taskQuery.order('deadline', { ascending: true }).order('id')

  const [{ data: workstreams }, tasks] = await Promise.all([
    admin
      .from('workstreams')
      .select('id, code, name')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    allRows<ProjectTaskRow>((from, to) => orderedTasks.range(from, to)),
  ])

  const wsList = (workstreams ?? []) as { id: string; code: string; name: string }[]
  const wsNames = Object.fromEntries(wsList.map((w) => [w.id, `${w.code} · ${w.name}`]))

  const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id))]
  let assigneeNames: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: users } = await admin.from('profiles').select('id, full_name, email').in('id', assigneeIds)
    assigneeNames = Object.fromEntries(
      ((users ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [
        u.id,
        u.full_name || u.email,
      ])
    )
  }

  const visibleTasks = tasks
    .filter(
      (t) =>
        (!filters.ws || t.workstream_id === filters.ws) &&
        (!filters.status || t.status === filters.status) &&
        (!filters.priority || t.priority === filters.priority)
    )
    .sort((a, b) => {
      const aClosed = a.status === 'DONE' || a.status === 'CANCELLED' ? 1 : 0
      const bClosed = b.status === 'DONE' || b.status === 'CANCELLED' ? 1 : 0
      if (aClosed !== bClosed) return aClosed - bClosed
      return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0
    })

  return { wsList, wsNames, assigneeNames, visibleTasks }
}

/**
 * Boleh membuka workspace project ini? Aturan sama dengan app/(app)/projects/[id]/page.tsx
 * (project ada; TEAM_MEMBER tanpa izin di project itu harus punya task di sana).
 * Mengembalikan viewer untuk loadProjectTasks, atau null (= 404).
 */
export async function projectTaskViewer(
  profile: { id: string; role: UserRole },
  projectId: string
): Promise<(ProjectTaskViewer & { projectLabel: string }) | null> {
  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select('id, code, name').eq('id', projectId).maybeSingle()
  if (!project) return null

  const [canEditProject, canManageWorkstream, canCreateTask, canEditTask, canReviewTracker, canViewHr] = await Promise.all([
    hasPermission(profile.id, 'projects.edit', projectId),
    hasPermission(profile.id, 'workstreams.create', projectId),
    hasPermission(profile.id, 'tasks.create', projectId),
    hasPermission(profile.id, 'tasks.edit', projectId),
    hasPermission(profile.id, 'tracker.review', projectId),
    hasPermission(profile.id, 'hr.view'),
  ])
  const hasGrantHere = canEditProject || canManageWorkstream || canCreateTask || canEditTask || canReviewTracker || canViewHr

  // Salinan aturan akses app/(app)/projects/[id]/page.tsx; ubah keduanya.
  if (seesOwnProjectsOnly(profile.role) && !hasGrantHere) {
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)
    if ((count ?? 0) === 0) return null
  }
  return { id: profile.id, role: profile.role, managesProject: canEditTask, projectLabel: `${project.code} · ${project.name}` }
}

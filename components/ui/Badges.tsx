import type { ProjectStatus } from '@/types/project'
import type { TaskPriority, TaskStatus } from '@/types/task'

const BASE = 'inline-flex min-h-[28px] items-center rounded-full border px-2 py-0.5 text-xs font-semibold'

const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  TODO: 'border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300',
  IN_PROGRESS: 'border-blue-400 text-blue-600 dark:text-blue-300',
  REVIEW: 'border-amber-400 text-amber-600 dark:text-amber-300',
  BLOCKED: 'border-red-400 text-red-600 dark:text-red-300',
  DONE: 'border-green-500 text-green-600 dark:text-green-300',
  CANCELLED: 'border-zinc-500 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400',
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  LOW: 'border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300',
  MEDIUM: 'border-blue-400 text-blue-600 dark:text-blue-300',
  HIGH: 'border-red-400 text-red-600 dark:text-red-300',
}

const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  PLANNING: 'border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300',
  ACTIVE: 'border-blue-400 text-blue-600 dark:text-blue-300',
  ON_HOLD: 'border-amber-400 text-amber-600 dark:text-amber-300',
  COMPLETED: 'border-green-500 text-green-600 dark:text-green-300',
  CANCELLED: 'border-red-400 text-red-600 dark:text-red-300',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`${BASE} ${TASK_STATUS_STYLE[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`${BASE} ${PRIORITY_STYLE[priority]}`}>{priority}</span>
  )
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`${BASE} ${PROJECT_STATUS_STYLE[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export function OverdueBadge() {
  return (
    <span
      className={`${BASE} border-red-600 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`}
    >
      Overdue
    </span>
  )
}

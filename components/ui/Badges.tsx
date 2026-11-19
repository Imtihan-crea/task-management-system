import type { ProjectStatus } from '@/types/project'
import type { TaskPriority, TaskStatus } from '@/types/task'

// Pil berwarna lembut tanpa bingkai: tetap terbaca (teks >= 4.5:1) tanpa membuat baris terasa berat.
const BASE = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-5'

const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  TODO: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  REVIEW: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  BLOCKED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  DONE: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  CANCELLED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  LOW: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  MEDIUM: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  PLANNING: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  ACTIVE: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  ON_HOLD: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  COMPLETED: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
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
      className={`${BASE} bg-red-600 text-white dark:bg-red-700`}
    >
      Overdue
    </span>
  )
}

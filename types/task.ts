export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'BLOCKED'
  | 'DONE'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Task {
  id: string
  project_id: string
  workstream_id: string | null
  title: string
  description: string | null
  assignee_id: string
  created_by: string | null
  priority: TaskPriority
  status: TaskStatus
  start_date: string | null
  deadline: string
  is_deleted: boolean
  /** Link evidence opsional, tetap bisa diubah setelah DONE. */
  evidence_url: string | null
  created_at: string
  updated_at: string
}

/** Task + nama relasi untuk list/detail (diambil via join). */
export interface TaskWithRelations extends Task {
  project_name: string | null
  workstream_name: string | null
  assignee_name: string | null
  assignee_email: string | null
  creator_name: string | null
}

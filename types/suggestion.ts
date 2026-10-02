import type { TaskPriority } from '@/types/task'

export type SuggestionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'REJECTED'
  | 'CONVERTED'

export interface TaskSuggestion {
  id: string
  code: string
  title: string
  description: string
  project_id: string
  workstream_id: string | null
  suggested_assignee_id: string | null
  suggested_priority: TaskPriority | null
  suggested_deadline: string | null
  suggested_by: string
  reviewer_id: string | null
  review_note: string | null
  status: SuggestionStatus
  converted_task_id: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type SuggestionListItem = Pick<
  TaskSuggestion,
  'id' | 'code' | 'title' | 'project_id' | 'status' | 'suggested_by' | 'created_at' | 'updated_at'
>

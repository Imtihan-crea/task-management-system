export type ProjectStatus =
  | 'PLANNING'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'

export interface Project {
  id: string
  name: string
  client: string | null
  description: string | null
  project_manager_id: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export type ProjectListItem = Pick<
  Project,
  'id' | 'name' | 'client' | 'project_manager_id' | 'end_date' | 'status' | 'created_at'
>

export interface ProjectProgress {
  total: number
  completed: number
  inProgress: number
  blocked: number
  todo: number
  percent: number
}

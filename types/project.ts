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
  /** PM project ini tinggal di tabel relasi project_managers. */
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export type ProjectListItem = Pick<
  Project,
  'id' | 'name' | 'client' | 'end_date' | 'status' | 'created_at'
>

export interface ProjectProgress {
  total: number
  completed: number
  inProgress: number
  blocked: number
  todo: number
  percent: number
}

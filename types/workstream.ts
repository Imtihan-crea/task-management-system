export interface Workstream {
  id: string
  project_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type WorkstreamListItem = Pick<
  Workstream,
  'id' | 'project_id' | 'name' | 'description' | 'created_at'
> & { task_count?: number }

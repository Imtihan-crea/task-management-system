export interface Workstream {
  id: string
  project_id: string
  /** Kode readable per project: "A", "B", ... (dibuat otomatis). */
  code: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type WorkstreamListItem = Pick<
  Workstream,
  'id' | 'project_id' | 'code' | 'name' | 'description' | 'created_at'
> & { task_count?: number }

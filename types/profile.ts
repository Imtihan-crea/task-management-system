export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER' | 'VIEWER'

export interface Profile {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

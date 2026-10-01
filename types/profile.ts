export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER' | 'VIEWER'

export type UserStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE'

export interface Profile {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  /** Sumber kebenaran tunggal untuk status user. */
  status: UserStatus
  /**
   * Generated column di database (status = 'ACTIVE').
   * Jangan dipakai untuk logika bisnis, baca `status`.
   */
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ProfileListItem = Pick<
  Profile,
  'id' | 'full_name' | 'email' | 'role' | 'status' | 'created_at'
>

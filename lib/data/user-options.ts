import type { UserRole } from '@/types/profile'

export type UserOption = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
}

export function displayName(user: UserOption): string {
  return user.full_name || user.email
}

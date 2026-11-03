import { requireProfileForPasswordChange } from '@/lib/auth/session'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'

export default async function ChangePasswordPage() {
  const profile = await requireProfileForPasswordChange()

  return <ChangePasswordForm email={profile.email} />
}

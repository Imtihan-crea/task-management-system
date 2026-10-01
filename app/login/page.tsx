import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams

  const inactiveMessage =
    reason === 'inactive'
      ? 'Your account is inactive. Please contact an administrator.'
      : undefined

  return <LoginForm inactiveMessage={inactiveMessage} />
}

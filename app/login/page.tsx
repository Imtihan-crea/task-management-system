import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams

  const inactiveMessage =
    reason === 'inactive'
      ? 'Akun Anda nonaktif. Silakan hubungi administrator.'
      : reason === 'password-changed'
        ? 'Password sudah diubah. Masuk dengan password baru.'
        : undefined

  return <LoginForm inactiveMessage={inactiveMessage} />
}

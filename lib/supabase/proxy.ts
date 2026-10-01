import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

/**
 * Menjalankan dua hal sekaligus:
 * 1. Refresh session Supabase (supaya user tidak diam-diam logout).
 * 2. Menjaga route: hanya user ACTIVE yang boleh masuk halaman protected.
 *
 * Ini "optimistic check" yang cheaply. Checks yang benar-benar menentukan
 * izin tetap diulang di lib/auth/session.ts dan di database (RLS).
 */
export async function updateSession(request: NextRequest) {
  const cookieWrites: CookieToSet[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookieWrites.push(...cookiesToSet)
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isLoginPage = path === '/login'
  const isProtected = !isLoginPage

  let response: NextResponse

  // Belum login tapi buka halaman protected -> ke /login
  if (!user && isProtected) {
    response = NextResponse.redirect(new URL('/login', request.url))
  } else if (user && isLoginPage) {
    // Sudah login tapi buka /login -> ke /dashboard
    response = NextResponse.redirect(new URL('/dashboard', request.url))
  } else if (user) {
    // Cek status user. Session aktif harus dianggap tidak valid
    // pada akses berikutnya kalau user sudah di-deactivate (PRD section 21).
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single<{ status: string }>()

    if (!profile || profile.status !== 'ACTIVE') {
      await supabase.auth.signOut()
      const url = new URL('/login', request.url)
      url.searchParams.set('reason', 'inactive')
      response = NextResponse.redirect(url)
    } else {
      response = NextResponse.next({ request })
    }
  } else {
    response = NextResponse.next({ request })
  }

  // Terapkan cookie refresh / cookie logout ke response yang dikirim
  cookieWrites.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}

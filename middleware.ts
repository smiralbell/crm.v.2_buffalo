import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Si la petición llega por el host de formularios públicos
 * (NEXT_PUBLIC_FORMS_BASE_URL / FORMS_PUBLIC_HOST), solo se permiten
 * /f/* y /api/f/*. El resto (incluido /login) se bloquea.
 */
function formsHostFromEnv(): string | null {
  const explicit = (process.env.FORMS_PUBLIC_HOST || '').trim().toLowerCase()
  if (explicit) return explicit.replace(/:\d+$/, '')
  const base = (process.env.NEXT_PUBLIC_FORMS_BASE_URL || process.env.FORMS_BASE_URL || '').trim()
  if (!base) return null
  try {
    return new URL(base).host.toLowerCase().replace(/:\d+$/, '')
  } catch {
    return null
  }
}

function isAllowedOnFormsHost(pathname: string): boolean {
  if (pathname === '/f' || pathname.startsWith('/f/')) return true
  if (pathname.startsWith('/api/f/') || pathname === '/api/f') return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname === '/favicon.ico') return true
  if (pathname.startsWith('/public-forms')) return true
  return false
}

export function middleware(req: NextRequest) {
  const formsHost = formsHostFromEnv()
  if (!formsHost) return NextResponse.next()

  const host = (req.headers.get('host') || '').split(':')[0]?.toLowerCase()
  if (!host || host !== formsHost) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (isAllowedOnFormsHost(pathname)) {
    return NextResponse.next()
  }

  // No login ni CRM en este dominio
  const url = req.nextUrl.clone()
  url.pathname = '/public-forms-home'
  url.search = ''
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}

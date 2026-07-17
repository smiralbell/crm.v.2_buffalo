'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import type { AuthUser } from '@/lib/auth'
import { canAccessPage, defaultHomeForRole } from '@/lib/auth-rbac'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = router.pathname

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) {
        // Solo invalidar sesión en 401; no borrar user por errores transitorios
        if (res.status === 401) setUser(null)
        return
      }
      const data = await res.json()
      if (data?.user) setUser(data.user)
    } catch {
      // Fallo de red: mantener user actual para no romper la UI (p. ej. botón Eliminar)
    }
  }, [])

  useEffect(() => {
    if (pathname === '/login') {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [pathname, refresh])

  useEffect(() => {
    if (loading || !user || pathname === '/login') return
    if (!canAccessPage(pathname, user.role)) {
      router.replace(defaultHomeForRole(user.role))
    }
  }, [loading, user, pathname, router])

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

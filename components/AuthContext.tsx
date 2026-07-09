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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) {
        setUser(null)
        return
      }
      const data = await res.json()
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    if (router.pathname === '/login') {
      setLoading(false)
      return
    }
    refresh().finally(() => setLoading(false))
  }, [router.pathname, refresh])

  useEffect(() => {
    if (loading || !user || router.pathname === '/login') return
    if (!canAccessPage(router.pathname, user.role)) {
      router.replace(defaultHomeForRole(user.role))
    }
  }, [loading, user, router.pathname, router])

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type ThemeMode = 'light' | 'dark'

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  toggleTheme: () => void
  ready: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  ready: false,
})

const STORAGE_KEY = 'buffalo-crm-theme'

function applyLightTheme() {
  const root = document.documentElement
  root.classList.remove('dark')
  root.style.colorScheme = 'light'
  root.setAttribute('data-theme', 'light')
}

/** CRM siempre en modo claro (ignora OS / dominio / preferencia guardada). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme] = useState<ThemeMode>('light')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    applyLightTheme()
    try {
      localStorage.setItem(STORAGE_KEY, 'light')
    } catch {
      /* ignore */
    }
    setReady(true)
  }, [])

  const setTheme = useCallback((_t: ThemeMode) => {
    applyLightTheme()
    try {
      localStorage.setItem(STORAGE_KEY, 'light')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    applyLightTheme()
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

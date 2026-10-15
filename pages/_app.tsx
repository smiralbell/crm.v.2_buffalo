import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { AuthProvider } from '@/components/AuthContext'
import { ThemeProvider } from '@/components/ThemeProvider'
import '@/styles/globals.css'
import '@/styles/day-picker.css'
import '@/styles/calendario.css'
import '@/styles/buffalo-annex.css'
import '@/styles/notebook.css'

export default function App({ Component, pageProps }: AppProps) {
  // Service worker de la PWA (icono en el móvil + notificaciones push).
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return (
    <ThemeProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ThemeProvider>
  )
}

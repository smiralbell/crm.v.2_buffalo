import type { AppProps } from 'next/app'
import { AuthProvider } from '@/components/AuthContext'
import { ThemeProvider } from '@/components/ThemeProvider'
import '@/styles/globals.css'
import '@/styles/day-picker.css'
import '@/styles/calendario.css'
import '@/styles/buffalo-annex.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ThemeProvider>
  )
}

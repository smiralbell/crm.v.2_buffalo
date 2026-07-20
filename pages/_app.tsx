import type { AppProps } from 'next/app'
import { AuthProvider } from '@/components/AuthContext'
import '@/styles/globals.css'
import '@/styles/day-picker.css'
import '@/styles/calendario.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}

import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Loader2 } from 'lucide-react'

/** Redirige al creador real de Facturas Buffalo, trackeando el lead. */
export default function FacturaOnboardingRedirect() {
  const router = useRouter()
  const lead = router.query.lead

  useEffect(() => {
    if (!router.isReady) return
    const id = Number(lead)
    if (Number.isFinite(id) && id > 0) {
      void router.replace(`/invoices/new?lead=${id}`)
      return
    }
    void router.replace('/invoices/new')
  }, [router.isReady, lead, router])

  return (
    <div className="min-h-screen flex items-center justify-center gap-2 text-sm text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      Abriendo Facturas Buffalo…
    </div>
  )
}

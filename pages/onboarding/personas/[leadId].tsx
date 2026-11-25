import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import OnboardingSectionTabs from '@/components/onboarding/OnboardingSectionTabs'
import PersonaDetalle from '@/components/onboarding/persona/PersonaDetalle'
import { ChevronLeft } from 'lucide-react'

/** Ficha individual de una persona de Onboarding. */
export default function OnboardingPersonaPage() {
  const router = useRouter()
  const leadId = parseInt(String(router.query.leadId ?? ''), 10)

  return (
    <Layout>
      <div className="w-full space-y-4 -mt-2 lg:-mt-3">
        <OnboardingSectionTabs active="personas" />
        <div className="max-w-4xl mx-auto space-y-4">
          <Link href="/onboarding" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
            <ChevronLeft className="h-4 w-4" /> Volver a personas
          </Link>
          {router.isReady && Number.isFinite(leadId) && leadId > 0 ? (
            <PersonaDetalle key={leadId} leadId={leadId} />
          ) : null}
        </div>
      </div>
    </Layout>
  )
}

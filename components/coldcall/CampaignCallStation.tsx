import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { outcomeLabel } from '@/lib/coldcall/lead-table'
import type { ScriptBox } from '@/lib/coldcall/script-parser'
import type { ColdCallObjection } from '@/lib/coldcall/objections'
import type { ComercialPersona } from '@/lib/coldcall/comercial-persona'
import { DEFAULT_CEO_PERSONA } from '@/lib/coldcall/comercial-persona'
import { resolveLeadPhone, formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  History,
  Loader2,
  Phone,
} from 'lucide-react'
import CallScriptObjectionsPanel from '@/components/coldcall/CallScriptObjectionsPanel'
import type { ColumnMapping } from '@/lib/coldcall/field-mapping'
import { splitLeadDisplayFields } from '@/lib/coldcall/lead-display'
import { resolveLeadWeb, resolveLeadLinkedIn } from '@/lib/coldcall/lead-links'
import { saveLastCampaignId } from '@/lib/coldcall/last-campaign'
import CallLeadHeader from '@/components/coldcall/CallLeadHeader'
import CampaignCallOutcomes from '@/components/coldcall/CampaignCallOutcomes'
import RequestProspectsButton from '@/components/coldcall/RequestProspectsButton'
import { useAuth } from '@/components/AuthContext'

interface CallLead {
  id: number
  nombre: string
  first_name: string | null
  last_name: string | null
  telefono: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  sector: string | null
  zona: string | null
  linkedin: string | null
  web: string | null
  cif: string | null
  direccion: string | null
  stage: string
  call_attempts: number
  notas: string | null
  raw_data: Record<string, string>
  calls?: CallRecord[]
}

interface CallRecord {
  id: number
  fecha: string
  resultado: string
  duracion: number | null
  notas: string | null
}

function formatCallDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface CampaignCallStationProps {
  campaignId: string
}

export default function CampaignCallStation({ campaignId }: CampaignCallStationProps) {
  const router = useRouter()
  const { user } = useAuth()
  const leadIdParam = router.query.leadId as string | undefined

  const [loading, setLoading] = useState(true)
  const [campaignName, setCampaignName] = useState('')
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [lead, setLead] = useState<CallLead | null>(null)
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [prevId, setPrevId] = useState<number | null>(null)
  const [nextId, setNextId] = useState<number | null>(null)
  const [scriptEs, setScriptEs] = useState<ScriptBox[]>([])
  const [scriptCa, setScriptCa] = useState<ScriptBox[]>([])
  const [objectionsEs, setObjectionsEs] = useState<ColdCallObjection[]>([])
  const [objectionsCa, setObjectionsCa] = useState<ColdCallObjection[]>([])
  const [persona, setPersona] = useState<ComercialPersona>(DEFAULT_CEO_PERSONA)
  const [scriptLang, setScriptLang] = useState<'es' | 'ca'>('es')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [outcomesKey, setOutcomesKey] = useState(0)

  const load = useCallback(() => {
    if (!campaignId) return
    setLoading(true)
    setSaved(false)
    setSaveError('')
    setOutcomesKey((k) => k + 1)

    const params = leadIdParam ? `?leadId=${leadIdParam}` : ''
    fetch(`/api/coldcall/campaigns/${campaignId}/call-session${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setCampaignName(d.campaign?.name || '')
        setColumnMapping(d.campaign?.column_mapping || {})
        setLead(d.lead)
        setIndex(d.index ?? 0)
        setTotal(d.total ?? 0)
        setPrevId(d.prevId)
        setNextId(d.nextId)
        setScriptEs(d.script?.es || [])
        setScriptCa(d.script?.ca || [])
        setObjectionsEs(d.objections?.es || [])
        setObjectionsCa(d.objections?.ca || [])
        if (d.persona) setPersona(d.persona)
      })
      .catch(() => setLead(null))
      .finally(() => setLoading(false))
  }, [campaignId, leadIdParam])

  useEffect(() => {
    if (router.isReady) load()
  }, [router.isReady, load])

  useEffect(() => {
    const id = parseInt(campaignId, 10)
    if (Number.isFinite(id)) saveLastCampaignId(id)
  }, [campaignId])

  const goLead = (id: number | null) => {
    if (!id) return
    router.push(`/coldcalling/campanas/${campaignId}/llamadas?leadId=${id}`, undefined, {
      shallow: true,
    })
  }

  const advanceAfterSave = () => {
    if (nextId) goLead(nextId)
    else load()
  }

  const handleSave = async (payload: {
    resultado: string
    notas: string
    duracionSec: number | null
    callbackAt: string
    whatsappSent: boolean
    emailSent: boolean
  }) => {
    if (!lead) return
    setSaving(true)
    setSaveError('')

    const reunionFecha =
      payload.resultado === 'reunion_agendada' || payload.resultado === 'llamar_tarde'
        ? payload.callbackAt || null
        : null

    const res = await fetch('/api/coldcall/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: lead.id,
        resultado: payload.resultado,
        notas: payload.notas,
        duracion: payload.duracionSec,
        reunion_fecha: reunionFecha,
        whatsapp_enviado: payload.whatsappSent,
        email_enviado: payload.emailSent,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSaveError(data.error || 'No se pudo guardar la llamada.')
      return
    }

    setSaved(true)
    setTimeout(advanceAfterSave, 120)
  }

  const script = scriptLang === 'es' ? scriptEs : scriptCa
  const objections = scriptLang === 'es' ? objectionsEs : objectionsCa
  const leadDisplay = lead
    ? splitLeadDisplayFields({ ...lead, callsCount: lead.calls?.length ?? 0 }, columnMapping)
    : { primary: [], extra: [] }
  const leadPhone = lead ? resolveLeadPhone(lead, columnMapping) : null
  const leadPhoneDisplay = leadPhone ? formatPhoneForDisplay(leadPhone) : null
  const leadWebUrl = lead ? resolveLeadWeb(lead, columnMapping) : null
  const leadLinkedInUrl = lead ? resolveLeadLinkedIn(lead, columnMapping) : null
  const callHistory = lead?.calls ?? []

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : !lead ? (
        <div className="space-y-4">
          <Button variant="outline" size="icon" className="rounded-xl" title="Volver a leads" asChild>
            <Link href={`/coldcalling/campanas/${campaignId}`}>
              <Home className="h-5 w-5" />
            </Link>
          </Button>
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center space-y-4">
            <Phone className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-sm text-gray-500">No hay leads en esta campaña.</p>
            {user?.role === 'comercial' && (
              <RequestProspectsButton
                campaignId={Number(campaignId)}
                className="gap-2 rounded-xl mx-auto"
              />
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex items-center shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm divide-x divide-gray-200">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none rounded-l-xl" asChild>
                <Link href={`/coldcalling/campanas/${campaignId}`}>
                  <Home className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-8 rounded-none"
                disabled={!prevId}
                onClick={() => goLead(prevId)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2.5 text-sm text-gray-500 tabular-nums whitespace-nowrap">
                <span className="font-semibold text-gray-900">{index + 1}</span>
                <span className="mx-1 text-gray-300">/</span>
                <span>{total}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-8 rounded-none rounded-r-xl"
                disabled={!nextId}
                onClick={() => goLead(nextId)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {campaignName && (
              <p className="text-sm text-gray-500 truncate hidden sm:block">{campaignName}</p>
            )}
          </div>

          <CallLeadHeader
            nombre={lead.nombre}
            empresa={lead.empresa}
            cargo={lead.cargo}
            ciudad={lead.zona}
            stage={lead.stage}
            phone={leadPhone}
            phoneDisplay={leadPhoneDisplay}
            email={lead.email}
            webUrl={leadWebUrl}
            linkedinUrl={leadLinkedInUrl}
            extraFields={[...leadDisplay.primary, ...leadDisplay.extra]}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <CampaignCallOutcomes
                key={`${lead.id}-${outcomesKey}`}
                lead={lead}
                leadPhone={leadPhone}
                leadPhoneDisplay={leadPhoneDisplay}
                persona={persona}
                saving={saving}
                saved={saved}
                saveError={saveError}
                onSave={handleSave}
              />

              {callHistory.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <History className="h-4 w-4 text-gray-500" />
                    Historial
                  </div>
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {callHistory.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="font-normal text-[10px]">
                            {outcomeLabel(c.resultado)}
                          </Badge>
                          <span className="text-gray-400">{formatCallDate(c.fecha)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <CallScriptObjectionsPanel
              campaignId={campaignId}
              scriptLang={scriptLang}
              onScriptLangChange={setScriptLang}
              script={script}
              objections={objections}
            />
          </div>
        </>
      )}
    </div>
  )
}

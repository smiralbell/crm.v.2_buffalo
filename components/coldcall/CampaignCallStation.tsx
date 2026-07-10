import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { stageLabel, outcomeLabel } from '@/lib/coldcall/lead-table'
import type { ScriptBox } from '@/lib/coldcall/script-parser'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Phone,
  ThumbsUp,
  ThumbsDown,
  CalendarPlus,
  Clock,
  PhoneMissed,
  Voicemail,
  Ban,
  Check,
  History,
} from 'lucide-react'

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

const RESULTADOS = [
  { id: 'interesado', label: 'Interesado', icon: ThumbsUp },
  { id: 'reunion_agendada', label: 'Reunión', icon: CalendarPlus },
  { id: 'llamar_tarde', label: 'Llamar más tarde', icon: Clock },
  { id: 'sin_respuesta', label: 'Sin respuesta', icon: PhoneMissed },
  { id: 'buzon_voz', label: 'Buzón', icon: Voicemail },
  { id: 'no_interesado', label: 'No interesado', icon: ThumbsDown },
  { id: 'no_contactar', label: 'No contactar', icon: Ban },
]

function leadFieldCards(lead: CallLead): { label: string; value: string }[] {
  const cards: { label: string; value: string }[] = []
  const add = (label: string, v: string | null | undefined) => {
    if (v?.trim()) cards.push({ label, value: v.trim() })
  }

  add('Nombre', lead.nombre)
  add('Teléfono', lead.telefono)
  add('Correo', lead.email)
  add('Empresa', lead.empresa)
  add('Cargo', lead.cargo)
  add('Sector', lead.sector)
  add('Ciudad', lead.zona)
  add('CIF', lead.cif)
  add('Dirección', lead.direccion)
  add('LinkedIn', lead.linkedin)
  add('Web', lead.web)
  add('Estado', stageLabel(lead.stage))
  add('Llamadas', String(lead.calls?.length ?? 0))
  add('Intentos sin respuesta', String(lead.call_attempts))

  const used = new Set(cards.map((c) => c.value))
  for (const [k, v] of Object.entries(lead.raw_data || {})) {
    if (v?.trim() && !used.has(v.trim())) {
      cards.push({ label: k, value: v.trim() })
    }
  }

  return cards
}

interface CampaignCallStationProps {
  campaignId: string
}

export default function CampaignCallStation({ campaignId }: CampaignCallStationProps) {
  const router = useRouter()
  const leadIdParam = router.query.leadId as string | undefined

  const [loading, setLoading] = useState(true)
  const [campaignName, setCampaignName] = useState('')
  const [lead, setLead] = useState<CallLead | null>(null)
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [prevId, setPrevId] = useState<number | null>(null)
  const [nextId, setNextId] = useState<number | null>(null)
  const [scriptEs, setScriptEs] = useState<ScriptBox[]>([])
  const [scriptCa, setScriptCa] = useState<ScriptBox[]>([])
  const [scriptLang, setScriptLang] = useState<'es' | 'ca'>('es')

  const [resultado, setResultado] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [duracion, setDuracion] = useState('')
  const [reunionFecha, setReunionFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    if (!campaignId) return
    setLoading(true)
    setSaved(false)
    setResultado(null)
    setNotas('')
    setDuracion('')
    setReunionFecha('')

    const params = leadIdParam ? `?leadId=${leadIdParam}` : ''
    fetch(`/api/coldcall/campaigns/${campaignId}/call-session${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setCampaignName(d.campaign?.name || '')
        setLead(d.lead)
        setIndex(d.index ?? 0)
        setTotal(d.total ?? 0)
        setPrevId(d.prevId)
        setNextId(d.nextId)
        setScriptEs(d.script?.es || [])
        setScriptCa(d.script?.ca || [])
      })
      .catch(() => setLead(null))
      .finally(() => setLoading(false))
  }, [campaignId, leadIdParam])

  useEffect(() => {
    if (router.isReady) load()
  }, [router.isReady, load])

  const goLead = (id: number | null) => {
    if (!id) return
    router.push(`/coldcalling/campanas/${campaignId}/llamadas?leadId=${id}`, undefined, {
      shallow: true,
    })
  }

  const registrar = async () => {
    if (!lead || !resultado) return
    setSaving(true)
    await fetch('/api/coldcall/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: lead.id,
        resultado,
        notas,
        duracion: duracion ? parseInt(duracion, 10) * 60 : null,
        reunion_fecha: reunionFecha || null,
      }),
    })
    setSaving(false)
    setSaved(true)
    if (nextId) {
      setTimeout(() => goLead(nextId), 800)
    } else {
      load()
    }
  }

  const script = scriptLang === 'es' ? scriptEs : scriptCa
  const cards = lead ? leadFieldCards(lead) : []
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
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <Phone className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">No hay leads en esta campaña.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Navegación + datos del lead */}
          <div className="flex items-stretch gap-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 h-auto rounded-xl"
              title="Volver a leads"
              asChild
            >
              <Link href={`/coldcalling/campanas/${campaignId}`}>
                <Home className="h-5 w-5" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 h-auto rounded-xl"
              disabled={!prevId}
              title="Lead anterior"
              onClick={() => goLead(prevId)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex-1 min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Lead</p>
                <p className="text-lg font-bold text-gray-900">
                  {index + 1} <span className="text-gray-400 font-normal">de</span> {total}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {cards.map((c) => (
                  <div
                    key={`${c.label}-${c.value}`}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 min-w-[100px] max-w-[160px]"
                  >
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide truncate">
                      {c.label}
                    </p>
                    <p className="text-xs font-medium text-gray-900 truncate" title={c.value}>
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="shrink-0 h-auto rounded-xl"
              disabled={!nextId}
              title="Lead siguiente"
              onClick={() => goLead(nextId)}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Acciones + Guión */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Acciones de llamada</h2>

              <div className="grid grid-cols-2 gap-2">
                {RESULTADOS.map((r) => {
                  const Icon = r.icon
                  const active = resultado === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setResultado(r.id === resultado ? null : r.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        active
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {r.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Duración (min)</label>
                  <input
                    type="number"
                    min={0}
                    value={duracion}
                    onChange={(e) => setDuracion(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {(resultado === 'reunion_agendada' || resultado === 'llamar_tarde') && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Fecha / hora</label>
                    <input
                      type="datetime-local"
                      value={reunionFecha}
                      onChange={(e) => setReunionFecha(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notas</label>
                <Textarea
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Objeciones, próximos pasos..."
                  className="rounded-xl resize-none"
                />
              </div>

              <Button
                className="w-full rounded-xl"
                disabled={!resultado || saving || saved}
                onClick={registrar}
              >
                {saved ? (
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4" /> Guardado
                  </span>
                ) : saving ? (
                  'Guardando...'
                ) : (
                  'Guardar y siguiente'
                )}
              </Button>

              {callHistory.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <History className="h-4 w-4 text-gray-500" />
                    Historial de llamadas
                  </div>
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {callHistory.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="font-normal text-[10px]">
                            {outcomeLabel(c.resultado)}
                          </Badge>
                          <span className="text-gray-400 shrink-0">{formatCallDate(c.fecha)}</span>
                        </div>
                        {c.duracion != null && c.duracion > 0 && (
                          <p className="text-gray-500 mt-1">{Math.round(c.duracion / 60)} min</p>
                        )}
                        {c.notas?.trim() && (
                          <p className="text-gray-700 mt-1 whitespace-pre-line">{c.notas}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex border-b border-gray-100">
                {(
                  [
                    { id: 'es' as const, label: 'Castellano' },
                    { id: 'ca' as const, label: 'Català' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setScriptLang(t.id)}
                    className={`flex-1 py-2.5 text-xs font-semibold ${
                      scriptLang === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto max-h-[520px] divide-y divide-gray-100">
                {script.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500 text-center">
                    No hay guión configurado.{' '}
                    <Link
                      href={`/coldcalling/campanas/${campaignId}`}
                      className="text-gray-900 underline"
                    >
                      Configúralo en la campaña
                    </Link>
                  </p>
                ) : (
                  script.map((box, i) => (
                    <div key={i} className="p-4 space-y-2">
                      <Badge variant="secondary" className="font-semibold text-xs">
                        {box.title}
                      </Badge>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50 rounded-xl p-3 border border-gray-100">
                        {box.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

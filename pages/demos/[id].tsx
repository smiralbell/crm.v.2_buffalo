import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import DemoFormDialog, { type DemoFormValues } from '@/components/demos/DemoFormDialog'
import DemoConversationDialog from '@/components/demos/DemoConversationDialog'
import DemoOutboundFormConfigDialog, {
  type FormConfigStep,
} from '@/components/demos/DemoOutboundFormConfigDialog'
import FinanceInfoTip from '@/components/finances/FinanceInfoTip'
import type {
  DemoDetail,
  DemoListItem,
  DemoSessionRow,
  DemoVoiceSessionRow,
  FormPublicAccess,
  OutboundFormBrandingRef,
  OutboundFormFieldRef,
} from '@/lib/demos/types'
import { DEFAULT_OUTBOUND_FORM_BRANDING, normalizeOutboundFormBranding } from '@/lib/demos/form-branding'
import { DEFAULT_OUTBOUND_FORM_FIELDS } from '@/lib/demos/outbound-form'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Edit,
  Eraser,
  ExternalLink,
  Link2,
  MessageSquare,
  Palette,
  PhoneCall,
  RefreshCw,
  Search,
  Settings2,
  Users,
  XCircle,
} from 'lucide-react'

const estadoClass: Record<string, string> = {
  activa: 'bg-emerald-50 text-emerald-800',
  pausada: 'bg-amber-50 text-amber-800',
}

const sessionStatusClass: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800',
  error: 'bg-red-50 text-red-800',
  pending: 'bg-gray-100 text-gray-600',
}

const sessionStatusLabel: Record<string, string> = {
  ok: 'Correcta',
  error: 'Con error',
  pending: 'Pendiente',
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function DemoDetailPage() {
  const router = useRouter()
  const id = parseInt(router.query.id as string, 10)

  const [detail, setDetail] = useState<DemoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [formConfigOpen, setFormConfigOpen] = useState(false)
  const [formConfigStep, setFormConfigStep] = useState<FormConfigStep>('access')
  const [formFields, setFormFields] = useState<OutboundFormFieldRef[]>([])
  const [formAccess, setFormAccess] = useState<FormPublicAccess>({
    public_token: null,
    public_url: null,
    has_password: false,
  })
  const [formBranding, setFormBranding] = useState<OutboundFormBrandingRef>(
    DEFAULT_OUTBOUND_FORM_BRANDING
  )
  const [linkCopied, setLinkCopied] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/demos/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setDetail(data)
      if (data.formulario_outbound) setFormFields(data.formulario_outbound)
      if (data.form_access) setFormAccess(data.form_access)
      if (data.formulario_branding) setFormBranding(normalizeOutboundFormBranding(data.formulario_branding))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (router.isReady) load()
  }, [router.isReady, load])

  const handleUpdate = async (values: DemoFormValues) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/demos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setFormOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const clearMemory = async () => {
    setClearing(true)
    try {
      const res = await fetch(`/api/demos/${id}/memory`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al borrar memoria')
      setClearOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar memoria')
    } finally {
      setClearing(false)
    }
  }

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—'

  const m = detail?.metrics
  const vm = detail?.voice_metrics

  const isVoice = detail?.tipo === 'voz'
  const canOutbound =
    isVoice &&
    detail?.estado === 'activa' &&
    Boolean(detail.direccion && ['outbound', 'ambos'].includes(detail.direccion))

  const sessions = isVoice ? (vm?.sessions ?? []) : (m?.sessions ?? [])
  const searchNorm = search.trim().toLowerCase().replace(/\s/g, '')
  const filteredSessions = searchNorm
    ? sessions.filter((s) => {
        const phoneNorm = s.phone.toLowerCase().replace(/\s/g, '')
        const maskedNorm = s.phone_masked.toLowerCase().replace(/\s/g, '')
        const digits = s.phone.replace(/\D/g, '')
        const qDigits = searchNorm.replace(/\D/g, '')
        const voiceNombre =
          isVoice && 'nombre' in s
            ? ((s as DemoVoiceSessionRow).nombre || '').toLowerCase()
            : ''
        return (
          phoneNorm.includes(searchNorm) ||
          maskedNorm.includes(searchNorm) ||
          voiceNombre.includes(searchNorm) ||
          (qDigits.length >= 3 && digits.includes(qDigits))
        )
      })
    : sessions

  const openFormConfig = (step: FormConfigStep = 'access') => {
    setFormConfigStep(step)
    setFormConfigOpen(true)
  }

  const outboundFields =
    formFields.length > 0
      ? formFields
      : detail?.formulario_outbound?.length
        ? detail.formulario_outbound
        : DEFAULT_OUTBOUND_FORM_FIELDS

  const openConversation = (phone: string) => {
    setSelectedPhone(phone)
    setConversationOpen(true)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-xl">
              <Link href="/demos">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-gray-900">
                  {detail?.nombre_cliente || 'Demo'}
                </h1>
                {detail && (
                  <>
                    <Badge className={estadoClass[detail.estado]}>
                      {detail.estado === 'activa' ? 'Activa' : 'Pausada'}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        detail.tipo === 'voz'
                          ? 'border-violet-200 bg-violet-50 text-violet-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }
                    >
                      {detail.tipo === 'voz' ? 'Voz' : 'WhatsApp'}
                    </Badge>
                    {detail.tipo === 'voz' && detail.direccion && (
                      <Badge variant="outline" className="border-gray-200 text-gray-600">
                        {detail.direccion === 'inbound'
                          ? 'Inbound'
                          : detail.direccion === 'outbound'
                            ? 'Outbound'
                            : 'Ambos'}
                      </Badge>
                    )}
                  </>
                )}
              </div>
              {detail?.tipo !== 'voz' && (
                <p className="mt-1 text-sm text-gray-500">Métricas y pruebas del agente WhatsApp</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              disabled={loading}
              className="rounded-xl border-gray-200"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              onClick={() => setClearOpen(true)}
              className="rounded-xl border-gray-200"
              disabled={!detail || isVoice || (m?.testers_count ?? 0) === 0}
            >
              <Eraser className="mr-2 h-4 w-4" />
              Borrar memoria
            </Button>
            <Button
              variant="outline"
              onClick={() => setFormOpen(true)}
              className="rounded-xl"
              disabled={!detail}
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading && !detail ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            Cargando…
          </div>
        ) : detail && (isVoice ? vm : m) ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-gray-100 p-3">
                    <Users className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {isVoice ? vm!.testers_count : m!.testers_count}
                    </p>
                    <p className="text-sm text-gray-500">
                      {isVoice ? 'Contactos llamados' : 'Personas que probaron'}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {isVoice ? vm!.successful_count : m!.successful_count}
                    </p>
                    <p className="text-sm text-gray-500">
                      {isVoice ? 'Llamadas correctas' : 'Pruebas satisfactorias'}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-red-50 p-3">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {isVoice ? vm!.failed_count : m!.failed_count}
                    </p>
                    <p className="text-sm text-gray-500">
                      {isVoice ? 'Llamadas con error' : 'Pruebas con error'}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`rounded-xl p-3 ${isVoice ? 'bg-violet-50' : 'bg-sky-50'}`}>
                    {isVoice ? (
                      <PhoneCall className="h-5 w-5 text-violet-700" />
                    ) : (
                      <MessageSquare className="h-5 w-5 text-sky-700" />
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {isVoice
                        ? vm!.total_calls
                        : m!.total_user_messages + m!.total_assistant_messages}
                    </p>
                    <p className="text-sm text-gray-500">
                      {isVoice ? 'Llamadas totales' : 'Mensajes totales'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {canOutbound && (
              <Card className="border border-violet-200 shadow-sm">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-base font-semibold text-gray-900">Formulario</span>
                    <FinanceInfoTip text="Enlace público con contraseña para que el cliente pida la demo por teléfono. Configura logo, colores y campos; cuando la contraseña esté lista, copia y comparte el enlace." />
                  </div>

                  {formAccess.public_url ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
                        <Link2 className="h-4 w-4 shrink-0 text-violet-600" />
                        <span className="truncate font-mono text-xs text-gray-700">
                          {formAccess.public_url}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-xl"
                        onClick={async () => {
                          if (!formAccess.public_url) return
                          await navigator.clipboard.writeText(formAccess.public_url)
                          setLinkCopied(true)
                          setTimeout(() => setLinkCopied(false), 2000)
                        }}
                      >
                        {linkCopied ? 'Copiado' : 'Copiar'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 rounded-xl"
                        asChild
                      >
                        <a
                          href={formAccess.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir formulario en nueva pestaña"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="min-w-0 flex-1 text-sm text-amber-800">
                      Configura una contraseña para generar el enlace.
                    </p>
                  )}

                  <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-violet-200 text-violet-800"
                      onClick={() => openFormConfig('design')}
                    >
                      <Palette className="mr-2 h-4 w-4" />
                      Logo y colores
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-violet-200 text-violet-800"
                      onClick={() => openFormConfig('access')}
                    >
                      <Settings2 className="mr-2 h-4 w-4" />
                      Configurar formulario
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">
                  {isVoice ? 'Contactos de esta demo' : 'Usuarios que probaron la demo'}
                </CardTitle>
                {sessions.length > 0 && (
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por teléfono…"
                      className="rounded-xl border-gray-200 pl-9"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-center text-gray-500">
                    <Bot className="mb-2 h-8 w-8 text-gray-300" />
                    <p>{isVoice ? 'Aún no hay llamadas registradas' : 'Nadie ha probado esta demo todavía'}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {isVoice
                        ? 'Cuando lances una llamada outbound, aparecerá aquí'
                        : 'Cuando alguien escriba por WhatsApp, aparecerá aquí'}
                    </p>
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500">
                    Ningún usuario coincide con «{search}»
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          <th className="p-4">Teléfono</th>
                          {isVoice && <th className="p-4">Nombre</th>}
                          <th className="p-4">Estado</th>
                          <th className="p-4">{isVoice ? 'Llamadas' : 'Mensajes'}</th>
                          <th className="p-4">Última actividad</th>
                          {!isVoice && <th className="p-4 w-10" />}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSessions.map((s) => {
                          const voiceSession = isVoice ? (s as DemoVoiceSessionRow) : null
                          const waSession = !isVoice ? (s as DemoSessionRow) : null

                          return (
                          <tr
                            key={s.phone}
                            onClick={() => !isVoice && openConversation(s.phone)}
                            className={`border-b border-gray-50 transition-colors ${
                              isVoice ? '' : 'cursor-pointer hover:bg-gray-50'
                            }`}
                          >
                            <td className="p-4 font-mono text-sm text-gray-800">{s.phone}</td>
                            {isVoice && (
                              <td className="p-4 text-sm text-gray-700">
                                {voiceSession?.nombre || '—'}
                              </td>
                            )}
                            <td className="p-4">
                              <Badge className={sessionStatusClass[s.status]}>
                                {sessionStatusLabel[s.status]}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-600">
                              {isVoice
                                ? `${voiceSession?.calls_count ?? 0} llamada(s)`
                                : `${waSession?.user_messages ?? 0} usuario · ${waSession?.assistant_messages ?? 0} agente`}
                            </td>
                            <td className="p-4 text-sm text-gray-500">{fmtDate(s.updated_at)}</td>
                            {!isVoice && (
                              <td className="p-4 text-gray-400">
                                <ChevronRight className="h-4 w-4" />
                              </td>
                            )}
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {isVoice && (
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="space-y-2 p-5 text-sm text-gray-600">
                  <p>
                    <span className="font-medium text-gray-800">Voice ID:</span>{' '}
                    <span className="font-mono">{detail.voz_id || '—'}</span>
                  </p>
                  <p>
                    <span className="font-medium text-gray-800">Agente Retell:</span>{' '}
                    <span className="font-mono text-xs">{detail.retell_agent_id || '—'}</span>
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>

      {detail && (
        <DemoFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          demo={detail as DemoListItem}
          onSubmit={handleUpdate}
          saving={saving}
        />
      )}

      <DemoConversationDialog
        open={conversationOpen}
        onOpenChange={setConversationOpen}
        demoId={id}
        phone={selectedPhone}
      />

      {isVoice && (
        <DemoOutboundFormConfigDialog
          open={formConfigOpen}
          onOpenChange={setFormConfigOpen}
          demoId={id}
          demoNombre={detail?.nombre_cliente ?? 'Demo'}
          initialFields={outboundFields}
          initialAccess={formAccess}
          initialBranding={formBranding}
          initialStep={formConfigStep}
          onSaved={(fields, access, branding) => {
            setFormFields(fields)
            setFormAccess(access)
            setFormBranding(branding)
            setDetail((d) =>
              d
                ? {
                    ...d,
                    formulario_outbound: fields,
                    form_access: access,
                    formulario_branding: branding,
                  }
                : d
            )
          }}
        />
      )}

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Borrar memoria de la demo</DialogTitle>
            <DialogDescription>
              Se eliminará todo el historial de conversación de{' '}
              <strong>{detail?.nombre_cliente}</strong>. El agente volverá a empezar de cero con
              cada número, como si fuera la primera vez. Los números autorizados no se borran.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={clearMemory} disabled={clearing} className="rounded-xl">
              {clearing ? 'Borrando…' : 'Borrar memoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}

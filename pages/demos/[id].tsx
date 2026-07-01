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
import type { DemoDetail, DemoListItem } from '@/lib/demos/types'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Edit,
  Eraser,
  MessageSquare,
  RefreshCw,
  Search,
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

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/demos/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setDetail(data)
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

  const sessions = m?.sessions ?? []
  const searchNorm = search.trim().toLowerCase().replace(/\s/g, '')
  const filteredSessions = searchNorm
    ? sessions.filter((s) => {
        const phoneNorm = s.phone.toLowerCase().replace(/\s/g, '')
        const maskedNorm = s.phone_masked.toLowerCase().replace(/\s/g, '')
        const digits = s.phone.replace(/\D/g, '')
        const qDigits = searchNorm.replace(/\D/g, '')
        return (
          phoneNorm.includes(searchNorm) ||
          maskedNorm.includes(searchNorm) ||
          (qDigits.length >= 3 && digits.includes(qDigits))
        )
      })
    : sessions

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
                  <Badge className={estadoClass[detail.estado]}>
                    {detail.estado === 'activa' ? 'Activa' : 'Pausada'}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">Métricas y pruebas del agente</p>
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
              disabled={!detail || (m?.testers_count ?? 0) === 0}
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
        ) : detail && m ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-gray-100 p-3">
                    <Users className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">{m.testers_count}</p>
                    <p className="text-sm text-gray-500">Personas que probaron</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">{m.successful_count}</p>
                    <p className="text-sm text-gray-500">Pruebas satisfactorias</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-red-50 p-3">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">{m.failed_count}</p>
                    <p className="text-sm text-gray-500">Pruebas con error</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-sky-50 p-3">
                    <MessageSquare className="h-5 w-5 text-sky-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {m.total_user_messages + m.total_assistant_messages}
                    </p>
                    <p className="text-sm text-gray-500">Mensajes totales</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="text-sm text-gray-500">
              Última actividad: {fmtDate(m.last_activity_at)}
            </p>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Usuarios que probaron la demo</CardTitle>
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
                    <p>Nadie ha probado esta demo todavía</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Cuando alguien escriba por WhatsApp, aparecerá aquí
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
                          <th className="p-4">Estado</th>
                          <th className="p-4">Mensajes</th>
                          <th className="p-4">Última actividad</th>
                          <th className="p-4 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSessions.map((s) => (
                          <tr
                            key={s.phone}
                            onClick={() => openConversation(s.phone)}
                            className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50"
                          >
                            <td className="p-4 font-mono text-sm text-gray-800">{s.phone}</td>
                            <td className="p-4">
                              <Badge className={sessionStatusClass[s.status]}>
                                {sessionStatusLabel[s.status]}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-600">
                              {s.user_messages} usuario · {s.assistant_messages} agente
                            </td>
                            <td className="p-4 text-sm text-gray-500">{fmtDate(s.updated_at)}</td>
                            <td className="p-4 text-gray-400">
                              <ChevronRight className="h-4 w-4" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
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

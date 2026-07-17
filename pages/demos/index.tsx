import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { defaultHomeForRole } from '@/lib/auth-rbac'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import DemoFormDialog, { type DemoFormValues } from '@/components/demos/DemoFormDialog'
import PhoneConflictDialog from '@/components/demos/PhoneConflictDialog'
import { useMeetingReminders, DemoPrepReminders } from '@/components/coldcall/MeetingReminders'
import type { DemoListItem, PhoneConflict } from '@/lib/demos/types'
import Link from 'next/link'
import {
  Bot,
  CalendarClock,
  ChevronRight,
  Edit,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Phone,
} from 'lucide-react'
import OnboardingSectionTabs from '@/components/onboarding/OnboardingSectionTabs'

type DemosTab = 'agentes' | 'preparar'

function DemoPrepTabPanel() {
  const { demoPrep, canSeeDemoPrep, loading, reload } = useMeetingReminders()

  if (loading && demoPrep.length === 0) {
    return (
      <div className="flex justify-center py-16 text-gray-500">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Cargando avisos…
      </div>
    )
  }

  if (!canSeeDemoPrep) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
        No tienes permisos para ver el checklist de preparación de demos.
      </div>
    )
  }

  if (demoPrep.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center">
        <CalendarClock className="h-10 w-10 text-gray-300 mx-auto" />
        <p className="mt-3 text-sm text-gray-600">Nada que preparar ahora</p>
        <p className="mt-1 text-xs text-gray-400">
          Cuando haya reuniones próximas, aparecerán aquí con notas y checklist.
        </p>
        <Button variant="outline" size="sm" className="mt-4 rounded-xl gap-1.5" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>
    )
  }

  return <DemoPrepReminders items={demoPrep} onChanged={reload} />
}

const estadoClass: Record<string, string> = {
  activa: 'bg-emerald-50 text-emerald-800',
  pausada: 'bg-amber-50 text-amber-800',
}

const tipoClass: Record<string, string> = {
  whatsapp: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  voz: 'bg-violet-50 text-violet-800 border-violet-200',
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') {
      // Comerciales con acceso a prep van a su página; no a /demos (RBAC).
      if (user.role === 'comercial') {
        return { redirect: { destination: '/comercial/preparar-demos', permanent: false } }
      }
      return { redirect: { destination: defaultHomeForRole(user.role), permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function DemosPage() {
  const router = useRouter()
  const tab: DemosTab = router.query.tab === 'preparar' ? 'preparar' : 'agentes'

  const setTab = (next: DemosTab) => {
    void router.replace(
      next === 'preparar' ? { pathname: '/demos', query: { tab: 'preparar' } } : '/demos',
      undefined,
      { shallow: true }
    )
  }

  const [demos, setDemos] = useState<DemoListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DemoListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DemoListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [phoneConflicts, setPhoneConflicts] = useState<PhoneConflict[]>([])
  const [pendingSave, setPendingSave] = useState<DemoFormValues | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [movingPhones, setMovingPhones] = useState(false)
  const [search, setSearch] = useState('')

  const activeCount = useMemo(
    () => demos.filter((d) => d.estado === 'activa').length,
    [demos]
  )

  const filteredDemos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return demos
    return demos.filter((d) => {
      const haystack = [
        d.nombre_cliente,
        d.tipo,
        d.direccion ?? '',
        d.estado,
        String(d.numeros_count),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [demos, search])

  const saveDemo = async (
    values: DemoFormValues,
    options?: { mover_numeros?: boolean; demoId?: number }
  ) => {
    const isEdit = Boolean(options?.demoId)
    const url = isEdit ? `/api/demos/${options!.demoId}` : '/api/demos'
    const method = isEdit ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        mover_numeros: options?.mover_numeros ?? false,
      }),
    })
    const data = await res.json()

    if (res.status === 409 && data.error === 'phone_conflict') {
      setPhoneConflicts(data.conflicts || [])
      setPendingSave(values)
      setConflictOpen(true)
      throw new Error('PHONE_CONFLICT')
    }

    if (!res.ok) throw new Error(data.message || data.error || 'Error al guardar')
    return data
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/demos')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar demos')
      setDemos(data.demos || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
      setDemos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const handleCreate = async (values: DemoFormValues) => {
    setSaving(true)
    try {
      await saveDemo(values)
      setFormOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (values: DemoFormValues) => {
    if (!editing) return
    setSaving(true)
    try {
      await saveDemo(values, { demoId: editing.id })
      setEditing(null)
      setFormOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const confirmMovePhones = async () => {
    if (!pendingSave) return
    setMovingPhones(true)
    try {
      if (editing) {
        await saveDemo(pendingSave, { demoId: editing.id, mover_numeros: true })
        setEditing(null)
      } else {
        await saveDemo(pendingSave, { mover_numeros: true })
      }
      setConflictOpen(false)
      setPendingSave(null)
      setPhoneConflicts([])
      setFormOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al mover números')
    } finally {
      setMovingPhones(false)
      setSaving(false)
    }
  }

  const toggleEstado = async (demo: DemoListItem) => {
    const nuevo = demo.estado === 'activa' ? 'pausada' : 'activa'
    try {
      const res = await fetch(`/api/demos/${demo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/demos/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <OnboardingSectionTabs active="demos" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Demos</h1>
            <p className="text-sm text-gray-500 mt-1">
              Agentes de demo y checklist para llegar listo a las reuniones.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-0.5 self-start">
            <Button
              type="button"
              size="sm"
              variant={tab === 'agentes' ? 'default' : 'ghost'}
              className={`rounded-lg gap-1.5 h-8 ${
                tab === 'agentes' ? 'bg-gray-900 hover:bg-gray-800' : 'text-gray-600'
              }`}
              onClick={() => setTab('agentes')}
            >
              <Bot className="h-3.5 w-3.5" />
              Agentes
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === 'preparar' ? 'default' : 'ghost'}
              className={`rounded-lg gap-1.5 h-8 ${
                tab === 'preparar' ? 'bg-gray-900 hover:bg-gray-800' : 'text-gray-600'
              }`}
              onClick={() => setTab('preparar')}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Preparar
            </Button>
          </div>
        </div>

        {tab === 'preparar' ? (
          <div className="space-y-3 max-w-3xl">
            <p className="text-sm text-gray-500">
              Avisos de reuniones próximas: despacho, notas y checklist para la demo.
            </p>
            <DemoPrepTabPanel />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
                <div className="relative w-full min-w-[200px] max-w-md flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar demos…"
                    className="rounded-xl border-gray-200 pl-9"
                  />
                </div>
                <Badge variant="outline" className="shrink-0 border-gray-200 text-gray-700 font-normal">
                  {demos.length} {demos.length === 1 ? 'demo' : 'demos'}
                </Badge>
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800 font-normal"
                >
                  {activeCount} activas
                </Badge>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={load}
                  disabled={loading}
                  className="rounded-xl border-gray-200"
                  title="Actualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                  className="rounded-xl"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Demo
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <Card className="border border-gray-200 shadow-sm">
              <CardContent className="p-0">
                {loading && demos.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-500">
                    <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                    Cargando demos…
                  </div>
                ) : demos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Bot className="mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-600">No hay demos todavía</p>
                    <p className="mt-1 text-sm text-gray-400">
                      Crea la primera demo para un cliente
                    </p>
                    <Button
                      className="mt-4 rounded-xl"
                      onClick={() => {
                        setEditing(null)
                        setFormOpen(true)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Nueva Demo
                    </Button>
                  </div>
                ) : filteredDemos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Search className="mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-600">Ninguna demo coincide con la búsqueda</p>
                    <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setSearch('')}>
                      Limpiar búsqueda
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          <th className="p-4">Cliente</th>
                          <th className="p-4">Tipo</th>
                          <th className="p-4">Estado</th>
                          <th className="p-4">Teléfonos</th>
                          <th className="p-4">Creada</th>
                          <th className="p-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDemos.map((demo) => (
                          <tr key={demo.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                            <td className="p-4">
                              <Link
                                href={`/demos/${demo.id}`}
                                className="group block"
                              >
                                <div className="flex items-center gap-1 font-medium text-gray-900 group-hover:text-gray-700">
                                  {demo.nombre_cliente}
                                  <ChevronRight className="h-4 w-4 text-gray-300 opacity-0 transition group-hover:opacity-100" />
                                </div>
                              </Link>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={tipoClass[demo.tipo] || 'bg-gray-100 text-gray-700'}
                                >
                                  {demo.tipo === 'voz' ? 'Voz' : 'WhatsApp'}
                                </Badge>
                                {demo.es_principal && (
                                  <Badge className="bg-blue-50 text-blue-800 border border-blue-200">
                                    Principal Buffalo
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <Badge className={estadoClass[demo.estado] || 'bg-gray-100 text-gray-700'}>
                                {demo.estado === 'activa' ? 'Activa' : 'Pausada'}
                              </Badge>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Phone className="h-3.5 w-3.5 text-gray-400" />
                                {demo.numeros_count}
                              </div>
                            </td>
                            <td className="p-4 text-sm text-gray-600">{fmtDate(demo.created_at)}</td>
                            <td className="p-4">
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button variant="ghost" size="icon" title="Ver detalle" asChild>
                                  <Link href={`/demos/${demo.id}`}>
                                    <ChevronRight className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={demo.estado === 'activa' ? 'Pausar' : 'Activar'}
                                  onClick={() => toggleEstado(demo)}
                                >
                                  {demo.estado === 'activa' ? (
                                    <Pause className="h-4 w-4" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar"
                                  onClick={() => {
                                    setEditing(demo)
                                    setFormOpen(true)
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Eliminar"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => setDeleteTarget(demo)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
        )}
      </div>

      <DemoFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        demo={editing}
        allDemos={demos}
        onSubmit={editing ? handleUpdate : handleCreate}
        saving={saving}
      />

      <PhoneConflictDialog
        open={conflictOpen}
        onOpenChange={(open) => {
          setConflictOpen(open)
          if (!open) {
            setPendingSave(null)
            setPhoneConflicts([])
          }
        }}
        conflicts={phoneConflicts}
        targetDemoName={pendingSave?.nombre_cliente || editing?.nombre_cliente || 'esta demo'}
        onConfirmMove={confirmMovePhones}
        onCancel={() => {
          setConflictOpen(false)
          setPendingSave(null)
          setPhoneConflicts([])
        }}
        moving={movingPhones}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Eliminar demo</DialogTitle>
            <DialogDescription>
              ¿Eliminar la demo de <strong>{deleteTarget?.nombre_cliente}</strong>? Se borrarán
              también los números y el historial de conversación asociados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-xl"
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}

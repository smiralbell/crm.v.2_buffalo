import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
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
import PhoneConflictDialog from '@/components/demos/PhoneConflictDialog'
import type { DemoListItem, PhoneConflict } from '@/lib/demos/types'
import Link from 'next/link'
import {
  Bot,
  ChevronRight,
  Edit,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Phone,
} from 'lucide-react'

const estadoClass: Record<string, string> = {
  activa: 'bg-emerald-50 text-emerald-800',
  pausada: 'bg-amber-50 text-amber-800',
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function DemosPage() {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Demos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Agentes de WhatsApp de demostración para clientes
            </p>
          </div>
          <div className="flex gap-2">
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
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4">Teléfonos</th>
                      <th className="p-4">Creada</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demos.map((demo) => (
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
                            <div className="mt-0.5 line-clamp-1 text-xs text-gray-400">
                              {demo.prompt.slice(0, 80)}
                              {demo.prompt.length > 80 ? '…' : ''}
                            </div>
                          </Link>
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
                          {demo.numeros.length > 0 && (
                            <div className="mt-1 font-mono text-xs text-gray-400">
                              {demo.numeros.slice(0, 2).join(', ')}
                              {demo.numeros.length > 2 ? ` +${demo.numeros.length - 2}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-sm text-gray-600">{fmtDate(demo.created_at)}</td>
                        <td className="p-4">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Ver métricas" asChild>
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
      </div>

      <DemoFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        demo={editing}
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

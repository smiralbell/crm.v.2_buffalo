import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { DeveloperAssignment } from '@/lib/developer/assignments'

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  cancelled: 'Cancelada',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <div className="text-sm text-gray-800 whitespace-pre-wrap">{children}</div>
    </div>
  )
}

export default function AsignacionDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [assignment, setAssignment] = useState<DeveloperAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)

  const load = useCallback(() => {
    if (!router.isReady || !id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    fetch(`/api/gestion-proyecto/asignaciones/${id}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error al cargar')
        setAssignment(d.assignment)
      })
      .catch((e: Error) => {
        setAssignment(null)
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [router.isReady, id])

  useEffect(() => {
    load()
  }, [load])

  const setStatus = async (status: DeveloperAssignment['status']) => {
    if (!assignment) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/gestion-proyecto/asignaciones/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      setAssignment(data.assignment)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Layout>
      <div className="w-full max-w-3xl mx-auto space-y-6 pb-10">
        <Link
          href="/gestion-proyecto"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Proyectos
        </Link>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : assignment ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Tarea puntual</p>
                <h1 className="text-xl font-bold text-gray-900 mt-1">{assignment.title}</h1>
                {assignment.summary && (
                  <p className="text-sm text-gray-600 mt-2">{assignment.summary}</p>
                )}
                {assignment.due_date && (
                  <p className="text-xs text-gray-400 mt-2">
                    Fecha límite:{' '}
                    {new Date(assignment.due_date).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <Badge variant="secondary">{statusLabel[assignment.status] || assignment.status}</Badge>
            </div>

            <div className="space-y-3">
              <Section title="Qué tienes que hacer">{assignment.scope_text}</Section>
              <Section title="Entregables">{assignment.deliverables}</Section>
              <Section title="Enlaces y referencias">{assignment.reference_links}</Section>
            </div>

            {!isAdmin && assignment.status !== 'done' && assignment.status !== 'cancelled' && (
              <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-2">
                {assignment.status === 'pending' && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={updating}
                    onClick={() => setStatus('in_progress')}
                  >
                    Empezar
                  </Button>
                )}
                <Button
                  className="rounded-xl"
                  disabled={updating}
                  onClick={() => setStatus('done')}
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Marcar como hecha'}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  )
}

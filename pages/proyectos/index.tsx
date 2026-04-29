import { GetServerSideProps } from 'next'
import { useState } from 'react'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { listEvaluationProjectsForUI } from '@/lib/evaluation-projects'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Briefcase, Plus } from 'lucide-react'
import { useRouter } from 'next/router'
import { ClientSuggestCombobox } from '@/components/ClientSuggestCombobox'

export type ProjectRow = {
  id: number
  name: string
  client_name: string | null
  is_active: boolean
  tags: string[]
  opened_at: string
  closed_at: string | null
  updated_at: string
  days_open: number
  avg_rating: number | null
  last_entry_at: string | null
  last_entry_preview: string | null
}

interface Props {
  projects: ProjectRow[]
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  try {
    const projects = await listEvaluationProjectsForUI()
    return { props: { projects } }
  } catch (e) {
    console.error('[proyectos GSSP]', e)
    return { props: { projects: [] } }
  }
}

export default function ProyectosPage({ projects: initialProjects }: Props) {
  const router = useRouter()
  const [projects, setProjects] = useState(initialProjects)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    is_active: true,
  })

  const refresh = async () => {
    const r = await fetch('/api/projects')
    if (r.ok) {
      const d = await r.json()
      setProjects(d.projects || [])
    }
  }

  const createProject = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          client_name: form.client_name.trim() || null,
          tags: [],
          is_active: form.is_active,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string; hint?: string; detail?: string }))
        const lines = [err.error, err.hint, err.detail].filter(Boolean)
        alert(lines.length > 0 ? lines.join('\n\n') : 'No se pudo crear el proyecto')
        return
      }
      setOpen(false)
      setForm({ name: '', client_name: '', is_active: true })
      await refresh()
      const data = await res.json()
      if (data.project?.id) {
        router.push(`/proyectos/${data.project.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const formatLastEntryDate = (iso: string | null) => {
    if (!iso) return 'Sin bitácoras'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Sin fecha'
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Proyectos</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo proyecto
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo proyecto</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="p-name">Nombre del proyecto</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej. Web corporativa ACME"
                  />
                </div>
                <ClientSuggestCombobox
                  id="p-client"
                  label="Cliente"
                  value={form.client_name}
                  onChange={(client_name) => setForm((f) => ({ ...f, client_name }))}
                  placeholder="Busca por nombre, empresa o email…"
                />
                <div className="flex items-center gap-2">
                  <input
                    id="p-active"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  <Label htmlFor="p-active" className="text-sm font-normal">
                    Proyecto activo
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={createProject} disabled={saving || !form.name.trim()}>
                  {saving ? 'Guardando…' : 'Crear'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Briefcase className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">Aún no hay proyectos. Crea el primero para empezar la bitácora.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Listado</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 sm:p-6">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-medium">Proyecto</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Días abierto</th>
                    <th className="px-4 py-3 font-medium">Última actualización</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50/80"
                      onClick={() => router.push(`/proyectos/${p.id}`)}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/proyectos/${p.id}`} className="font-medium text-blue-700 hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{p.client_name || '—'}</td>
                      <td className="px-4 py-3">
                        {p.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-800">Activo</Badge>
                        ) : (
                          <Badge variant="secondary">Cerrado</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{p.days_open}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {p.last_entry_at ? (
                          <span>{formatLastEntryDate(p.last_entry_at)}</span>
                        ) : (
                          <span className="italic text-gray-400">{formatLastEntryDate(null)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}

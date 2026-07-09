import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ExternalLink, FileUp, Link2, Trash2 } from 'lucide-react'
import type { ProjectDoc, ProjectOnboarding } from '@/lib/gestion-proyecto/types'

const FIELDS: { key: keyof ProjectOnboarding; label: string; rows: number }[] = [
  { key: 'summary', label: 'Resumen del proyecto', rows: 4 },
  { key: 'scope_text', label: 'Alcance técnico (incluye / no incluye)', rows: 5 },
  { key: 'stack_text', label: 'Stack técnico y herramientas', rows: 4 },
  { key: 'deliverables', label: 'Entregables y fases', rows: 4 },
  { key: 'contacts', label: 'Equipo del proyecto', rows: 3 },
  { key: 'internal_notes', label: 'Notas técnicas', rows: 4 },
]

interface ProjectOnboardingPanelProps {
  projectId: string
  onboarding: ProjectOnboarding
  docs: ProjectDoc[]
  onOnboardingChange: (onboarding: ProjectOnboarding) => void
  onDocsChange: (docs: ProjectDoc[]) => void
}

export default function ProjectOnboardingPanel({
  projectId,
  onboarding,
  docs,
  onOnboardingChange,
  onDocsChange,
}: ProjectOnboardingPanelProps) {
  const [saving, setSaving] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [fileTitle, setFileTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const saveOnboarding = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboarding),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      onOnboardingChange({ ...onboarding, ...data })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const addLink = async () => {
    if (!linkTitle.trim() || !linkUrl.trim()) return
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: linkTitle.trim(), url: linkUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo añadir el enlace')
      onDocsChange([data, ...docs])
      setLinkTitle('')
      setLinkUrl('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al añadir enlace')
    }
  }

  const uploadFile = async () => {
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('title', fileTitle.trim() || file.name)
      formData.append('file', file)
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/docs/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo')
      onDocsChange([data, ...docs])
      setFile(null)
      setFileTitle('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir archivo')
    } finally {
      setUploading(false)
    }
  }

  const deleteDoc = async (docId: string) => {
    if (!window.confirm('¿Eliminar este documento?')) return
    try {
      const res = await fetch(
        `/api/gestion-proyecto/proyectos/${projectId}/docs?docId=${docId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'No se pudo eliminar')
      }
      onDocsChange(docs.filter((d) => d.id !== docId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar documento')
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-5">
        <div className="flex items-center justify-end gap-3">
          <Button onClick={saveOnboarding} disabled={saving} size="sm">
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>

        <div className="grid gap-4">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Textarea
                id={field.key}
                rows={field.rows}
                value={onboarding[field.key] || ''}
                onChange={(e) =>
                  onOnboardingChange({ ...onboarding, [field.key]: e.target.value })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Documentación</h3>
          <p className="text-xs text-gray-500 mt-1">Enlaces externos y archivos subidos al CRM.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <Link2 className="h-4 w-4" />
              Añadir enlace
            </div>
            <Input
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="Título del documento"
            />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
            <Button variant="outline" onClick={addLink} disabled={!linkTitle.trim() || !linkUrl.trim()}>
              Añadir enlace
            </Button>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <FileUp className="h-4 w-4" />
              Subir archivo
            </div>
            <Input
              value={fileTitle}
              onChange={(e) => setFileTitle(e.target.value)}
              placeholder="Título (opcional)"
            />
            <input
              type="file"
              className="w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Button variant="outline" onClick={uploadFile} disabled={!file || uploading}>
              {uploading ? 'Subiendo...' : 'Subir documento'}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {docs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin documentos todavía.</p>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {doc.doc_type === 'link' ? 'Enlace externo' : doc.file_name || 'Archivo'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.doc_type === 'link' && doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      Abrir <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <a
                      href={`/api/gestion-proyecto/proyectos/${projectId}/docs/${doc.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      Ver archivo <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteDoc(doc.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

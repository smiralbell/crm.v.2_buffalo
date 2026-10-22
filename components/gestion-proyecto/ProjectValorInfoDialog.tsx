'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ExternalLink, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react'
import {
  emptyValorInfo,
  newPasswordId,
  type ProjectPasswordEntry,
  type ProjectValorInfo,
} from '@/lib/gestion-proyecto/valor-info'

type Props = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function blankPassword(): ProjectPasswordEntry {
  return {
    id: newPasswordId(),
    label: '',
    username: '',
    password: '',
    url: '',
    notes: '',
  }
}

export default function ProjectValorInfoDialog({ projectId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [passwords, setPasswords] = useState<ProjectPasswordEntry[]>([])
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/gestion-proyecto/proyectos/${projectId}/valor-info`)
      .then(async (r) => {
        const d = (await r.json()) as ProjectValorInfo & { error?: string }
        if (!r.ok) throw new Error(d.error || 'No se pudo cargar')
        if (cancelled) return
        const info = d.repo_url != null ? d : emptyValorInfo()
        setRepoUrl(info.repo_url || '')
        setPasswords(Array.isArray(info.passwords) ? info.passwords : [])
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const updatePassword = (id: string, patch: Partial<ProjectPasswordEntry>) => {
    setPasswords((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const cleaned = passwords
        .map((p) => ({
          ...p,
          label: p.label.trim(),
          username: p.username.trim(),
          url: p.url.trim(),
          notes: p.notes.trim(),
        }))
        .filter((p) => p.label)

      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/valor-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl.trim(), passwords: cleaned }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
      setPasswords(json.passwords || cleaned)
      setRepoUrl(json.repo_url || '')
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Información de valor</DialogTitle>
          <DialogDescription>
            Datos internos del proyecto: repositorio y contraseñas de acceso. Solo para el equipo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <div className="space-y-6 py-1">
            {error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {error}
              </p>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Repositorio del proyecto</h3>
                {repoUrl.trim() && (
                  <a
                    href={repoUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Abrir
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                className="font-mono text-sm"
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Contraseñas</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setPasswords((prev) => [...prev, blankPassword()])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Añadir
                </Button>
              </div>

              {passwords.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  Aún no hay contraseñas. Añade accesos a hosting, CMS, paneles, etc.
                </p>
              ) : (
                <ul className="space-y-3">
                  {passwords.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <Input
                          value={p.label}
                          onChange={(e) => updatePassword(p.id, { label: e.target.value })}
                          placeholder="Nombre (ej. Hosting, WP Admin…)"
                          className="font-medium"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-red-500 hover:text-red-700"
                          onClick={() => setPasswords((prev) => prev.filter((x) => x.id !== p.id))}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={p.username}
                          onChange={(e) => updatePassword(p.id, { username: e.target.value })}
                          placeholder="Usuario / email"
                        />
                        <div className="relative">
                          <Input
                            type={showPwd[p.id] ? 'text' : 'password'}
                            value={p.password}
                            onChange={(e) => updatePassword(p.id, { password: e.target.value })}
                            placeholder="Contraseña"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                            onClick={() =>
                              setShowPwd((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                            }
                            title={showPwd[p.id] ? 'Ocultar' : 'Mostrar'}
                          >
                            {showPwd[p.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <Input
                        value={p.url}
                        onChange={(e) => updatePassword(p.id, { url: e.target.value })}
                        placeholder="URL de acceso (opcional)"
                        className="font-mono text-xs"
                      />
                      <Textarea
                        value={p.notes}
                        onChange={(e) => updatePassword(p.id, { notes: e.target.value })}
                        placeholder="Notas (opcional)"
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void save()} disabled={loading || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

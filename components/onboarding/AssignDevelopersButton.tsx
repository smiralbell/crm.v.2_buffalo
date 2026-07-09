'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ProjectDevelopersPanel, { DeveloperTags } from '@/components/gestion-proyecto/ProjectDevelopersPanel'
import { cn } from '@/lib/utils'

interface AssignDevelopersButtonProps {
  leadId: string | number
  variant?: 'button' | 'icon' | 'compact'
  className?: string
  showTags?: boolean
  onAssigned?: () => void
}

export default function AssignDevelopersButton({
  leadId,
  variant = 'button',
  className,
  showTags = false,
  onAssigned,
}: AssignDevelopersButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [developers, setDevelopers] = useState<{ id: number; name: string }[]>([])
  const [resolveError, setResolveError] = useState('')

  const loadMeta = useCallback(async () => {
    setLoading(true)
    setResolveError('')
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/by-lead/${leadId}`)
      const data = await res.json()
      if (!res.ok) {
        setProjectId(null)
        setDevelopers([])
        setResolveError(data.hint || data.error || 'No se pudo cargar el proyecto')
        return
      }
      setProjectId(data.proyecto.id)
      setProjectName(data.proyecto.name || '')
      setDevelopers(data.developers || [])
    } catch {
      setProjectId(null)
      setResolveError('Error al cargar el proyecto')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (showTags && leadId) loadMeta()
  }, [showTags, leadId, loadMeta])

  const handleOpen = (next: boolean) => {
    setOpen(next)
    if (next) loadMeta()
  }

  const trigger =
    variant === 'icon' ? (
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className={cn(
          'flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors',
          className
        )}
        title="Asignar developers"
      >
        <Users className="h-3.5 w-3.5" />
      </button>
    ) : variant === 'compact' ? (
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 h-9 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors',
          className
        )}
      >
        <Users className="h-3.5 w-3.5" />
        Equipo
      </button>
    ) : (
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 px-4 h-10 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors',
          className
        )}
      >
        <Users className="h-4 w-4" />
        Asignar developers
      </button>
    )

  return (
    <>
      <div className={showTags ? 'flex flex-col items-end gap-1.5' : undefined}>
        {trigger}
        {showTags && developers.length > 0 && (
          <DeveloperTags developers={developers} />
        )}
      </div>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Developers del proyecto</DialogTitle>
            <DialogDescription>
              {projectName
                ? `Quién trabaja en ${projectName} (ENG 3 y tickets).`
                : 'Asigna developers al proyecto vinculado a este lead.'}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-10 flex justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : resolveError || !projectId ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {resolveError || 'Proyecto no encontrado'}
            </div>
          ) : (
            <ProjectDevelopersPanel
              projectId={projectId}
              onSaved={(devs) => {
                setDevelopers(devs)
                onAssigned?.()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

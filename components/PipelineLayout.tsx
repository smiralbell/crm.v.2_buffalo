'use client'

import { ReactNode, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, Trash2, ArrowLeft, Menu } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import LeadContextShortcuts from '@/components/crm/LeadContextShortcuts'
import MobileTabBar, { openMobileMenu } from '@/components/MobileTabBar'

interface PipelineLayoutProps {
  children: ReactNode
  currentPipelineId: string
  currentPipelineName: string
  totalValue?: number
  totalCards?: number
  /** Comercial: solo su Cold Calling, sin cambiar de embudo ni borrar. */
  lockedToCurrent?: boolean
  backHref?: string
  allowDelete?: boolean
}

interface Pipeline {
  id: string
  name: string
  entity_type: 'client' | 'contact'
}

export default function PipelineLayout({
  children,
  currentPipelineId,
  currentPipelineName,
  totalValue = 0,
  totalCards = 0,
  lockedToCurrent = false,
  backHref = '/pipelines',
  allowDelete = true,
}: PipelineLayoutProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (lockedToCurrent) return
    const loadPipelines = async () => {
      try {
        const res = await fetch('/api/pipelines')
        if (res.ok) {
          const data = await res.json()
          setPipelines(data.pipelines || [])
        }
      } catch (error) {
        console.error('Error loading pipelines:', error)
      }
    }
    loadPipelines()
  }, [lockedToCurrent])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const handlePipelineChange = (pipelineId: string) => {
    if (pipelineId !== currentPipelineId) {
      window.location.href = `/pipelines/${pipelineId}`
    }
  }

  const handleBack = () => {
    // Salida dura: el pipeline es fullscreen sin Layout y el client nav a veces se queda pillado
    window.location.href = backHref
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/pipelines/${currentPipelineId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Error al eliminar pipeline')
      }

      window.location.href = '/pipelines'
    } catch (error) {
      console.error('Error deleting pipeline:', error)
      alert('Error al eliminar el pipeline')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-white flex flex-col pb-[var(--tabbar-h)] md:pb-0">
      <div className="mobile-header flex-shrink-0 bg-white border-b border-gray-200 z-10">
        <div className="px-3 sm:px-6 py-2 sm:py-4">
          <div className="flex flex-col gap-1.5 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 sm:flex-wrap sm:gap-3 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 hover:bg-gray-100 shrink-0"
                onClick={handleBack}
                title="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              {lockedToCurrent ? (
                <div className="flex-1 sm:flex-initial sm:w-auto sm:min-w-[200px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {currentPipelineName || 'Mi pipeline'}
                  </p>
                  <p className="text-[11px] text-gray-500">Solo tus leads</p>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex-1 sm:flex-initial sm:w-auto sm:min-w-[200px] justify-between min-w-0">
                      <span className="font-medium truncate">{currentPipelineName}</span>
                      <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[200px]">
                    {pipelines.map((pipeline) => (
                      <DropdownMenuItem
                        key={pipeline.id}
                        onClick={() => handlePipelineChange(pipeline.id)}
                        className={
                          pipeline.id === currentPipelineId ? 'bg-blue-50 font-semibold' : ''
                        }
                      >
                        {pipeline.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {allowDelete && !lockedToCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  aria-label="Eliminar pipeline"
                >
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Eliminar</span>
                </Button>
              )}

              <button
                type="button"
                onClick={openMobileMenu}
                aria-label="Abrir menú"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-900 active:bg-gray-100 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-700 pl-11 sm:pl-0">
              <span className="font-semibold text-gray-900">{formatCurrency(totalValue)}</span>
              <span className="text-gray-400">·</span>
              <span>
                <span className="font-semibold text-gray-900">{totalCards}</span> Oportunidades
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-gray-50">{children}</div>

      <LeadContextShortcuts />
      <MobileTabBar />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el pipeline &quot;{currentPipelineName}&quot; y todas sus
              tarjetas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

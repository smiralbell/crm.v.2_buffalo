'use client'

import { ReactNode, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronDown, Trash2, ArrowLeft } from 'lucide-react'
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

interface PipelineLayoutProps {
  children: ReactNode
  currentPipelineId: string
  currentPipelineName: string
  totalValue?: number
  totalCards?: number
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
  totalCards = 0
}: PipelineLayoutProps) {
  const router = useRouter()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    // Cargar todos los pipelines
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
  }, [])

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
      // Usar window.location para forzar recarga completa y cargar los datos del nuevo pipeline
      window.location.href = `/pipelines/${pipelineId}`
    }
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

      // Redirigir a la lista de pipelines
      router.push('/pipelines')
    } catch (error) {
      console.error('Error deleting pipeline:', error)
      alert('Error al eliminar el pipeline')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex flex-col">
      {/* Header simplificado */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Izquierda: Botón volver + Desplegable de pipelines */}
            <div className="flex items-center gap-3">
              {/* Botón volver */}
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-gray-100">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="min-w-[200px] justify-between">
                    <span className="font-medium">{currentPipelineName}</span>
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[200px]">
                  {pipelines.map((pipeline) => (
                    <DropdownMenuItem
                      key={pipeline.id}
                      onClick={() => handlePipelineChange(pipeline.id)}
                      className={pipeline.id === currentPipelineId ? 'bg-blue-50 font-semibold' : ''}
                    >
                      {pipeline.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Botón eliminar */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </div>

            {/* Derecha: Métricas */}
            <div className="flex items-center gap-4 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{formatCurrency(totalValue)}</span>
                <span className="text-gray-400">·</span>
                <span>
                  <span className="font-semibold text-gray-900">{totalCards}</span> Oportunidades
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido del pipeline */}
      <div className="flex-1 overflow-hidden bg-gray-50">
        {children}
      </div>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el pipeline &quot;{currentPipelineName}&quot; y todas sus tarjetas. Esta acción no se puede deshacer.
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

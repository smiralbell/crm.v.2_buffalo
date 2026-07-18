import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
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
import { Label } from '@/components/ui/label'

type Props = {
  open: boolean
  projectName: string
  leadId: number | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

/**
 * Doble confirmación siempre:
 * 1) Aviso + Continuar
 * 2) Escribir el nombre exacto + Eliminar
 */
export default function DeleteOnboardingProjectDialog({
  open,
  projectName,
  leadId,
  onOpenChange,
  onDeleted,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setStep(1)
      setConfirmName('')
      setDeleting(false)
      setError('')
    }
  }, [open])

  const close = () => {
    if (deleting) return
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (!leadId) return
    if (confirmName !== projectName) {
      setError('El nombre no coincide. Escribe el nombre exacto.')
      return
    }
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      onOpenChange(false)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !deleting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {step === 1 ? 'Eliminar proyecto' : 'Confirmación final'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {step === 1 ? (
                <>
                  <p>
                    Vas a eliminar el proyecto de Onboarding. Se quitará la configuración y el
                    proyecto vinculado pasará a churned (fuera de activos).
                  </p>
                  <p className="font-semibold text-gray-900">{projectName}</p>
                  <p className="text-xs">El lead del CRM no se borra.</p>
                </>
              ) : (
                <>
                  <p>Esta acción no se puede deshacer fácilmente. Para confirmar, escribe el nombre:</p>
                  <p className="font-semibold text-gray-900">{projectName}</p>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {step === 2 && (
          <div className="space-y-2 py-1">
            <Label htmlFor="confirm-project-name">Nombre del proyecto</Label>
            <Input
              id="confirm-project-name"
              value={confirmName}
              onChange={(e) => {
                setConfirmName(e.target.value)
                setError('')
              }}
              placeholder="Escribe el nombre exacto"
              autoFocus
              disabled={deleting}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        {step === 1 && error && <p className="text-xs text-red-600">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close} disabled={deleting}>
            Cancelar
          </Button>
          {step === 1 ? (
            <Button
              variant="destructive"
              onClick={() => {
                setError('')
                setStep(2)
              }}
            >
              Continuar
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmName !== projectName}
            >
              {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: number; name: string; email: string } | null
  onDeleted: () => void
}

/**
 * Borrado de usuario con doble verificación:
 * 1) aviso con lo que se pierde, 2) escribir el correo exacto del usuario.
 * El servidor vuelve a comprobar el correo antes de borrar.
 */
export default function DeleteUserDialog({ open, onOpenChange, user, onDeleted }: DeleteUserDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setStep(1)
      setTyped('')
      setError('')
    }
  }, [open, user?.id])

  if (!user) return null

  const matches = typed.trim().toLowerCase() === user.email.trim().toLowerCase()

  const remove = async () => {
    if (!matches) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_email: typed.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo borrar')
      onOpenChange(false)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !deleting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Borrar a {user.name}
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Paso 1 de 2 · Revisa lo que se pierde' : 'Paso 2 de 2 · Confirma escribiendo su correo'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Se borrará para siempre y no se puede deshacer:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Su acceso al CRM y su contraseña.</li>
              <li>Sus tareas personales y los proyectos que tenga asignados.</li>
              <li>Donde aparezca como autor o responsable (facturas, campañas, tickets…) quedará sin asignar.</li>
            </ul>
            <p className="text-gray-500">
              Si solo quieres quitarle el acceso, usa «Desactivar»: se puede volver a activar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="delete-user-email" className="text-sm text-gray-700">
              Escribe <span className="font-mono font-semibold text-gray-900">{user.email}</span> para borrarlo
            </Label>
            <Input
              id="delete-user-email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches) void remove()
              }}
              autoComplete="off"
              autoFocus
              className="rounded-xl"
              placeholder={user.email}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={deleting} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {step === 1 ? (
            <Button className="rounded-xl bg-red-600 hover:bg-red-700 text-white" onClick={() => setStep(2)}>
              Continuar
            </Button>
          ) : (
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              disabled={!matches || deleting}
              onClick={remove}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Borrar para siempre'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

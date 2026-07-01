import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowRight, Phone } from 'lucide-react'
import type { PhoneConflict } from '@/lib/demos/types'

interface PhoneConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: PhoneConflict[]
  targetDemoName: string
  onConfirmMove: () => void
  onCancel: () => void
  moving?: boolean
}

export default function PhoneConflictDialog({
  open,
  onOpenChange,
  conflicts,
  targetDemoName,
  onConfirmMove,
  onCancel,
  moving = false,
}: PhoneConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Número ya asignado a otra demo</DialogTitle>
          <DialogDescription>
            Cada teléfono solo puede estar en una demo del mismo tipo (WhatsApp o voz).
            El mismo número sí puede estar en una demo WhatsApp y otra de voz.
            Si continúas, se quitará de la demo anterior del mismo tipo y pasará a{' '}
            <strong>{targetDemoName}</strong>
            {conflicts[0]?.demo_tipo === 'whatsapp'
              ? ' (se borrará el historial de chat anterior).'
              : '.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {conflicts.map((c) => (
            <li
              key={`${c.numero_telefono}-${c.demo_id}`}
              className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3"
            >
              <div className="flex items-center gap-2 font-mono text-sm text-gray-900">
                <Phone className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                {c.numero_telefono}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                <span className="rounded-md bg-white px-2 py-0.5 text-gray-700">
                  {c.nombre_cliente}
                  {c.demo_tipo ? ` (${c.demo_tipo === 'voz' ? 'Voz' : 'WhatsApp'})` : ''}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                <span className="rounded-md bg-gray-900 px-2 py-0.5 font-medium text-white">
                  {targetDemoName}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={moving}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirmMove} disabled={moving} className="rounded-xl">
            {moving ? 'Moviendo…' : 'Mover a esta demo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

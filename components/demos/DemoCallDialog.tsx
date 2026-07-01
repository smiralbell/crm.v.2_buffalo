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
import { Label } from '@/components/ui/label'
import type { DemoListItem } from '@/lib/demos/types'
import { Phone } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  demo: DemoListItem | null
}

export default function DemoCallDialog({ open, onOpenChange, demo }: Props) {
  const [selected, setSelected] = useState('')
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!open) return
    setSelected(demo?.numeros[0] || '')
    setError('')
    setSuccess('')
    setCalling(false)
  }, [open, demo])

  const launchCall = async () => {
    if (!demo || !selected) return
    setCalling(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/demos/${demo.id}/llamar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_destino: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la llamada')
      setSuccess(`Llamada iniciada a ${selected}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al llamar')
    } finally {
      setCalling(false)
    }
  }

  const numeros = demo?.numeros ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Llamar ahora</DialogTitle>
          <DialogDescription>
            Selecciona el número de <strong>{demo?.nombre_cliente}</strong> al que quieres llamar.
          </DialogDescription>
        </DialogHeader>

        {numeros.length === 0 ? (
          <p className="text-sm text-amber-800">
            Esta demo no tiene números configurados. Añade al menos uno en la edición.
          </p>
        ) : (
          <div className="space-y-2">
            <Label>Número de destino</Label>
            <div className="space-y-2">
              {numeros.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelected(num)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    selected === num
                      ? 'border-violet-400 bg-violet-50 text-violet-900'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Phone className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="font-mono">{num}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
            disabled={calling}
          >
            Cerrar
          </Button>
          <Button
            onClick={launchCall}
            disabled={calling || !selected || numeros.length === 0}
            className="rounded-xl"
          >
            {calling ? 'Iniciando llamada…' : '📞 Confirmar llamada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

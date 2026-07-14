import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Link2 } from 'lucide-react'
import { DEFAULT_PRESENTATION_URL } from '@/lib/coldcall/presentation-link'

interface CampaignPresentationEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number
  onSaved?: (url: string | null) => void
}

export default function CampaignPresentationEditor({
  open,
  onOpenChange,
  campaignId,
  onSaved,
}: CampaignPresentationEditorProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [url, setUrl] = useState('')
  const [isCustom, setIsCustom] = useState(false)

  useEffect(() => {
    if (!open || !campaignId) return
    setLoading(true)
    fetch(`/api/coldcall/campaigns/${campaignId}/presentation`)
      .then((r) => r.json())
      .then((d) => {
        setUrl(d.presentation_url || '')
        setIsCustom(Boolean(d.is_custom))
      })
      .finally(() => setLoading(false))
  }, [open, campaignId])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/coldcall/campaigns/${campaignId}/presentation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presentation_url: url.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      onSaved?.(data.presentation_url ?? null)
      onOpenChange(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const useDefault = () => setUrl('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Link de presentación
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Se incluye en los mensajes de <strong>Pide info</strong> e <strong>Interesado</strong>{' '}
              (WhatsApp y email).
            </p>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={DEFAULT_PRESENTATION_URL}
              className="rounded-xl"
            />
            <p className="text-xs text-gray-500">
              {url.trim()
                ? 'Usando enlace personalizado de esta campaña.'
                : `Vacío = por defecto Buffalo (${DEFAULT_PRESENTATION_URL})`}
              {isCustom && !url.trim() && ' Se restaurará el enlace por defecto.'}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={useDefault} disabled={loading || saving}>
            Restaurar por defecto
          </Button>
          <Button type="button" onClick={save} disabled={loading || saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

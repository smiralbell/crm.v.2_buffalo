import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Database, Loader2, CheckCircle2 } from 'lucide-react'
import { PROSPECT_REQUEST_MESSAGE } from '@/lib/coldcall/prospect-requests'

interface RequestProspectsButtonProps {
  campaignId?: number | null
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export default function RequestProspectsButton({
  campaignId,
  variant = 'outline',
  size = 'default',
  className,
}: RequestProspectsButtonProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleClick = async () => {
    if (sent || sending) return
    if (!confirm(`¿Enviar alerta a administración?\n\n"${PROSPECT_REQUEST_MESSAGE}"`)) return

    setSending(true)
    try {
      const res = await fetch('/api/coldcall/prospect-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId ?? null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la solicitud')
      setSent(true)
      if (!data.created) {
        alert('Ya tienes una solicitud pendiente. Administración la verá en Cold Calling.')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={sent ? 'secondary' : variant}
      size={size}
      className={className}
      disabled={sending || sent}
      onClick={handleClick}
    >
      {sending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : sent ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <Database className="h-4 w-4" />
      )}
      {sent ? 'Solicitud enviada' : 'Solicitar nueva BBDD'}
    </Button>
  )
}

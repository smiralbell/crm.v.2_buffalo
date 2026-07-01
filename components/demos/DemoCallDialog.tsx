import { useCallback, useEffect, useRef, useState } from 'react'
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

type LogLevel = 'info' | 'success' | 'error'

type LogEntry = {
  id: number
  at: string
  level: LogLevel
  message: string
  detail?: string
}

const LOG_STYLE: Record<LogLevel, string> = {
  info: 'text-gray-700',
  success: 'text-emerald-800',
  error: 'text-red-800',
}

export default function DemoCallDialog({ open, onOpenChange, demo }: Props) {
  const [selected, setSelected] = useState('')
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logId = useRef(0)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const pushLog = useCallback((level: LogLevel, message: string, detail?: unknown) => {
    const detailStr =
      detail !== undefined
        ? typeof detail === 'string'
          ? detail
          : JSON.stringify(detail, null, 2)
        : undefined

    const prefix = `[DemoCall]`
    if (level === 'error') {
      console.error(prefix, message, detail ?? '')
    } else {
      console.log(prefix, message, detail ?? '')
    }

    logId.current += 1
    setLogs((prev) => [
      ...prev,
      {
        id: logId.current,
        at: new Date().toLocaleTimeString('es-ES'),
        level,
        message,
        detail: detailStr,
      },
    ])
  }, [])

  useEffect(() => {
    if (!open) return
    setSelected(demo?.numeros[0] || '')
    setError('')
    setSuccess('')
    setCalling(false)
    setLogs([])
    logId.current = 0

    if (demo) {
      pushLog('info', 'Diálogo abierto', {
        demo_id: demo.id,
        cliente: demo.nombre_cliente,
        tipo: demo.tipo,
        direccion: demo.direccion,
        agent_id: demo.retell_agent_id,
        numeros: demo.numeros,
      })
    }
  }, [open, demo, pushLog])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const launchCall = async () => {
    if (!demo || !selected) return
    setCalling(true)
    setError('')
    setSuccess('')

    const url = `/api/demos/${demo.id}/llamar`
    const payload = { numero_destino: selected }

    pushLog('info', 'Iniciando llamada saliente…', {
      url,
      demo_id: demo.id,
      numero_destino: selected,
    })

    try {
      pushLog('info', 'Enviando POST al servidor', payload)

      const started = performance.now()
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const elapsedMs = Math.round(performance.now() - started)

      pushLog('info', `Respuesta HTTP ${res.status} (${elapsedMs} ms)`)

      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        pushLog('error', 'La respuesta no es JSON válido')
        throw new Error('Respuesta inválida del servidor')
      }

      pushLog(res.ok ? 'success' : 'error', 'Cuerpo de la respuesta', data)

      if (!res.ok) {
        const hint = typeof data.hint === 'string' ? ` ${data.hint}` : ''
        const nums =
          Array.isArray(data.numeros_autorizados) && data.numeros_autorizados.length > 0
            ? ` Autorizados: ${(data.numeros_autorizados as string[]).join(', ')}`
            : ''
        throw new Error(`${String(data.error || 'No se pudo iniciar la llamada')}${hint}${nums}`)
      }

      const callId =
        (typeof data.call_id === 'string' && data.call_id) ||
        (data.call &&
        typeof data.call === 'object' &&
        data.call !== null &&
        typeof (data.call as Record<string, unknown>).call_id === 'string'
          ? String((data.call as Record<string, unknown>).call_id)
          : null)

      const destino =
        typeof data.numero_destino === 'string' ? data.numero_destino : selected

      pushLog('success', 'Llamada registrada en Retell', {
        call_id: callId,
        call_status: data.call_status,
        from_number: data.from_number,
        numero_destino: destino,
      })

      setSuccess(
        callId
          ? `Llamada iniciada a ${destino} (ID: ${callId})`
          : `Llamada iniciada a ${destino}`
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al llamar'
      pushLog('error', msg)
      setError(msg)
    } finally {
      setCalling(false)
      pushLog('info', 'Proceso finalizado')
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
                  onClick={() => {
                    setSelected(num)
                    pushLog('info', `Número seleccionado: ${num}`)
                  }}
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

        {logs.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Registro de actividad</Label>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] leading-relaxed">
              {logs.map((entry) => (
                <div key={entry.id} className="mb-2 last:mb-0">
                  <div className={LOG_STYLE[entry.level]}>
                    <span className="text-gray-400">{entry.at}</span>{' '}
                    <span className="font-semibold">
                      {entry.level === 'error' ? '✗' : entry.level === 'success' ? '✓' : '·'}
                    </span>{' '}
                    {entry.message}
                  </div>
                  {entry.detail && (
                    <pre className="mt-0.5 whitespace-pre-wrap break-all text-gray-500">
                      {entry.detail}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
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

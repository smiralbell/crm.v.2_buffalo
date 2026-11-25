import { useEffect, useRef, useState } from 'react'
import { FileAudio, Loader2, Mic, PenLine, Square, Upload, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/** El transcriptor acepta hasta ~25 MB por audio. */
const MAX_AUDIO_BYTES = 24 * 1024 * 1024

type Mode = 'notas' | 'audio'

function nowLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...Array.from(buf.subarray(i, i + 0x8000)))
  return btoa(bin)
}

/**
 * Reunión presencial: se guarda en el contexto del lead escribiendo las notas,
 * grabando el audio desde aquí o subiendo una grabación. El audio se transcribe y se resume.
 */
export default function LeadReunionDialog({
  leadId,
  open,
  onOpenChange,
  onSaved,
}: {
  leadId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<Mode>('notas')
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState(nowLocal())
  const [notas, setNotas] = useState('')
  const [audio, setAudio] = useState<{ blob: Blob; name: string } | null>(null)
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const stopTracks = () => {
    recRef.current?.stream.getTracks().forEach((t) => t.stop())
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
  }

  useEffect(() => {
    if (!open) return
    setMode('notas')
    setTitulo('')
    setFecha(nowLocal())
    setNotas('')
    setAudio(null)
    setSecs(0)
    setError('')
    return () => {
      if (recRef.current?.state === 'recording') recRef.current.stop()
      stopTracks()
    }
  }, [open])

  const startRec = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 })
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
        setAudio({ blob, name: 'reunion.webm' })
        setRecording(false)
        stopTracks()
      }
      recRef.current = rec
      rec.start(1000)
      setSecs(0)
      setRecording(true)
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000)
    } catch {
      setError('No se pudo usar el micrófono. Revisa el permiso del navegador.')
    }
  }

  const stopRec = () => recRef.current?.state === 'recording' && recRef.current.stop()

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_AUDIO_BYTES) {
      setError('El audio pasa de 24 MB. Recórtalo o expórtalo en mp3/m4a a menor calidad.')
      return
    }
    setError('')
    setAudio({ blob: file, name: file.name })
  }

  const save = async () => {
    if (mode === 'notas' && !notas.trim()) return setError('Escribe lo que se habló')
    if (mode === 'audio' && !audio) return setError('Graba o sube el audio de la reunión')
    if (audio && audio.blob.size > MAX_AUDIO_BYTES) return setError('El audio pasa de 24 MB')
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        titulo: titulo.trim() || 'Reunión presencial',
        fecha: new Date(fecha).toISOString(),
        notas: notas.trim(),
      }
      if (mode === 'audio' && audio) {
        body.audio = { base64: await toBase64(audio.blob), mime: audio.blob.type, name: audio.name }
      }
      const res = await fetch(`/api/leads/${leadId}/reunion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error || 'No se pudo guardar')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const tab = (id: Mode, label: string, Icon: typeof PenLine) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
        mode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && !recording && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Reunión presencial
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título (p. ej. Visita a la oficina)"
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
            />
            <input
              type="datetime-local"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
            />
          </div>

          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {tab('notas', 'Escribir notas', PenLine)}
            {tab('audio', 'Grabar o subir audio', Mic)}
          </div>

          {mode === 'notas' ? (
            <textarea
              autoFocus
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={8}
              placeholder="Qué se habló, qué necesita, qué se acordó y próximos pasos…"
              className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
                {recording ? (
                  <>
                    <span className="flex items-center gap-2 text-sm font-medium text-red-600">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Grabando · {mmss(secs)}
                    </span>
                    <Button type="button" variant="outline" onClick={stopRec} className="gap-1.5">
                      <Square className="h-3.5 w-3.5" /> Parar
                    </Button>
                  </>
                ) : audio ? (
                  <>
                    <span className="flex items-center gap-2 text-sm text-gray-800">
                      <FileAudio className="h-4 w-4 text-gray-500" />
                      {audio.name} · {(audio.blob.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button type="button" onClick={() => setAudio(null)} className="text-xs text-gray-500 hover:text-gray-900">
                      Quitar y empezar de nuevo
                    </button>
                  </>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => void startRec()} className="gap-1.5">
                      <Mic className="h-4 w-4" /> Grabar ahora
                    </Button>
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5">
                      <Upload className="h-4 w-4" /> Subir grabación
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
                      className="hidden"
                      onChange={(e) => {
                        pickFile(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-gray-400">Se transcribe y se resume solo. Hasta 24 MB (≈ 1 h de voz grabada aquí).</p>
              </div>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                placeholder="Notas tuyas para acompañar el audio (opcional)"
                className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || recording}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || recording}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === 'audio' ? 'Transcribiendo y resumiendo…' : 'Guardando…'}
              </>
            ) : (
              'Guardar en el contexto'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

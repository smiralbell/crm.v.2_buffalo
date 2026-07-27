'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Circle, Download, Mic, Square } from 'lucide-react'

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return undefined
}

function extFromMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function useCallRecorder() {
  const [recording, setRecording] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)
  const [lastFilename, setLastFilename] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const mimeRef = useRef<string>('audio/webm')

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!recording || startedAtRef.current == null) return
    const tick = () =>
      setElapsedSec(Math.floor((Date.now() - (startedAtRef.current as number)) / 1000))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [recording])

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop()
      } catch {
        /* ignore */
      }
      stopTracks()
    }
  }, [stopTracks])

  const start = useCallback(async () => {
    setError(null)
    setLastBlob(null)
    setLastFilename(null)

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite grabar audio')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder no disponible en este dispositivo')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      chunksRef.current = []

      const mime = pickMimeType()
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      mimeRef.current = recorder.mimeType || mime || 'audio/webm'
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current })
        chunksRef.current = []
        stopTracks()
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `coldcall-${stamp}.${extFromMime(mimeRef.current)}`
        setLastBlob(blob)
        setLastFilename(filename)
        downloadBlob(blob, filename)
        setRecording(false)
      }

      recorder.start(1000)
      startedAtRef.current = Date.now()
      setElapsedSec(0)
      setRecording(true)
    } catch (e) {
      stopTracks()
      const msg =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado. Actívalo en el navegador.'
          : e instanceof Error
            ? e.message
            : 'No se pudo iniciar la grabación'
      setError(msg)
      setRecording(false)
    }
  }, [stopTracks])

  const stop = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
    } else {
      stopTracks()
      setRecording(false)
    }
  }, [stopTracks])

  const downloadAgain = useCallback(() => {
    if (!lastBlob || !lastFilename) return
    downloadBlob(lastBlob, lastFilename)
  }, [lastBlob, lastFilename])

  return {
    recording,
    elapsedSec,
    error,
    lastBlob,
    lastFilename,
    start,
    stop,
    downloadAgain,
  }
}

export default function CallRecordButton() {
  const recorder = useCallRecorder()

  return (
    <div className="space-y-1.5">
      {!recorder.recording ? (
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-xl h-11 gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={() => void recorder.start()}
        >
          <Mic className="h-4 w-4" />
          Grabar
        </Button>
      ) : (
        <Button
          type="button"
          className="w-full rounded-xl h-11 gap-2 bg-red-600 hover:bg-red-700 text-white"
          onClick={recorder.stop}
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <Circle className="relative h-3 w-3 fill-white text-white" />
          </span>
          <Square className="h-3.5 w-3.5 fill-current" />
          Detener grabación · {formatElapsed(recorder.elapsedSec)}
        </Button>
      )}

      {recorder.error && (
        <p className="text-xs text-red-600 text-center">{recorder.error}</p>
      )}

      {recorder.lastFilename && !recorder.recording && (
        <div className="flex items-center justify-center gap-2">
          <p className="text-xs text-gray-500 truncate">Guardado: {recorder.lastFilename}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 shrink-0"
            onClick={recorder.downloadAgain}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>
        </div>
      )}

      {!recorder.recording && !recorder.lastFilename && (
        <p className="text-[11px] text-gray-400 text-center leading-snug">
          Graba el micrófono del PC. Pon el móvil en altavoz para captar también al cliente.
        </p>
      )}
    </div>
  )
}

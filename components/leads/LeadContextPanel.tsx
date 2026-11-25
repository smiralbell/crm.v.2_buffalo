import { useState } from 'react'
import { Check, Copy, Loader2, Save, Send, StickyNote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Descarga el contexto completo del lead (datos, contexto, facturas, documentos, historial) como .md */
export async function exportLeadContext(leadId: number): Promise<void> {
  const res = await fetch(`/api/leads/${leadId}/contexto`)
  if (!res.ok) throw new Error(await readError(res, 'No se pudo exportar el contexto'))
  const { markdown, fileName } = (await res.json()) as { markdown: string; fileName: string }
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Contexto escrito por el equipo: editar, guardar, copiar y preguntar a la IA. */
export default function LeadContextPanel({ leadId, initial }: { leadId: number; initial: string }) {
  const [value, setValue] = useState(initial)
  const [baseline, setBaseline] = useState(initial)
  const [busy, setBusy] = useState<'guardar' | 'resumen' | 'exportar' | 'copiar' | 'preguntar' | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [copied, setCopied] = useState<'contexto' | 'todo' | 'respuesta' | null>(null)
  const [error, setError] = useState('')
  const [pregunta, setPregunta] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const dirty = value !== baseline

  const flashCopied = (which: 'contexto' | 'todo' | 'respuesta') => {
    setCopied(which)
    window.setTimeout(() => setCopied(null), 1500)
  }

  const save = async () => {
    setBusy('guardar')
    setError('')
    try {
      const next = value.trim() || null
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: next }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Error al guardar'))
      const saved = next || ''
      setValue(saved)
      setBaseline(saved)
      setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(null)
    }
  }

  const preguntar = async () => {
    if (!pregunta.trim()) return
    setBusy('preguntar')
    setError('')
    setRespuesta('')
    try {
      const res = await fetch(`/api/leads/${leadId}/contexto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'preguntar', pregunta }),
      })
      if (!res.ok) throw new Error(await readError(res, 'La IA no pudo responder'))
      setRespuesta(((await res.json()) as { respuesta: string }).respuesta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La IA no pudo responder')
    } finally {
      setBusy(null)
    }
  }

  const smallBtn =
    'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'

  return (
    <Card id="contexto" className="shadow-sm border-gray-200 scroll-mt-6">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <StickyNote className="h-4 w-4" />
            Contexto escrito por el equipo
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {savedAt && !dirty && <span className="text-[11px] text-emerald-600">Guardado {savedAt}</span>}
            <button
              type="button"
              className={smallBtn}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value)
                  flashCopied('contexto')
                } catch {
                  setError('No se pudo copiar')
                }
              }}
              disabled={!value.trim()}
              title="Copiar solo el contexto escrito"
            >
              {copied === 'contexto' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copiar
            </button>
            <Button
              size="sm"
              variant={dirty ? 'default' : 'outline'}
              className="rounded-lg h-8"
              disabled={busy !== null || !dirty}
              onClick={() => void save()}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {busy === 'guardar' ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder="Qué necesita, presupuesto, objeciones, qué se ha hablado, siguiente paso…"
          className="rounded-xl text-sm leading-relaxed resize-y min-h-[160px]"
        />

        <div className="flex gap-2">
          <input
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void preguntar()
              }
            }}
            placeholder="Pregunta a la IA sobre este lead: «¿qué le prometimos y qué falta?»"
            className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={preguntar}
            disabled={busy !== null || !pregunta.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {busy === 'preguntar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Preguntar
          </button>
        </div>

        {respuesta && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-2">
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{respuesta}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(respuesta)
                  flashCopied('respuesta')
                } catch {
                  setError('No se pudo copiar')
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              {copied === 'respuesta' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copiar respuesta
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}

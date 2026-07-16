import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { parseScriptMarkdown } from '@/lib/coldcall/script-parser'

interface CampaignScriptEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number
}

type Lang = 'es' | 'ca'

export default function CampaignScriptEditor({
  open,
  onOpenChange,
  campaignId,
}: CampaignScriptEditorProps) {
  const [lang, setLang] = useState<Lang>('es')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markdownEs, setMarkdownEs] = useState('')
  const [markdownCa, setMarkdownCa] = useState('')

  useEffect(() => {
    if (!open || !campaignId) return
    setLoading(true)
    fetch(`/api/coldcall/campaigns/${campaignId}/script`)
      .then((r) => r.json())
      .then((d) => {
        setMarkdownEs(d.script_markdown_es || '')
        setMarkdownCa(d.script_markdown_ca || '')
      })
      .finally(() => setLoading(false))
  }, [open, campaignId])

  const currentMd = lang === 'es' ? markdownEs : markdownCa
  const setCurrentMd = lang === 'es' ? setMarkdownEs : setMarkdownCa
  const preview = parseScriptMarkdown(currentMd)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/coldcall/campaigns/${campaignId}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_markdown_es: markdownEs,
          script_markdown_ca: markdownCa,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      onOpenChange(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guión de llamadas</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {(
                [
                  { id: 'es' as const, label: 'Castellano' },
                  { id: 'ca' as const, label: 'Català' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLang(t.id)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    lang === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-500">
              Escribe en Markdown. Usa <code className="bg-gray-100 px-1 rounded">## Título</code>{' '}
              para cada caja del guión. En el texto puedes usar{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{nombre}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">(Nombre)</code> o{' '}
              <code className="bg-gray-100 px-1 rounded">[Nombre]</code> — se sustituye por el lead
              al llamar.
            </p>

            <Textarea
              value={currentMd}
              onChange={(e) => setCurrentMd(e.target.value)}
              rows={12}
              className="font-mono text-sm rounded-xl"
              placeholder={`## Recepción\nTu texto aquí...\n\n## Apertura\n...`}
            />

            {preview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Vista previa ({preview.length} cajas)
                </p>
                <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                  {preview.map((box, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-bold text-gray-800 uppercase">{box.title}</p>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-4 whitespace-pre-line">
                        {box.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar guión'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

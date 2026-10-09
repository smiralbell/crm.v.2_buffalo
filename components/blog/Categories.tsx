import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, Field, inputCls, Modal, Notice, THEME_COLOR, themeOptions } from './shared'

const NEW = '__nueva__'

/**
 * Desplegable de categorías con su color, el número de artículos (opcional)
 * y la opción de crear una nueva.
 */
export function CategorySelect({
  value,
  onChange,
  counts,
  allowAll,
  withNews = true,
  onCreated,
  className,
}: {
  value: string
  onChange: (code: string) => void
  counts?: (code: string) => number
  allowAll?: string
  withNews?: boolean
  onCreated?: () => Promise<void> | void
  className?: string
}) {
  const [creating, setCreating] = useState(false)
  return (
    <div className={cn('relative', className)}>
      <span className={cn('pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full', value ? THEME_COLOR[value] : 'bg-gray-300')} />
      <select
        className={inputCls + ' appearance-none pl-8 pr-8'}
        value={value}
        onChange={(e) => (e.target.value === NEW ? setCreating(true) : onChange(e.target.value))}
      >
        {allowAll !== undefined && <option value="">{allowAll}</option>}
        {themeOptions(withNews).map(([k, v]) => (
          <option key={k} value={k}>{v}{counts ? ` (${counts(k)})` : ''}</option>
        ))}
        <option value={NEW}>＋ Nueva categoría…</option>
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">▾</span>
      <NewCategory
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (code) => {
          setCreating(false)
          await onCreated?.()
          onChange(code)
        }}
      />
    </div>
  )
}

export function NewCategory({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (code: string) => void }) {
  const [name, setName] = useState('')
  const [salesPage, setSalesPage] = useState('/auditoria/')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const { theme } = await api<{ theme: { code: string } }>('categories/new', { body: { name, salesPage, question } })
      setName('')
      setQuestion('')
      onCreated(theme.code)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva categoría">
      <div className="space-y-3">
        <Field label="Nombre" info="Cómo se verá en el blog y en el panel. Tendrá su propia página: buffaloia.com/blog/tema/…">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: IA para gestorías" />
        </Field>
        <Field label="¿Qué pregunta responde?" info="Una frase que explica la categoría. Sale en su página del blog y ayuda a la IA a elegir temas.">
          <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ej.: ¿Cómo automatizo la atención en mi gestoría?" />
        </Field>
        <Field label="Página de venta" info="La página de buffaloia.com a la que empujan los artículos de esta categoría (un enlace en cada artículo y el botón final).">
          <input className={inputCls} value={salesPage} onChange={(e) => setSalesPage(e.target.value)} />
        </Field>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="flex justify-center pt-1">
          <Button className="gap-1.5 rounded-xl px-6" disabled={!name.trim() || busy} onClick={create}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear categoría
          </Button>
        </div>
      </div>
    </Modal>
  )
}

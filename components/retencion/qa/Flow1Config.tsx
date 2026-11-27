import { useEffect, useState } from 'react'
import { Check, GitBranch, Loader2, PenLine, Ticket } from 'lucide-react'
import s from './qa.module.css'
import type { Flow1Config } from '@/lib/retencion/qa/types'

export const REPO_EVERY: { v: number; t: string }[] = [
  { v: 60, t: 'Cada hora' },
  { v: 360, t: 'Cada 6 horas' },
  { v: 720, t: 'Cada 12 horas' },
  { v: 1440, t: 'Cada día' },
  { v: 10080, t: 'Cada semana' },
]

const OPTIONS: { k: 'manual' | 'tickets' | 'repo'; icon: typeof PenLine; t: string; d: string }[] = [
  { k: 'manual', icon: PenLine, t: 'Manual', d: 'Escribes cada mejora que se hace.' },
  { k: 'tickets', icon: Ticket, t: 'Tickets', d: 'Cada ticket nuevo se analiza y, si es una norma, se propone.' },
  { k: 'repo', icon: GitBranch, t: 'Repositorio', d: 'Revisa los commits nuevos cada cierto tiempo.' },
]

/** Las tres vías de entrada del flujo de cambios. Se usa en el tutorial y al pulsar «Configurar». */
export default function Flow1ConfigForm({
  initial,
  saving,
  onSave,
  submitLabel = 'Guardar',
}: {
  initial: Flow1Config
  saving: boolean
  onSave: (c: Flow1Config) => void
  submitLabel?: string
}) {
  const [cfg, setCfg] = useState<Flow1Config>(initial)
  const initialKey = JSON.stringify(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setCfg(initial), [initialKey])
  const any = cfg.manual || cfg.tickets || cfg.repo
  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map((o) => {
        const on = cfg[o.k]
        const Icon = o.icon
        return (
          <button
            key={o.k}
            type="button"
            className={`${s.option} ${on ? s.optionOn : ''}`}
            onClick={() => setCfg((c) => ({ ...c, [o.k]: !c[o.k] }))}
            aria-pressed={on}
          >
            <span className={s.check}>{on && <Check className="h-3.5 w-3.5" />}</span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Icon className="h-4 w-4" />
                {o.t}
              </span>
              <span className="text-[13px] text-gray-500">{o.d}</span>
              {o.k === 'repo' && on && (
                <select
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={cfg.repo_every_minutes}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCfg((c) => ({ ...c, repo_every_minutes: Number(e.target.value) }))}
                >
                  {REPO_EVERY.map((r) => (
                    <option key={r.v} value={r.v}>
                      {r.t}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        disabled={saving || !any}
        onClick={() => onSave(cfg)}
        className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  )
}

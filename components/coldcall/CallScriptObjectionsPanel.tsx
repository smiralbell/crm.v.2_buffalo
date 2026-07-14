import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { ScriptBox } from '@/lib/coldcall/script-parser'
import type { ColdCallObjection } from '@/lib/coldcall/objections'

interface CallScriptObjectionsPanelProps {
  campaignId: string
  scriptLang: 'es' | 'ca'
  onScriptLangChange: (lang: 'es' | 'ca') => void
  script: ScriptBox[]
  objections: ColdCallObjection[]
}

export default function CallScriptObjectionsPanel({
  campaignId,
  scriptLang,
  onScriptLangChange,
  script,
  objections,
}: CallScriptObjectionsPanelProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0">
      <div className="flex border-b border-gray-100 shrink-0">
        {(
          [
            { id: 'es' as const, label: 'Castellano' },
            { id: 'ca' as const, label: 'Català' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onScriptLangChange(t.id)}
            className={`flex-1 py-2.5 text-xs font-semibold ${
              scriptLang === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x divide-gray-100 min-h-0 flex-1">
        <div className="flex flex-col min-h-0 border-b xl:border-b-0 border-gray-100">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Guión</p>
          </div>
          <div className="overflow-y-auto max-h-[min(40vh,360px)] xl:max-h-[min(58vh,560px)] divide-y divide-gray-100">
            {script.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">
                Sin guión.{' '}
                <Link href={`/coldcalling/campanas/${campaignId}`} className="underline">
                  Configurar
                </Link>
              </p>
            ) : (
              script.map((box, i) => (
                <div key={i} className="p-3 space-y-1.5">
                  <Badge variant="secondary" className="font-semibold text-[10px]">
                    {box.title}
                  </Badge>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line bg-gray-50 rounded-xl p-3 border border-gray-100">
                    {box.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col min-h-0 bg-amber-50/30">
          <div className="px-4 py-2.5 border-b border-amber-100 bg-amber-50/80 shrink-0 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Objeciones</p>
            <Link
              href="/comercial/objeciones"
              className="text-[10px] font-medium text-amber-800 underline underline-offset-2"
            >
              Editar
            </Link>
          </div>
          <div className="overflow-y-auto max-h-[min(40vh,360px)] xl:max-h-[min(58vh,560px)] p-3 space-y-2.5">
            {objections.length === 0 ? (
              <p className="text-sm text-gray-500 p-2">Sin objeciones configuradas.</p>
            ) : (
              objections.map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-amber-100 bg-white p-3 space-y-1.5 shadow-sm"
                >
                  <p className="text-xs font-semibold text-amber-950 leading-snug">
                    &ldquo;{item.objection}&rdquo;
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                    {item.response}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

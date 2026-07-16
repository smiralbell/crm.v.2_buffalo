'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { telHref } from '@/lib/coldcall/lead-links'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import { stageLabel } from '@/lib/coldcall/lead-table'
import { Loader2, Phone, PhoneIncoming, Search, X } from 'lucide-react'

export interface PhoneLookupResult {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  stage: string | null
  call_attempts: number
}

export default function PhoneLookupBar({
  className = '',
  autofocus = false,
}: {
  className?: string
  autofocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PhoneLookupResult[] | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (autofocus) inputRef.current?.focus()
  }, [autofocus])

  const search = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (trimmed.replace(/\D/g, '').length < 6) {
      setResults(null)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/coldcall/phone-lookup?q=${encodeURIComponent(trimmed)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo buscar')
        setResults([])
        return
      }
      setResults(data.results || [])
    } catch {
      setError('Error de red')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const onChange = (value: string) => {
    setQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 320)
  }

  const clear = () => {
    setQ('')
    setResults(null)
    setError('')
    inputRef.current?.focus()
  }

  return (
    <div className={`rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 space-y-3 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <PhoneIncoming className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">¿Quién me llama?</p>
          <p className="text-xs text-emerald-900/70 mt-0.5">
            Pega el número si te devuelven la llamada y verás el lead al instante.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-700/50" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (debounceRef.current) clearTimeout(debounceRef.current)
                search(q)
              }
            }}
            placeholder="Ej. 612 345 678 o +34…"
            className="pl-9 pr-9 rounded-xl bg-white border-emerald-200"
            inputMode="tel"
            autoComplete="off"
          />
          {q && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
              aria-label="Limpiar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          className="rounded-xl bg-emerald-700 hover:bg-emerald-800 shrink-0"
          disabled={loading || q.replace(/\D/g, '').length < 6}
          onClick={() => search(q)}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-white/80 rounded-lg px-3 py-2 border border-red-100">
          {error}
        </p>
      )}

      {results && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-emerald-900/70 bg-white/70 rounded-xl px-3 py-4 text-center border border-dashed border-emerald-200">
              No hay ningún lead con ese número en tus campañas.
            </p>
          ) : (
            results.map((r) => {
              const tel = telHref(r.telefono)
              const phone = formatPhoneForDisplay(r.telefono)
              const station =
                r.campaign_id != null
                  ? `/coldcalling/campanas/${r.campaign_id}/llamadas?leadId=${r.id}`
                  : null
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-emerald-100 bg-white px-3 py-3 flex flex-wrap items-center gap-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{r.nombre}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {[r.empresa, r.campaign_name, phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {r.stage && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {stageLabel(r.stage)}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {r.call_attempts} llamadas
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {tel && (
                      <Button size="sm" variant="outline" className="rounded-lg gap-1.5" asChild>
                        <a href={tel}>
                          <Phone className="h-3.5 w-3.5" />
                          Llamar
                        </a>
                      </Button>
                    )}
                    {station && (
                      <Button size="sm" className="rounded-lg bg-gray-900 hover:bg-gray-800" asChild>
                        <Link href={station}>Abrir estación</Link>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type SuggestRow = {
  id: number
  displayName: string
  nombre: string | null
  empresa: string | null
  email: string | null
}

type Props = {
  id: string
  label: string
  value: string
  onChange: (clientName: string) => void
  placeholder?: string
}

export function ClientSuggestCombobox({ id, label, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SuggestRow[]>([])
  const [highlight, setHighlight] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggest = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/suggest?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        setItems([])
        return
      }
      const data = await res.json()
      setItems(Array.isArray(data.contacts) ? data.contacts : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchSuggest(value.trim())
    }, 220)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, open, fetchSuggest])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setHighlight(-1)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (row: SuggestRow) => {
    onChange(row.displayName)
    setOpen(false)
    setHighlight(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1 >= items.length ? 0 : h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? items.length - 1 : h - 1))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      pick(items[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1">
        <Input
          id={id}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setHighlight(-1)
          }}
          onFocus={() => {
            setOpen(true)
            setHighlight(-1)
          }}
          onKeyDown={onKeyDown}
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>
      {open && (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
          role="listbox"
        >
          {items.length === 0 && !loading && (
            <li className="px-3 py-2 text-gray-500">
              {value.trim() ? 'Sin coincidencias' : 'Escribe para buscar entre contactos'}
            </li>
          )}
          {items.map((row, i) => (
            <li key={row.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gray-50',
                  i === highlight && 'bg-gray-100'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(row)}
              >
                <span className="font-medium text-gray-900">{row.displayName}</span>
                {row.email && <span className="text-xs text-gray-500">{row.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

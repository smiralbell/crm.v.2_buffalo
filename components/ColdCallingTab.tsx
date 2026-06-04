import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Voicemail,
  CalendarCheck, ThumbsDown, User, Building2, MapPin,
  Search, Upload, Filter, RefreshCw, ChevronRight,
  MessageSquare, Mail, Copy, Check, X, ChevronDown,
  ChevronUp, Clock, TrendingUp, Target, Zap, Plus,
  Trash2, Edit3, ExternalLink, AlertCircle, Globe, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

// ── Types ────────────────────────────────────────────────────────────────────

interface ColdCall {
  id: number
  fecha: string
  resultado: string
  duracion: number | null
  notas: string | null
}

interface Prospect {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  zona: string | null
  sector: string | null
  cargo: string | null
  linkedin: string | null
  web: string | null
  estado: string
  notas: string | null
  assigned_to: string | null
  created_at: string
  calls: ColdCall[]
}

interface Metrics {
  hoy: { llamadas: number; interesados: number; reuniones: number; tasaConversion: number }
  totales: { prospectos: number }
  porEstado: Record<string, number>
  zonas: { zona: string | null; count: number }[]
  sectores: { sector: string | null; count: number }[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const ESTADOS = [
  { id: 'pendiente',        label: 'Pendiente',        color: 'bg-gray-100 text-gray-700',      dot: 'bg-gray-400' },
  { id: 'interesado',       label: 'Interesado',       color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  { id: 'reunion_agendada', label: 'Reunión agendada', color: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-500' },
  { id: 'sin_respuesta',    label: 'Sin respuesta',    color: 'bg-yellow-100 text-yellow-700',  dot: 'bg-yellow-500' },
  { id: 'no_interesado',    label: 'No interesado',    color: 'bg-red-100 text-red-700',        dot: 'bg-red-400' },
  { id: 'no_contactar',     label: 'No contactar',     color: 'bg-gray-200 text-gray-500',      dot: 'bg-gray-400' },
]

const RESULTADOS = [
  { id: 'interesado',       label: 'Interesado',       icon: ThumbsDown,    color: 'bg-green-500 hover:bg-green-600 text-white', emoji: '✅' },
  { id: 'reunion_agendada', label: 'Reunión agendada', icon: CalendarCheck, color: 'bg-purple-500 hover:bg-purple-600 text-white', emoji: '📅' },
  { id: 'sin_respuesta',    label: 'Sin respuesta',    icon: PhoneMissed,   color: 'bg-yellow-500 hover:bg-yellow-600 text-white', emoji: '📵' },
  { id: 'buzon_voz',        label: 'Buzón de voz',     icon: Voicemail,     color: 'bg-orange-500 hover:bg-orange-600 text-white', emoji: '📨' },
  { id: 'no_interesado',    label: 'No interesado',    color: 'bg-red-500 hover:bg-red-600 text-white',    emoji: '❌' },
  { id: 'no_contactar',     label: 'No contactar',     color: 'bg-gray-500 hover:bg-gray-600 text-white',  emoji: '🚫' },
]

const GUION = [
  {
    titulo: '🎯 Apertura (15 seg)',
    texto: `"Buenas [días/tardes], soy [tu nombre] de Buffalo AI. Te llamo porque ayudamos a despachos de abogados en Cataluña a automatizar su atención al cliente con inteligencia artificial. ¿Tienes 2 minutitos ahora?"`,
  },
  {
    titulo: '💡 Propuesta de valor (30 seg)',
    texto: `"Lo que hacemos es implementar un agente de IA que atiende llamadas y WhatsApps de tus clientes las 24 horas. Gestiona primeras consultas, agenda citas y responde preguntas frecuentes. Los despachos con los que trabajamos ahorran entre 15 y 20 horas semanales de gestión administrativa."`,
  },
  {
    titulo: '❓ Pregunta de dolor',
    texto: `"¿Cuántas llamadas o mensajes recibes a diario que podría gestionar alguien sin tu intervención directa?"`,
  },
  {
    titulo: '💬 Objeciones frecuentes',
    texto: `• "Ya tenemos secretaria" → "El agente la complementa. Cubre fuera de horario y libera a tu equipo para tareas de más valor."
• "No me interesa la IA" → "¿Puedo preguntarte cuánto tiempo dedica tu equipo a gestionar primeras consultas?"
• "¿Cuánto cuesta?" → "La implementación parte de 2.200€ y el mantenimiento es de 90-180€/mes. Si gestiona solo 3-4 consultas extra al mes, se amortiza solo."
• "Ahora no es el momento" → "¿Cuándo sería buen momento? Solo necesito 20 minutos para una demo."`,
  },
  {
    titulo: '🤝 Cierre',
    texto: `"¿Te parece si hacemos una demo rápida de 20 minutos esta semana? Te muestro exactamente cómo funcionaría en tu despacho. ¿Mejor el martes o el jueves?"`,
  },
]

// ── Message templates ────────────────────────────────────────────────────────

function getMensaje(resultado: string, prospect: Prospect, comercial = '[comercial]'): { tipo: 'whatsapp' | 'email', mensaje: string, asunto?: string } | null {
  const nombre = prospect.nombre.split(' ')[0]
  switch (resultado) {
    case 'interesado':
      return {
        tipo: 'whatsapp',
        mensaje: `Hola ${nombre}! 👋 Soy ${comercial} de Buffalo AI. Encantado de hablar contigo hace un momento. Te comparto aquí un poco más de info sobre lo que hacemos para despachos como el tuyo: agenciabuffalo.es\n\nCualquier duda que tengas, escríbeme aquí. ¡Hasta pronto! 🚀`,
      }
    case 'reunion_agendada':
      return {
        tipo: 'whatsapp',
        mensaje: `Hola ${nombre}! ✅ Confirmo nuestra reunión. En cuanto tenga el enlace de Google Meet te lo envío por aquí.\n\nSi necesitas cambiar algo, dímelo sin problema. ¡Hasta entonces! 🙂`,
      }
    case 'sin_respuesta':
      return {
        tipo: 'whatsapp',
        mensaje: `Hola ${nombre}, soy ${comercial} de Buffalo AI. Te he llamado hace un momento pero no te he podido localizar. 📞\n\nTe escribo por aquí por si lo tienes más cómodo. ¿Tienes unos minutos esta semana para una llamada rápida?`,
      }
    case 'buzon_voz':
      return {
        tipo: 'whatsapp',
        mensaje: `Hola ${nombre}, soy ${comercial} de Buffalo AI. Acabo de dejarte un mensaje de voz. En resumen, ayudamos a despachos como el tuyo a automatizar la atención al cliente con IA.\n\n¿Cuándo tienes disponibilidad para hablar 5 minutos?`,
      }
    case 'no_interesado':
      return {
        tipo: 'email',
        asunto: `Gracias por tu tiempo, ${nombre}`,
        mensaje: `Hola ${nombre},\n\nGracias por atenderme. Entiendo perfectamente que no sea el momento adecuado.\n\nSi en el futuro necesitáis optimizar la gestión de clientes con inteligencia artificial, aquí estaremos.\n\n¡Un saludo y mucho éxito con el despacho!\n\n${comercial}\nBuffalo AI\nagenciabuffalo.es`,
      }
    default:
      return null
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS.find(s => s.id === estado) || ESTADOS[0]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${e.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />
      {e.label}
    </span>
  )
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']))
  }).filter(r => Object.values(r).some(v => v))
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricBox({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── New Prospect Modal ────────────────────────────────────────────────────────

function NewProspectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ nombre: '', empresa: '', telefono: '', email: '', zona: '', sector: '', cargo: '' })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    await fetch('/api/coldcall/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    onCreated()
    onClose()
  }

  const fields: [keyof typeof form, string, string][] = [
    ['nombre',   'Nombre *',     'text'],
    ['empresa',  'Empresa',      'text'],
    ['telefono', 'Teléfono',     'tel'],
    ['email',    'Email',        'email'],
    ['zona',     'Zona / Ciudad','text'],
    ['sector',   'Sector',       'text'],
    ['cargo',    'Cargo',        'text'],
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-900">Nuevo prospecto</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          {fields.map(([k, label, type]) => (
            <div key={k} className={k === 'nombre' || k === 'empresa' ? 'col-span-2' : ''}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input
                type={type}
                value={form[k]}
                onChange={e => set(k, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-gray-900 text-white" onClick={submit} disabled={saving || !form.nombre.trim()}>
            {saving ? 'Guardando...' : 'Crear'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Google Maps Search ────────────────────────────────────────────────────────

interface PlaceResult {
  placeId: string
  nombre: string
  empresa: string
  telefono: string
  web: string
  zona: string
  sector: string
  direccion: string
  rating: number | null
  reviews: number | null
}

// Places API (New) Text Search: $0.032 por request · límite 5€ = ~156 requests
const COST_PER_REQUEST = 0.032  // USD
const MAX_COST_EUR     = 5      // €
const USD_TO_EUR       = 0.93
const MAX_REQUESTS     = Math.floor((MAX_COST_EUR / USD_TO_EUR) / COST_PER_REQUEST) // ~168

const CIUDADES_CATALUNA = [
  'Barcelona','Hospitalet de Llobregat','Badalona','Terrassa','Sabadell',
  'Lleida','Tarragona','Mataró','Santa Coloma de Gramenet','Reus',
  'Girona','Sant Cugat del Vallès','Cornellà de Llobregat','Manresa',
  'Sant Boi de Llobregat','Rubí','Vilanova i la Geltrú','Viladecans',
  'El Prat de Llobregat','Granollers','Castelldefels','Mollet del Vallès',
  'Cerdanyola del Vallès','Gavà','Esplugues de Llobregat','Igualada',
  'Figueres','Vic','Tortosa','Sitges',
]

function GoogleMapsSearch({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState('abogados')
  const [ciudad, setCiudad] = useState('Barcelona')
  const [ciudadCustom, setCiudadCustom] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [requestCount, setRequestCount] = useState(0)

  const ciudadFinal = ciudad === '__custom__' ? ciudadCustom : ciudad
  const costEur = (requestCount * COST_PER_REQUEST * USD_TO_EUR)
  const limitReached = requestCount >= MAX_REQUESTS
  const nearLimit = requestCount >= MAX_REQUESTS * 0.8

  const search = async (reset = true) => {
    if (!query.trim() || !ciudadFinal.trim()) return
    if (limitReached) return
    setSearching(true)
    setError('')
    if (reset) { setResults([]); setSelected(new Set()); setPage(1) }

    const res = await fetch('/api/coldcall/search-places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ciudad: ciudadFinal, pageToken: reset ? undefined : nextPage }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error || 'Error'); setSearching(false); return }

    setResults(prev => reset ? d.results : [...prev, ...d.results])
    setNextPage(d.nextPageToken || null)
    setRequestCount(c => c + 1)
    if (!reset) setPage(p => p + 1)
    setSearching(false)
  }

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map(r => r.placeId)))
    }
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const importSelected = async () => {
    const toImport = results.filter(r => selected.has(r.placeId))
    if (!toImport.length) return
    setImporting(true)
    const prospects = toImport.map(r => ({
      nombre:   r.nombre,
      empresa:  r.empresa,
      telefono: r.telefono,
      web:      r.web,
      zona:     r.zona,
      sector:   r.sector,
    }))
    const res = await fetch('/api/coldcall/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects }),
    })
    const d = await res.json()
    setImportedCount(d.imported || 0)
    setImporting(false)
    setSelected(new Set())
    onImported()
  }

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-blue-100">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0">
          <Globe className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Buscar prospectos en Google Maps</p>
          <p className="text-xs text-gray-500">Places API · ~200 resultados por ciudad gratis al mes</p>
        </div>
      </div>

      {/* Cost meter */}
      <div className={`flex items-center justify-between px-5 py-2 text-xs font-medium border-b ${
        limitReached ? 'bg-red-50 border-red-200 text-red-700' :
        nearLimit    ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                       'bg-gray-50 border-blue-100 text-gray-500'
      }`}>
        <span>
          {limitReached
            ? '🚫 Límite de 5€ alcanzado — reinicia la página para continuar'
            : nearLimit
            ? `⚠️ Cerca del límite — ${requestCount} búsquedas · ${costEur.toFixed(2)}€ estimado`
            : `💳 Coste estimado: ${costEur.toFixed(3)}€ de ${MAX_COST_EUR}€ máx · ${requestCount} búsquedas`
          }
        </span>
        {requestCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${limitReached ? 'bg-red-500' : nearLimit ? 'bg-yellow-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, (requestCount / MAX_REQUESTS) * 100)}%` }}
              />
            </div>
            <span>{Math.round((requestCount / MAX_REQUESTS) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Search form */}
      <div className="p-4 bg-white">
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="abogados, notarios, consultoras..."
            className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <select
            value={ciudad}
            onChange={e => setCiudad(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {CIUDADES_CATALUNA.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__custom__">Otra ciudad...</option>
          </select>
          {ciudad === '__custom__' && (
            <input
              value={ciudadCustom}
              onChange={e => setCiudadCustom(e.target.value)}
              placeholder="Ciudad"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-36"
            />
          )}
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => search(true)}
            disabled={searching || limitReached}
          >
            {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">{searching ? 'Buscando...' : 'Buscar'}</span>
          </Button>
        </div>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-y border-blue-100">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selected.size === results.length} onChange={toggleAll}
                className="rounded cursor-pointer" />
              <span className="text-xs text-gray-600 font-medium">
                {results.length} resultados · {selected.size} seleccionados
              </span>
            </div>
            <div className="flex items-center gap-2">
              {nextPage && (
                <Button variant="outline" size="sm" onClick={() => search(false)} disabled={searching || limitReached}>
                  {searching ? 'Cargando...' : '+ Cargar más'}
                </Button>
              )}
              {selected.size > 0 && (
                <Button
                  size="sm"
                  className="bg-gray-900 text-white"
                  onClick={importSelected}
                  disabled={importing}
                >
                  {importing ? 'Importando...' : `Importar ${selected.size} prospectos`}
                </Button>
              )}
            </div>
          </div>

          {importedCount > 0 && (
            <div className="px-4 py-2 bg-green-50 text-green-700 text-sm font-medium border-b border-green-100">
              ✅ {importedCount} prospectos importados correctamente
            </div>
          )}

          {/* List */}
          <div className="divide-y divide-blue-50 max-h-96 overflow-y-auto bg-white">
            {results.map(r => (
              <label key={r.placeId} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(r.placeId)}
                  onChange={() => toggle(r.placeId)}
                  className="mt-1 rounded cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.direccion}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {r.telefono && (
                          <span className="text-xs text-green-700 flex items-center gap-1">
                            <Phone className="h-3 w-3" />{r.telefono}
                          </span>
                        )}
                        {r.web && (
                          <span className="text-xs text-blue-600 flex items-center gap-1 truncate max-w-40">
                            <Globe className="h-3 w-3 shrink-0" />{r.web.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </span>
                        )}
                      </div>
                    </div>
                    {r.rating && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-xs text-gray-600">{r.rating} ({r.reviews})</span>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Call Panel (drawer) ───────────────────────────────────────────────────────

function CallPanel({ prospect, onClose, onUpdate }: {
  prospect: Prospect
  onClose: () => void
  onUpdate: (p: Prospect) => void
}) {
  const [resultado, setResultado] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [duracion, setDuracion] = useState('')
  const [reunionFecha, setReunionFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [guionOpen, setGuionOpen] = useState(false)
  const [msgCopiado, setMsgCopiado] = useState(false)
  const [editNotas, setEditNotas] = useState(false)
  const [notasProspecto, setNotasProspecto] = useState(prospect.notas || '')

  const mensaje = resultado ? getMensaje(resultado, prospect) : null

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto)
    setMsgCopiado(true)
    setTimeout(() => setMsgCopiado(false), 2000)
  }

  const llamar = () => {
    if (prospect.telefono) {
      window.location.href = `tel:${prospect.telefono}`
    }
  }

  const registrar = async () => {
    if (!resultado) return
    setSaving(true)
    const res = await fetch('/api/coldcall/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: prospect.id,
        resultado,
        notas,
        duracion: duracion ? parseInt(duracion) * 60 : null,
        reunion_fecha: reunionFecha || null,
        whatsapp_enviado: msgCopiado && mensaje?.tipo === 'whatsapp',
        email_enviado: msgCopiado && mensaje?.tipo === 'email',
      }),
    })
    const call = await res.json()
    setSaving(false)
    setSaved(true)

    // Refresh prospect
    const pRes = await fetch(`/api/coldcall/prospects/${prospect.id}`)
    if (pRes.ok) onUpdate(await pRes.json())

    setTimeout(() => { setSaved(false); setResultado(null); setNotas(''); setDuracion('') }, 2000)
  }

  const guardarNotas = async () => {
    await fetch(`/api/coldcall/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notasProspecto }),
    })
    setEditNotas(false)
    onUpdate({ ...prospect, notas: notasProspecto })
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b z-10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-lg text-gray-900 truncate">{prospect.nombre}</h2>
                <EstadoBadge estado={prospect.estado} />
              </div>
              {prospect.empresa && <p className="text-sm text-gray-500 truncate">{prospect.empresa}</p>}
              {prospect.cargo && <p className="text-xs text-gray-400">{prospect.cargo}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Contact info */}
          <div className="flex flex-wrap gap-2 mt-3">
            {prospect.telefono && (
              <button onClick={llamar} className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
                <Phone className="h-3.5 w-3.5" />
                {prospect.telefono}
              </button>
            )}
            {prospect.email && (
              <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm">
                <Mail className="h-3.5 w-3.5" />
                {prospect.email}
              </span>
            )}
            {prospect.zona && (
              <span className="flex items-center gap-1.5 bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-sm">
                <MapPin className="h-3.5 w-3.5" />
                {prospect.zona}
              </span>
            )}
            {prospect.linkedin && (
              <a href={prospect.linkedin.startsWith('http') ? prospect.linkedin : `https://${prospect.linkedin}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 bg-sky-50 text-sky-700 px-3 py-1.5 rounded-lg text-sm hover:bg-sky-100">
                <ExternalLink className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4">

          {/* Guión de ventas */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setGuionOpen(o => !o)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700"
            >
              <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> Guión de ventas</span>
              {guionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {guionOpen && (
              <div className="p-4 space-y-3 bg-white">
                {GUION.map((g, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-bold text-gray-600">{g.titulo}</p>
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line bg-gray-50 rounded-lg p-2.5">{g.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registrar llamada */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-gray-500" />
                Registrar llamada
              </p>
            </div>
            <div className="p-4 space-y-4">

              {/* Resultado */}
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium">¿Cómo fue?</p>
                <div className="grid grid-cols-2 gap-2">
                  {RESULTADOS.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setResultado(r.id === resultado ? null : r.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border-2 ${
                        resultado === r.id
                          ? r.color + ' border-transparent scale-[1.02] shadow-md'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-base leading-none">{r.emoji}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duración + Reunión */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Duración (min)</label>
                  <input
                    type="number" min="0" placeholder="0"
                    value={duracion}
                    onChange={e => setDuracion(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                {resultado === 'reunion_agendada' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Fecha reunión</label>
                    <input
                      type="datetime-local"
                      value={reunionFecha}
                      onChange={e => setReunionFecha(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notas de la llamada</label>
                <textarea
                  rows={2}
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Qué comentó, objeciones, próximos pasos..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                />
              </div>

              {/* Mensaje post-llamada */}
              {mensaje && (
                <div className={`rounded-xl border p-3 space-y-2 ${mensaje.tipo === 'whatsapp' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                      {mensaje.tipo === 'whatsapp'
                        ? <><MessageSquare className="h-3.5 w-3.5 text-green-600" /> WhatsApp sugerido</>
                        : <><Mail className="h-3.5 w-3.5 text-blue-600" /> Email sugerido</>
                      }
                    </p>
                    <button
                      onClick={() => copiar(mensaje.tipo === 'email' ? `Asunto: ${mensaje.asunto}\n\n${mensaje.mensaje}` : mensaje.mensaje)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors ${msgCopiado ? 'bg-green-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {msgCopiado ? <><Check className="h-3 w-3" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
                    </button>
                  </div>
                  {mensaje.asunto && <p className="text-xs text-gray-500 font-medium">Asunto: {mensaje.asunto}</p>}
                  <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{mensaje.mensaje}</p>
                </div>
              )}

              {/* Guardar */}
              <button
                onClick={registrar}
                disabled={!resultado || saving || saved}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                  saved
                    ? 'bg-green-500 text-white'
                    : resultado
                    ? 'bg-gray-900 hover:bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {saved ? '✅ Guardado' : saving ? 'Guardando...' : 'Guardar llamada'}
              </button>
            </div>
          </div>

          {/* Notas del prospecto */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-700">Notas del prospecto</p>
              <button onClick={() => setEditNotas(o => !o)} className="text-gray-400 hover:text-gray-600">
                <Edit3 className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              {editNotas ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={notasProspecto}
                    onChange={e => setNotasProspecto(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditNotas(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-gray-900 text-white" onClick={guardarNotas}>Guardar</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">{notasProspecto || <span className="text-gray-400 italic">Sin notas</span>}</p>
              )}
            </div>
          </div>

          {/* Historial de llamadas */}
          {prospect.calls.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  Historial ({prospect.calls.length})
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {prospect.calls.map(c => {
                  const r = RESULTADOS.find(x => x.id === c.resultado)
                  return (
                    <div key={c.id} className="p-3 flex items-start gap-3">
                      <span className="text-lg leading-none mt-0.5">{r?.emoji || '📞'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700">{r?.label || c.resultado}</span>
                          {c.duracion && <span className="text-xs text-gray-400">{fmtDuration(c.duracion)}</span>}
                        </div>
                        {c.notas && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.notas}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(c.fecha)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ColdCallingTab() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  // Filters
  const [q, setQ] = useState('')
  const [zona, setZona] = useState('')
  const [sector, setSector] = useState('')
  const [estado, setEstado] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '40' })
    if (q) params.set('q', q)
    if (zona) params.set('zona', zona)
    if (sector) params.set('sector', sector)
    if (estado) params.set('estado', estado)

    const [pRes, mRes] = await Promise.all([
      fetch(`/api/coldcall/prospects?${params}`),
      fetch('/api/coldcall/metrics'),
    ])
    if (pRes.ok) {
      const d = await pRes.json()
      setProspects(d.prospects)
      setTotal(d.total)
    }
    if (mRes.ok) setMetrics(await mRes.json())
    setLoading(false)
  }, [q, zona, sector, estado])

  useEffect(() => { loadData(1); setPage(1) }, [q, zona, sector, estado, loadData])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg('')
    const text = await file.text()
    const parsed = parseCSV(text)
    if (!parsed.length) { setImportMsg('No se encontraron filas válidas'); setImporting(false); return }
    const res = await fetch('/api/coldcall/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects: parsed }),
    })
    const d = await res.json()
    setImportMsg(`✅ ${d.imported} prospectos importados`)
    setImporting(false)
    loadData(1)
    if (fileRef.current) fileRef.current.value = ''
  }

  const updateProspect = (updated: Prospect) => {
    setProspects(ps => ps.map(p => p.id === updated.id ? updated : p))
    if (selected?.id === updated.id) setSelected(updated)
  }

  const LIMIT = 40
  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-5">

      {/* KPIs */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricBox label="Llamadas hoy"   value={metrics.hoy.llamadas}     icon={Phone}        color="bg-gray-900 text-white" />
          <MetricBox label="Interesados hoy" value={metrics.hoy.interesados}  icon={TrendingUp}   color="bg-green-500 text-white" />
          <MetricBox label="Reuniones hoy"  value={metrics.hoy.reuniones}    icon={CalendarCheck} color="bg-purple-500 text-white" />
          <MetricBox label="Tasa conversión" value={`${metrics.hoy.tasaConversion}%`} sub={`${metrics.totales.prospectos} prospectos`} icon={Target} color="bg-blue-500 text-white" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, empresa, teléfono..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300">
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>

        {metrics && metrics.zonas.length > 0 && (
          <select value={zona} onChange={e => setZona(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300">
            <option value="">Todas las zonas</option>
            {metrics.zonas.map(z => <option key={z.zona} value={z.zona!}>{z.zona} ({z.count})</option>)}
          </select>
        )}

        {metrics && metrics.sectores.length > 0 && (
          <select value={sector} onChange={e => setSector(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300">
            <option value="">Todos los sectores</option>
            {metrics.sectores.map(s => <option key={s.sector} value={s.sector!}>{s.sector} ({s.count})</option>)}
          </select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => loadData(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1.5" />
            {importing ? 'Importando...' : 'Importar CSV'}
          </Button>

          <Button size="sm" className="bg-gray-900 text-white" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo
          </Button>
        </div>
      </div>

      {importMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
          {importMsg}
        </div>
      )}

      {/* Google Maps Search */}
      <GoogleMapsSearch onImported={() => loadData(1)} />

      {/* Hint CSV */}
      {total === 0 && !loading && (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <Phone className="h-7 w-7 text-gray-400" />
            </div>
          </div>
          <h3 className="font-semibold text-gray-600">Sin prospectos todavía</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Importa un CSV con columnas: <code className="bg-gray-100 px-1 rounded">nombre, empresa, telefono, email, zona, sector</code>
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Importar CSV
            </Button>
            <Button className="bg-gray-900 text-white" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Añadir manualmente
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {prospects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prospecto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Zona / Sector</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Última llamada</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Llamadas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prospects.map(p => {
                const lastCall = p.calls[0]
                const isSelected = selected?.id === p.id
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.nombre}</div>
                      {p.empresa && <div className="text-xs text-gray-500">{p.empresa}</div>}
                      {p.telefono && <div className="text-xs text-gray-400">{p.telefono}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {p.zona && <div className="text-gray-600">{p.zona}</div>}
                      {p.sector && <div className="text-xs text-gray-400">{p.sector}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {lastCall ? (
                        <div>
                          <div className="text-xs text-gray-600">{RESULTADOS.find(r => r.id === lastCall.resultado)?.emoji} {RESULTADOS.find(r => r.id === lastCall.resultado)?.label}</div>
                          <div className="text-xs text-gray-400">{fmtDate(lastCall.fecha)}</div>
                        </div>
                      ) : <span className="text-xs text-gray-400">Sin llamadas</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm font-medium text-gray-700">{p.calls.length}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500">{total} prospectos en total</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); loadData(page - 1) }}>
                  ←
                </Button>
                <span className="text-xs text-gray-600 px-2">{page} / {pages}</span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => { setPage(p => p + 1); loadData(page + 1) }}>
                  →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <CallPanel
          prospect={selected}
          onClose={() => setSelected(null)}
          onUpdate={updateProspect}
        />
      )}

      {showNew && (
        <NewProspectModal
          onClose={() => setShowNew(false)}
          onCreated={() => loadData(1)}
        />
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Phone, PhoneCall, PhoneMissed, Voicemail, CalendarPlus,
  ThumbsUp, ThumbsDown, Ban, MapPin, Mail, Globe,
  Search, Upload, RefreshCw, ChevronRight, ChevronDown, ChevronUp,
  MessageSquare, Copy, Check, X, Clock, TrendingUp, Target,
  Plus, Edit3, ExternalLink, Star, BookOpen, ArrowRight,
  UserPlus, AlertCircle, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColdCall {
  id: number; fecha: string; resultado: string; duracion: number | null; notas: string | null; reunion_fecha: string | null
}
interface Prospect {
  id: number; nombre: string; empresa: string | null; telefono: string | null
  email: string | null; zona: string | null; sector: string | null; cargo: string | null
  linkedin: string | null; web: string | null; estado: string; notas: string | null
  assigned_to: string | null; created_at: string; calls: ColdCall[]
}
interface Funnel {
  total_prospectos: number; llamadas_hechas: number; pendientes: number
  sin_respuesta: number; llamar_tarde: number
  interesados: number; reunion_agendada: number
  no_interesado: number; no_contactar: number
}
interface Metrics {
  hoy: { llamadas: number; interesados: number; reuniones: number; tasaConversion: number }
  totales: { prospectos: number; llamadas: number }
  funnel: Funnel
  porEstado: Record<string, number>
  zonas: { zona: string | null; count: number }[]
  sectores: { sector: string | null; count: number }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ESTADOS = [
  { id: 'pendiente',        label: 'Pendiente',        icon: Clock },
  { id: 'llamar_tarde',     label: 'Llamar más tarde', icon: CalendarPlus },
  { id: 'interesado',       label: 'Interesado',       icon: TrendingUp },
  { id: 'reunion_agendada', label: 'Reunión agendada', icon: CalendarPlus },
  { id: 'sin_respuesta',    label: 'Sin respuesta',    icon: PhoneMissed },
  { id: 'no_interesado',    label: 'No interesado',    icon: ThumbsDown },
  { id: 'no_contactar',     label: 'No contactar',     icon: Ban },
]

const RESULTADOS = [
  { id: 'interesado',       label: 'Interesado',       icon: ThumbsUp },
  { id: 'reunion_agendada', label: 'Reunión agendada', icon: CalendarPlus },
  { id: 'llamar_tarde',     label: 'Llamar más tarde', icon: Clock },
  { id: 'sin_respuesta',    label: 'Sin respuesta',    icon: PhoneMissed },
  { id: 'buzon_voz',        label: 'Buzón de voz',     icon: Voicemail },
  { id: 'no_interesado',    label: 'No interesado',    icon: ThumbsDown },
  { id: 'no_contactar',     label: 'No contactar',     icon: Ban },
]

// ── Sales scripts ─────────────────────────────────────────────────────────────

const GUION_ES = [
  {
    step: '01', titulo: 'Recepción',
    texto: '"Buenas, ¿me puede poner con el responsable del despacho o el socio director? De parte de Sergi, de Buffalo AI."',
    tip: 'Si pregunta de qué: "Es una llamada comercial, no le robo más de 2 minutos." La honestidad funciona mejor que inventar excusas.',
  },
  {
    step: '02', titulo: 'Apertura',
    texto: '"Hola, buenas tardes. ¿Con quién hablo?\n\nPerfecto, [Nombre], encantado.\n\nSoy Sergi Masoliver, de Buffalo AI. No sé si me tienes ubicado."',
    tip: 'Presentarse con nombre y apellido da seriedad. Preguntar "¿con quién hablo?" muestra respeto.',
  },
  {
    step: '03', titulo: 'Los 15 segundos',
    texto: '"No pasa nada. Mira, te robo únicamente 15 segundos y si no te interesa me lo dices sin ningún problema, ¿vale?"',
    tip: 'Dar permiso para decir que no baja la guardia. Contraintuitivo pero muy efectivo.',
  },
  {
    step: '04', titulo: 'Propuesta de valor',
    texto: '"Estamos ayudando a despachos como el vuestro a gestionar todas las consultas que llegan tanto dentro como fuera del horario laboral.\n\nLo que nos comentan muchos despachos es que reciben un volumen importante de llamadas, pero que no todas tienen sentido para el negocio y al final los abogados acaban filtrando casos que no son viables.\n\nHemos desarrollado un sistema de atención al cliente con inteligencia artificial que atiende esas consultas, hace las preguntas necesarias y determina cuáles tienen sentido pasar a un abogado.\n\nAl despacho solo le llegan los casos realmente interesantes."',
    tip: 'Hablar del problema que ya conocen antes de presentar la solución.',
  },
  {
    step: '05', titulo: 'Pregunta de cierre',
    texto: '"Hasta aquí, ¿te encaja? ¿Crees que podría tener sentido en vuestro caso?"',
    tip: 'Pregunta abierta. Deja hablar al interlocutor.',
  },
  {
    step: '06', titulo: 'Si hay interés',
    texto: '"Perfecto. Hemos preparado una demo completamente gratuita para que podáis ver en directo cómo funcionaría exactamente para vuestro despacho.\n\nNo hay ningún compromiso. Simplemente os la enseñamos, valoráis si os aporta valor y decidís si tiene encaje o no.\n\n¿Qué te parece si buscamos 20 minutos esta semana?"',
    tip: '"Gratuita" + "sin compromiso" + fecha concreta es la combinación de cierre perfecta.',
  },
]

const GUION_CA = [
  {
    step: '01', titulo: 'Recepció',
    texto: '"Bones, em podria posar amb el responsable del despatx o el soci director? De part d\'en Sergi, de Buffalo AI."',
    tip: 'Si pregunta de què: "És una trucada comercial, no li robo més de 2 minuts." L\'honestedat funciona millor que inventar excuses.',
  },
  {
    step: '02', titulo: 'Obertura',
    texto: '"Hola, bona tarda. Amb qui parlo?\n\nPerfecte, [Nom], encantat.\n\nSóc en Sergi Masoliver, de Buffalo AI. No sé si em tens ubicat."',
    tip: 'Presentar-se amb nom i cognoms dóna serietat. Preguntar "amb qui parlo?" mostra respecte.',
  },
  {
    step: '03', titulo: 'Els 15 segons',
    texto: '"No passa res. Mira, et robo únicament 15 segons i si no t\'interessa m\'ho dius sense cap problema, ¿val?"',
    tip: 'Donar permís per dir que no baixa la guàrdia. Contraintuïtiu però molt efectiu.',
  },
  {
    step: '04', titulo: 'Proposta de valor',
    texto: '"Estem ajudant despatxos com el vostre a gestionar totes les consultes que arriben tant dins com fora de l\'horari laboral.\n\nEl que ens comenten molts despatxos és que reben un volum important de trucades, però que no totes tenen sentit per al negoci i al final els advocats acaben filtrant casos que no són viables.\n\nHem desenvolupat un sistema d\'atenció al client amb intel·ligència artificial que s\'encarrega d\'atendre aquestes consultes, fer les preguntes necessàries i determinar quines té sentit passar a un advocat.\n\nAl despatx només li arriben els casos realment interessants."',
    tip: 'Parlar del problema que ja coneixen abans de presentar la solució.',
  },
  {
    step: '05', titulo: 'Pregunta de tancament',
    texto: '"Fins aquí, t\'encaixa? Creus que podria tenir sentit en el vostre cas?"',
    tip: 'Pregunta oberta. Deixa parlar l\'interlocutor.',
  },
  {
    step: '06', titulo: 'Si hi ha interès',
    texto: '"Perfecte. Hem preparat una demo completament gratuïta perquè pugueu veure en directe com funcionaria exactament per al vostre despatx.\n\nNo hi ha cap compromís. Simplement us l\'ensenyem, valoreu si us aporta valor i decidiu si té encaix o no.\n\nQuè et sembla si busquem 20 minuts aquesta setmana?"',
    tip: '"Gratuïta" + "sense compromís" + data concreta és la combinació de tancament perfecta.',
  },
]

const OBJECIONES_ES = [
  { obj: '"Ya tenemos secretaria"', resp: '"Perfecto, ¿y fuera de horario? ¿Los sábados? El agente la complementa, no la sustituye. Los despachos que lo tienen dicen que su secretaria ahora puede dedicarse a tareas de mucho más valor."' },
  { obj: '"No me interesa la IA"', resp: '"Lo entiendo perfectamente. ¿Cuántas consultas recibís a la semana que no son casos para vosotros? ¿Cuánto tiempo os lleva filtrarlos?"' },
  { obj: '"¿Cuánto cuesta?"', resp: '"La implementación es de 2.200€ y el mantenimiento 90€/mes. Si el sistema os filtra 3-4 casos no viables a la semana y recuperáis 2 clientes nuevos al mes, se amortiza solo. Pero eso es lo que os mostraremos en la demo, con números reales."' },
  { obj: '"Ahora no es el momento"', resp: '"Lo entiendo. ¿Cuándo sería buen momento? Dame una fecha concreta y te llamo ese día."' },
  { obj: '"Mándame información por email"', resp: '"Por supuesto, ¿a qué email te lo envío? Y ya que lo hago — ¿qué es lo que más os preocupa, las consultas fuera de horario o el tiempo que dedicáis a filtrar casos?"' },
  { obj: '"Ya lo gestionamos bien"', resp: '"Me alegra escuchar eso. ¿Y los fines de semana y por las noches? ¿También lo tenéis cubierto? Porque la mayoría de despachos nos dicen que ahí es donde pierden más."' },
]

const OBJECIONES_CA = [
  { obj: '"Ja tenim secretària"', resp: '"Perfecte, i fora d\'horari? Els dissabtes? L\'agent la complementa, no la substitueix. Els despatxos que ho tenen diuen que la seva secretària ara es pot dedicar a tasques de molt més valor."' },
  { obj: '"No m\'interessa la IA"', resp: '"Ho entenc perfectament. Quantes consultes rebeu a la setmana que no són casos per a vosaltres? Quant de temps us porta filtrar-los?"' },
  { obj: '"Quant costa?"', resp: '"La implementació és de 2.200€ i el manteniment 90€/mes. Si el sistema us filtra 3-4 casos no viables a la setmana i recupereu 2 clients nous al mes, s\'amortitza sol. Però això és el que us mostrarem a la demo, amb números reals."' },
  { obj: '"Ara no és el moment"', resp: '"Ho entenc. Quan seria bon moment? Dóna\'m una data concreta i et truco aquell dia."' },
  { obj: '"Envia\'m informació per email"', resp: '"Per descomptat, a quin email t\'ho envio? I ja que ho faig — quina és la part que més us preocupa, les consultes fora d\'horari o el temps que dediqueu a filtrar casos?"' },
  { obj: '"Ja ho gestionem bé"', resp: '"M\'alegra sentir això. I els caps de setmana i per les nits? També ho teniu cobert? Perquè la majoria de despatxos ens diuen que és allà on perden més."' },
]

// ── Message templates ─────────────────────────────────────────────────────────

function getMensaje(resultado: string, prospect: Prospect): { tipo: 'whatsapp' | 'email'; texto: string; asunto?: string } | null {
  const nombre = prospect.nombre.split(' ')[0]
  switch (resultado) {
    case 'interesado':
      return { tipo: 'whatsapp', texto: `Hola ${nombre}, soy Sergi de Buffalo AI. Encantado de hablar contigo. Te comparto más información sobre lo que hacemos para despachos como el vuestro: agenciabuffalo.es\n\nQuedo a tu disposición para cualquier duda.` }
    case 'reunion_agendada':
      return { tipo: 'whatsapp', texto: `Hola ${nombre}, confirmo nuestra reunión. En cuanto tenga el enlace de Google Meet te lo envío por aquí.\n\nSi necesitas cambiar algo, dímelo sin problema.` }
    case 'sin_respuesta':
      return { tipo: 'whatsapp', texto: `Hola ${nombre}, soy Sergi de Buffalo AI. Te he llamado hace un momento pero no he podido localizarte.\n\nTe escribo por si lo tienes más cómodo. ¿Tienes unos minutos esta semana para una llamada rápida?` }
    case 'buzon_voz':
      return { tipo: 'whatsapp', texto: `Hola ${nombre}, soy Sergi de Buffalo AI. Acabo de dejarte un mensaje de voz. En resumen, ayudamos a despachos como el vuestro a automatizar la atención al cliente con IA.\n\n¿Cuándo tienes disponibilidad para hablar 5 minutos?` }
    case 'no_interesado':
      return { tipo: 'email', asunto: `Gracias por tu tiempo, ${nombre}`, texto: `Hola ${nombre},\n\nGracias por atenderme. Entiendo perfectamente que no sea el momento adecuado.\n\nSi en el futuro necesitáis optimizar la gestión de clientes con inteligencia artificial, aquí estaremos.\n\nUn saludo y mucho éxito con el despacho.\n\nSergi Masoliver\nBuffalo AI · agenciabuffalo.es` }
    default: return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS.find(s => s.id === estado) || ESTADOS[0]
  const Icon = e.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
      <Icon className="h-3 w-3" />
      {e.label}
    </span>
  )
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60); const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

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

// ── Cost limit ────────────────────────────────────────────────────────────────
const COST_PER_REQUEST = 0.032
const MAX_COST_EUR = 5
const USD_TO_EUR = 0.93
const MAX_REQUESTS = Math.floor((MAX_COST_EUR / USD_TO_EUR) / COST_PER_REQUEST)

// ── Cities ────────────────────────────────────────────────────────────────────
const CIUDADES_CATALUNA = [
  'Barcelona','Hospitalet de Llobregat','Badalona','Terrassa','Sabadell',
  'Lleida','Tarragona','Mataró','Santa Coloma de Gramenet','Reus',
  'Girona','Sant Cugat del Vallès','Cornellà de Llobregat','Manresa',
  'Sant Boi de Llobregat','Rubí','Vilanova i la Geltrú','Granollers',
  'Castelldefels','Mollet del Vallès','Cerdanyola del Vallès','Gavà',
  'Esplugues de Llobregat','Igualada','Figueres','Vic','Tortosa','Sitges',
]

// ── Metric KPI card ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType
}) {
  return (
    <Card className="shadow-none border border-gray-200">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 shrink-0">
            <Icon className="h-4 w-4 text-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Funnel ────────────────────────────────────────────────────────────────────

function CallFunnel({ f }: { f: Funnel }) {
  const llamados = f.total_prospectos - f.pendientes
  const steps = [
    { label: 'Total prospectos',  value: f.total_prospectos, icon: FileText,    sub: `${f.pendientes} sin llamar` },
    { label: 'Llamadas hechas',   value: f.llamadas_hechas,  icon: Phone,        sub: f.total_prospectos > 0 ? `${Math.round((llamados / f.total_prospectos) * 100)}% del total` : '—' },
    { label: 'Llamar más tarde',  value: f.llamar_tarde,     icon: Clock,        sub: 'Callback pendiente' },
    { label: 'Sin respuesta',     value: f.sin_respuesta,    icon: PhoneMissed,  sub: llamados > 0 ? `${Math.round((f.sin_respuesta / Math.max(llamados, 1)) * 100)}% de llamados` : '—' },
    { label: 'Interesados',       value: f.interesados,      icon: ThumbsUp,     sub: llamados > 0 ? `${Math.round((f.interesados / Math.max(llamados, 1)) * 100)}% de llamados` : '—' },
    { label: 'Reunión agendada',  value: f.reunion_agendada, icon: CalendarPlus, sub: f.interesados > 0 ? `${Math.round((f.reunion_agendada / Math.max(f.interesados, 1)) * 100)}% de interesados` : '—' },
    { label: 'No interesado',     value: f.no_interesado,    icon: ThumbsDown,   sub: llamados > 0 ? `${Math.round((f.no_interesado / Math.max(llamados, 1)) * 100)}% de llamados` : '—' },
  ]
  const max = Math.max(...steps.map(s => s.value), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">Embudo de llamadas</p>
        <span className="text-xs text-gray-400">{f.llamadas_hechas} llamadas totales</span>
      </div>
      <div className="p-4 space-y-3">
        {steps.map((s, i) => {
          const Icon = s.icon
          const w = Math.max(3, (s.value / max) * 100)
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 shrink-0">
                <Icon className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-700">{s.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{s.sub}</span>
                    <span className="text-sm font-bold text-gray-900 w-6 text-right">{s.value}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-800 rounded-full transition-all duration-500" style={{ width: `${w}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {f.llamadas_hechas > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">Conversión llamada → reunión</span>
          <span className="text-sm font-bold text-gray-900">{Math.round((f.reunion_agendada / f.llamadas_hechas) * 100)}%</span>
        </div>
      )}
    </div>
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
    setSaving(false); onCreated(); onClose()
  }

  const fields: [keyof typeof form, string, string][] = [
    ['nombre', 'Nombre *', 'text'], ['empresa', 'Empresa', 'text'],
    ['telefono', 'Teléfono', 'tel'], ['email', 'Email', 'email'],
    ['zona', 'Zona / Ciudad', 'text'], ['sector', 'Sector', 'text'], ['cargo', 'Cargo', 'text'],
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Nuevo prospecto</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          {fields.map(([k, label, type]) => (
            <div key={k} className={k === 'nombre' || k === 'empresa' ? 'col-span-2' : ''}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input type={type} value={form[k]} onChange={e => set(k, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-gray-900 text-white hover:bg-gray-800" onClick={submit} disabled={saving || !form.nombre.trim()}>
            {saving ? 'Guardando...' : 'Crear prospecto'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Google Maps Search ────────────────────────────────────────────────────────

interface PlaceResult {
  placeId: string; nombre: string; empresa: string; telefono: string
  web: string; zona: string; sector: string; direccion: string
  rating: number | null; reviews: number | null
}

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
  const [requestCount, setRequestCount] = useState(0)

  const ciudadFinal = ciudad === '__custom__' ? ciudadCustom : ciudad
  const costEur = requestCount * COST_PER_REQUEST * USD_TO_EUR
  const limitReached = requestCount >= MAX_REQUESTS
  const nearLimit = requestCount >= MAX_REQUESTS * 0.8

  const search = async (reset = true) => {
    if (!query.trim() || !ciudadFinal.trim() || limitReached) return
    setSearching(true); setError('')
    if (reset) { setResults([]); setSelected(new Set()) }
    const res = await fetch('/api/coldcall/search-places', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ciudad: ciudadFinal, pageToken: reset ? undefined : nextPage }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error || 'Error'); setSearching(false); return }
    setResults(prev => reset ? d.results : [...prev, ...d.results])
    setNextPage(d.nextPageToken || null)
    setRequestCount(c => c + 1)
    setSearching(false)
  }

  const toggleAll = () => setSelected(selected.size === results.length ? new Set() : new Set(results.map(r => r.placeId)))
  const toggle = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const importSelected = async () => {
    const toImport = results.filter(r => selected.has(r.placeId))
    if (!toImport.length) return
    setImporting(true)
    const res = await fetch('/api/coldcall/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects: toImport.map(r => ({ nombre: r.nombre, empresa: r.empresa, telefono: r.telefono, web: r.web, zona: r.zona, sector: r.sector })) }),
    })
    const d = await res.json()
    setImportedCount(d.imported || 0); setImporting(false); setSelected(new Set()); onImported()
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-500" />
          <p className="text-sm font-semibold text-gray-800">Buscar prospectos en Google Maps</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${
          limitReached ? 'bg-red-50 border-red-200 text-red-600' :
          nearLimit    ? 'bg-yellow-50 border-yellow-200 text-yellow-600' :
                         'bg-gray-100 border-gray-200 text-gray-500'
        }`}>
          {limitReached ? 'Límite alcanzado' : `${costEur.toFixed(3)}€ / ${MAX_COST_EUR}€`}
        </span>
      </div>

      {/* Cost bar */}
      {requestCount > 0 && (
        <div className="h-1 bg-gray-100">
          <div className={`h-full transition-all ${limitReached ? 'bg-red-500' : nearLimit ? 'bg-yellow-400' : 'bg-gray-800'}`}
            style={{ width: `${Math.min(100, (requestCount / MAX_REQUESTS) * 100)}%` }} />
        </div>
      )}

      {/* Search form */}
      <div className="p-4 flex flex-wrap gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="abogados, notarios, consultoras..."
          className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          onKeyDown={e => e.key === 'Enter' && search()} />
        <select value={ciudad} onChange={e => setCiudad(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
          {CIUDADES_CATALUNA.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__custom__">Otra ciudad...</option>
        </select>
        {ciudad === '__custom__' && (
          <input value={ciudadCustom} onChange={e => setCiudadCustom(e.target.value)} placeholder="Ciudad"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-gray-300" />
        )}
        <Button className="bg-gray-900 hover:bg-gray-800 text-white" onClick={() => search(true)} disabled={searching || limitReached}>
          {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1.5">{searching ? 'Buscando...' : 'Buscar'}</span>
        </Button>
      </div>

      {error && <p className="px-4 pb-3 text-red-500 text-xs">{error}</p>}

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected.size === results.length} onChange={toggleAll} className="rounded" />
              <span className="text-xs text-gray-600 font-medium">{results.length} resultados · {selected.size} seleccionados</span>
            </div>
            <div className="flex items-center gap-2">
              {nextPage && (
                <Button variant="outline" size="sm" onClick={() => search(false)} disabled={searching || limitReached}>
                  Cargar más
                </Button>
              )}
              {selected.size > 0 && (
                <Button size="sm" className="bg-gray-900 text-white hover:bg-gray-800" onClick={importSelected} disabled={importing}>
                  {importing ? 'Importando...' : `Importar ${selected.size}`}
                </Button>
              )}
            </div>
          </div>
          {importedCount > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-sm text-gray-700 font-medium flex items-center gap-2">
              <Check className="h-4 w-4" /> {importedCount} prospectos importados
            </div>
          )}
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {results.map(r => (
              <label key={r.placeId} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(r.placeId)} onChange={() => toggle(r.placeId)} className="mt-1 rounded shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.nombre}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{r.direccion}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {r.telefono && <span className="text-xs text-gray-600 flex items-center gap-1"><Phone className="h-3 w-3" />{r.telefono}</span>}
                        {r.web && <span className="text-xs text-gray-400 flex items-center gap-1 truncate max-w-36"><Globe className="h-3 w-3 shrink-0" />{r.web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>}
                      </div>
                    </div>
                    {r.rating && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">{r.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Call Panel ────────────────────────────────────────────────────────────────

function CallPanel({ prospect, onClose, onUpdate }: {
  prospect: Prospect; onClose: () => void; onUpdate: (p: Prospect) => void
}) {
  const [resultado, setResultado] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [duracion, setDuracion] = useState('')
  const [reunionFecha, setReunionFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [guionOpen, setGuionOpen] = useState(false)
  const [guionMode, setGuionMode] = useState<'es' | 'ca'>('es')
  const [objecionesOpen, setObjecionesOpen] = useState(false)
  const [msgCopiado, setMsgCopiado] = useState(false)
  const [editNotas, setEditNotas] = useState(false)
  const [notasProspecto, setNotasProspecto] = useState(prospect.notas || '')
  const [convertingLead, setConvertingLead] = useState(false)
  const [leadCreado, setLeadCreado] = useState<{ lead_id: number; existing: boolean } | null>(null)

  const mensaje = resultado ? getMensaje(resultado, prospect) : null
  const showConvertToLead = saved && (resultado === 'interesado' || resultado === 'reunion_agendada')

  const llamar = () => { if (prospect.telefono) window.location.href = `tel:${prospect.telefono}` }

  const copiar = (text: string) => {
    navigator.clipboard.writeText(text)
    setMsgCopiado(true)
    setTimeout(() => setMsgCopiado(false), 2000)
  }

  const registrar = async () => {
    if (!resultado) return
    setSaving(true)
    await fetch('/api/coldcall/calls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: prospect.id, resultado, notas,
        duracion: duracion ? parseInt(duracion) * 60 : null,
        reunion_fecha: reunionFecha || null,
      }),
    })
    setSaving(false); setSaved(true)
    const pRes = await fetch(`/api/coldcall/prospects/${prospect.id}`)
    if (pRes.ok) onUpdate(await pRes.json())
  }

  const convertirALead = async () => {
    setConvertingLead(true)
    const res = await fetch('/api/coldcall/convert-to-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect_id: prospect.id }),
    })
    const d = await res.json()
    setLeadCreado(d)
    setConvertingLead(false)
  }

  const guardarNotas = async () => {
    await fetch(`/api/coldcall/prospects/${prospect.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notasProspecto }),
    })
    setEditNotas(false)
    onUpdate({ ...prospect, notas: notasProspecto })
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 z-10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-base text-gray-900 truncate">{prospect.nombre}</h2>
                <EstadoBadge estado={prospect.estado} />
              </div>
              {prospect.empresa && <p className="text-sm text-gray-500 truncate">{prospect.empresa}</p>}
              {prospect.cargo && <p className="text-xs text-gray-400">{prospect.cargo}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {prospect.telefono && (
              <button onClick={llamar}
                className="flex items-center gap-1.5 border border-gray-200 bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                <Phone className="h-3.5 w-3.5" />{prospect.telefono}
              </button>
            )}
            {prospect.email && (
              <span className="flex items-center gap-1.5 border border-gray-200 bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-sm">
                <Mail className="h-3.5 w-3.5" />{prospect.email}
              </span>
            )}
            {prospect.zona && (
              <span className="flex items-center gap-1.5 border border-gray-200 bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-sm">
                <MapPin className="h-3.5 w-3.5" />{prospect.zona}
              </span>
            )}
            {prospect.web && (
              <a href={prospect.web.startsWith('http') ? prospect.web : `https://${prospect.web}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 border border-gray-200 bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-100">
                <ExternalLink className="h-3.5 w-3.5" />Web
              </a>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 space-y-3">

          {/* Guión */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => setGuionOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700">
              <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-gray-500" />Guión de ventas</span>
              {guionOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {guionOpen && (
              <div className="bg-white">
                <div className="flex border-b border-gray-100">
                  {[{ id: 'es', label: 'Castellano' }, { id: 'ca', label: 'Català' }].map(t => (
                    <button key={t.id} onClick={() => setGuionMode(t.id as 'es' | 'ca')}
                      className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${guionMode === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="divide-y divide-gray-100">
                  {(guionMode === 'es' ? GUION_ES : GUION_CA).map((g, i) => (
                    <div key={i} className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-5">{g.step}</span>
                        <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">{g.titulo}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-line">{g.texto}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{g.tip}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200">
                  <button onClick={() => setObjecionesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                    <span className="flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5" />Objeciones frecuentes</span>
                    {objecionesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {objecionesOpen && (
                    <div className="divide-y divide-gray-100">
                      {(guionMode === 'es' ? OBJECIONES_ES : OBJECIONES_CA).map((o, i) => (
                        <div key={i} className="px-4 py-3 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-700">{o.obj}</p>
                          <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 border border-gray-100 whitespace-pre-line">{o.resp}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Registrar llamada */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <PhoneCall className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-700">Registrar llamada</p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Resultado</p>
                <div className="grid grid-cols-2 gap-2">
                  {RESULTADOS.map(r => {
                    const Icon = r.icon
                    const isActive = resultado === r.id
                    return (
                      <button key={r.id} onClick={() => setResultado(r.id === resultado ? null : r.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                          isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {r.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Duración (min)</label>
                  <input type="number" min="0" placeholder="0" value={duracion} onChange={e => setDuracion(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                {(resultado === 'reunion_agendada' || resultado === 'llamar_tarde') && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      {resultado === 'llamar_tarde' ? 'Llamar el / a las' : 'Fecha reunión'}
                    </label>
                    <input type="datetime-local" value={reunionFecha} onChange={e => setReunionFecha(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notas de la llamada</label>
                <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Qué comentó, objeciones, próximos pasos..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
              </div>

              {/* Mensaje post-llamada */}
              {mensaje && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      {mensaje.tipo === 'whatsapp' ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                      {mensaje.tipo === 'whatsapp' ? 'WhatsApp sugerido' : 'Email sugerido'}
                    </p>
                    <button onClick={() => copiar(mensaje.tipo === 'email' ? `Asunto: ${mensaje.asunto}\n\n${mensaje.texto}` : mensaje.texto)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium border transition-colors ${msgCopiado ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                      {msgCopiado ? <><Check className="h-3 w-3" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
                    </button>
                  </div>
                  {mensaje.asunto && <p className="text-xs text-gray-500">Asunto: {mensaje.asunto}</p>}
                  <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{mensaje.texto}</p>
                </div>
              )}

              <button onClick={registrar} disabled={!resultado || saving || saved}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  saved ? 'bg-gray-900 text-white' : resultado ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}>
                {saved ? 'Llamada registrada' : saving ? 'Guardando...' : 'Guardar llamada'}
              </button>

              {/* Convertir a lead del CRM */}
              {showConvertToLead && !leadCreado && (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                  <div className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Pasar al pipeline de ventas</p>
                      <p className="text-xs text-gray-500 mt-0.5">Este prospecto ha mostrado interés. Créalo como lead en el CRM para que el equipo comercial lo gestione.</p>
                    </div>
                  </div>
                  <button onClick={convertirALead} disabled={convertingLead}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-gray-900 rounded-lg text-sm font-semibold text-gray-900 hover:bg-gray-900 hover:text-white transition-colors">
                    <UserPlus className="h-4 w-4" />
                    {convertingLead ? 'Creando lead...' : 'Crear lead en el CRM'}
                  </button>
                </div>
              )}

              {leadCreado && (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-gray-700" />
                    <p className="text-xs font-semibold text-gray-700">{leadCreado.existing ? 'Lead ya existía en el CRM' : 'Lead creado en el CRM'}</p>
                  </div>
                  <Link href={`/leads/${leadCreado.lead_id}`} className="text-xs font-semibold text-gray-900 underline underline-offset-2">
                    Ver lead
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Notas del prospecto */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><FileText className="h-4 w-4 text-gray-500" />Notas</p>
              <button onClick={() => setEditNotas(o => !o)} className="text-gray-400 hover:text-gray-600"><Edit3 className="h-4 w-4" /></button>
            </div>
            <div className="p-3">
              {editNotas ? (
                <div className="space-y-2">
                  <textarea rows={3} value={notasProspecto} onChange={e => setNotasProspecto(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditNotas(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-gray-900 text-white" onClick={guardarNotas}>Guardar</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">{notasProspecto || <span className="text-gray-400 text-xs italic">Sin notas</span>}</p>
              )}
            </div>
          </div>

          {/* Historial */}
          {prospect.calls.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />Historial ({prospect.calls.length})
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {prospect.calls.map(c => {
                  const r = RESULTADOS.find(x => x.id === c.resultado)
                  const Icon = r?.icon || Phone
                  return (
                    <div key={c.id} className="p-3 flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 shrink-0 mt-0.5">
                        <Icon className="h-3.5 w-3.5 text-gray-600" />
                      </div>
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

// ── Main Component ─────────────────────────────────────────────────────────────

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
  const [q, setQ] = useState('')
  const [zona, setZona] = useState('')
  const [sector, setSector] = useState('')
  const [estado, setEstado] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const LIMIT = 40

  const loadData = useCallback(async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
    if (q) params.set('q', q)
    if (zona) params.set('zona', zona)
    if (sector) params.set('sector', sector)
    if (estado) params.set('estado', estado)
    const [pRes, mRes] = await Promise.all([
      fetch(`/api/coldcall/prospects?${params}`),
      fetch('/api/coldcall/metrics'),
    ])
    if (pRes.ok) { const d = await pRes.json(); setProspects(d.prospects); setTotal(d.total) }
    if (mRes.ok) setMetrics(await mRes.json())
    setLoading(false)
  }, [q, zona, sector, estado])

  useEffect(() => { loadData(1); setPage(1) }, [q, zona, sector, estado, loadData])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportMsg('')
    const parsed = parseCSV(await file.text())
    if (!parsed.length) { setImportMsg('No se encontraron filas válidas'); setImporting(false); return }
    const res = await fetch('/api/coldcall/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prospects: parsed }) })
    const d = await res.json()
    setImportMsg(`${d.imported} prospectos importados`)
    setImporting(false); loadData(1)
    if (fileRef.current) fileRef.current.value = ''
  }

  const updateProspect = (updated: Prospect) => {
    setProspects(ps => ps.map(p => p.id === updated.id ? updated : p))
    if (selected?.id === updated.id) setSelected(updated)
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-5">

      {/* KPIs + Funnel */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 grid grid-cols-2 gap-3 content-start">
            <KpiCard label="Llamadas hoy"    value={metrics.hoy.llamadas}             icon={Phone} />
            <KpiCard label="Interesados hoy" value={metrics.hoy.interesados}           icon={ThumbsUp} />
            <KpiCard label="Reuniones hoy"   value={metrics.hoy.reuniones}             icon={CalendarPlus} />
            <KpiCard label="Conversión"      value={`${metrics.hoy.tasaConversion}%`}  icon={Target}
              sub={`${metrics.totales.prospectos} prospectos`} />
          </div>
          <div className="lg:col-span-2">
            <CallFunnel f={metrics.funnel} />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, empresa, teléfono..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
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
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => loadData(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1.5" />{importing ? 'Importando...' : 'CSV'}
          </Button>
          <Button size="sm" className="bg-gray-900 text-white hover:bg-gray-800" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Nuevo
          </Button>
        </div>
      </div>

      {importMsg && (
        <div className="flex items-center gap-2 border border-gray-200 bg-gray-50 text-gray-700 text-sm rounded-lg px-4 py-2">
          <Check className="h-4 w-4" />{importMsg}
        </div>
      )}

      {/* Google Maps Search */}
      <GoogleMapsSearch onImported={() => loadData(1)} />

      {/* Empty state */}
      {prospects.length === 0 && !loading && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
              <Phone className="h-6 w-6 text-gray-400" />
            </div>
          </div>
          <h3 className="font-semibold text-gray-600">Sin prospectos</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Usa el buscador de Google Maps para importar prospectos, o añade uno manualmente.
          </p>
        </div>
      )}

      {/* Table */}
      {prospects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prospecto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Zona</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Última llamada</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Llamadas</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prospects.map(p => {
                const lastCall = p.calls[0]
                const lastResultado = RESULTADOS.find(r => r.id === lastCall?.resultado)
                const LastIcon = lastResultado?.icon
                return (
                  <tr key={p.id} onClick={() => setSelected(p)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 ${selected?.id === p.id ? 'bg-gray-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.nombre}</div>
                      {p.empresa && <div className="text-xs text-gray-500">{p.empresa}</div>}
                      {p.telefono && <div className="text-xs text-gray-400">{p.telefono}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-gray-600">{p.zona || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <EstadoBadge estado={p.estado} />
                        {p.estado === 'llamar_tarde' && lastCall?.reunion_fecha && (
                          <div className="flex items-center gap-1 text-xs font-medium text-gray-900">
                            <Clock className="h-3 w-3" />
                            {new Date(lastCall.reunion_fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {lastCall && LastIcon ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <LastIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span>{lastResultado?.label}</span>
                          <span className="text-gray-300">·</span>
                          <span>{fmtDate(lastCall.fecha)}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">Sin llamadas</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-center">
                      <span className="text-sm font-medium text-gray-600">{p.calls.length}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">{total} prospectos en total</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); loadData(page - 1) }}>←</Button>
                <span className="text-xs text-gray-500 px-2">{page} / {pages}</span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => { setPage(p => p + 1); loadData(page + 1) }}>→</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && <CallPanel prospect={selected} onClose={() => setSelected(null)} onUpdate={updateProspect} />}
      {showNew && <NewProspectModal onClose={() => setShowNew(false)} onCreated={() => loadData(1)} />}
    </div>
  )
}

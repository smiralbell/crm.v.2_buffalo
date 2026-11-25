import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import OnboardingSectionTabs from '@/components/onboarding/OnboardingSectionTabs'
import { Search } from 'lucide-react'

type Persona = {
  id: number
  nombre: string | null
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: string | null
  contexto: string | null
  updated_at: string
}

const ESTADO_LABEL: Record<string, string> = {
  frio: 'Frío',
  caliente: 'Caliente',
  reunion: 'Reunión',
  propuesta: 'Propuesta',
  negociando: 'Negociando',
  cerrado: 'Cerrado',
  activo: 'Activo',
  perdido: 'Perdido',
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Tabla de personas. Cada fila lleva a su ficha individual. */
export default function OnboardingPersonasPage() {
  const router = useRouter()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  // Búsqueda con pausa para no lanzar una petición por tecla.
  useEffect(() => {
    setLoading(true)
    const t = window.setTimeout(() => {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
      fetch(`/api/onboarding/personas${params}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(await readError(res, 'No se pudieron cargar las personas'))
          return res.json() as Promise<{ personas: Persona[] }>
        })
        .then((d) => {
          setPersonas(d.personas)
          setError('')
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(t)
  }, [q])

  return (
    <Layout>
      <div className="w-full space-y-4 -mt-2 lg:-mt-3">
        <OnboardingSectionTabs active="personas" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, empresa, email o teléfono…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          <p className="text-xs text-gray-400">{loading ? 'Cargando…' : `${personas.length} personas`}</p>
        </div>

        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Contexto</th>
                <th className="px-4 py-3">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {!loading && personas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No hay personas con ese filtro.
                  </td>
                </tr>
              )}
              {personas.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/onboarding/personas/${p.id}`)}
                  className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nombre || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.empresa || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.telefono || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.estado ? ESTADO_LABEL[p.estado] || p.estado : '—'}</td>
                  <td className="px-4 py-3">
                    {p.contexto?.trim() ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Sí
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(p.updated_at).toLocaleDateString('es-ES')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}

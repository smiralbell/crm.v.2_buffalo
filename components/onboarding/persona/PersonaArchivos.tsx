import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText, Link2, Loader2, Search, Unlink, Upload } from 'lucide-react'

type Documento = { id: number; tipo: string; file_name: string; web_link: string | null; created_at: string }
type Factura = {
  id: number
  invoice_number: string
  client_name: string
  issue_date: string
  total: number
  status: string
  pdf_drive_url: string | null
}
type Carpeta = { folder_id: string; folder_name: string; folder_url: string; matched_by: string } | null

type Archivos = {
  drive_configured: boolean
  carpeta: Carpeta
  documentos: Documento[]
  facturas: Factura[]
}

const TIPO_LABEL: Record<string, string> = { documento: 'Documento', propuesta: 'Propuesta' }
const fmtEur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Documentos y propuestas a Drive, y facturas vinculadas a la persona. */
export default function PersonaArchivos({ leadId, hasContact }: { leadId: number; hasContact: boolean }) {
  const [data, setData] = useState<Archivos | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [buscar, setBuscar] = useState('')
  const [resultados, setResultados] = useState<Factura[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [tipoSubida, setTipoSubida] = useState<'documento' | 'propuesta'>('documento')

  const load = () => {
    setLoading(true)
    fetch(`/api/onboarding/personas/${leadId}/archivos`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r, 'No se pudieron cargar los archivos'))
        return r.json() as Promise<Archivos>
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setBuscar('')
    setResultados([])
    setError('')
    setNotice('')
    load()
  }, [leadId])

  useEffect(() => {
    if (buscar.trim().length < 2) {
      setResultados([])
      return
    }
    const t = window.setTimeout(() => {
      fetch(`/api/onboarding/personas/${leadId}/facturas?buscar=${encodeURIComponent(buscar.trim())}`)
        .then(async (r) => (r.ok ? ((await r.json()) as { facturas: Factura[] }) : { facturas: [] }))
        .then((d) => setResultados(d.facturas))
        .catch(() => setResultados([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [buscar, leadId])

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy('subida')
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('file', f))
      const res = await fetch(`/api/onboarding/personas/${leadId}/documentos?tipo=${tipoSubida}`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo subir el archivo'))
      setNotice(`${files.length === 1 ? 'Archivo subido' : 'Archivos subidos'} a Drive`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const link = async (factura: Factura) => {
    setBusy(`link-${factura.id}`)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/onboarding/personas/${leadId}/facturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: factura.id }),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo vincular la factura'))
      const d = (await res.json()) as { warning: string | null }
      if (d.warning) setError(d.warning)
      else setNotice(`Factura ${factura.invoice_number} vinculada`)
      setBuscar('')
      setResultados([])
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular la factura')
    } finally {
      setBusy(null)
    }
  }

  const unlink = async (factura: Factura) => {
    if (!window.confirm(`¿Quitar la factura ${factura.invoice_number} de esta persona?`)) return
    setBusy(`unlink-${factura.id}`)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/personas/${leadId}/facturas?invoice_id=${factura.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo quitar la factura'))
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la factura')
    } finally {
      setBusy(null)
    }
  }

  const vinculadas = new Set((data?.facturas || []).map((f) => f.id))

  return (
    <div className="space-y-4">
      {/* Documentos */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Documentos y propuestas</h3>
          {data?.carpeta && (
            <a
              href={data.carpeta.folder_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              Carpeta en Drive <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {!hasContact ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Esta persona no tiene contacto. Añádelo antes de subir archivos.
          </p>
        ) : data && !data.drive_configured ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Drive no está configurado: falta GOOGLE_DRIVE_CLIENTES_FOLDER_ID.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tipoSubida}
            onChange={(e) => setTipoSubida(e.target.value as 'documento' | 'propuesta')}
            className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white"
          >
            <option value="documento">Documento</option>
            <option value="propuesta">Propuesta</option>
          </select>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!hasContact || busy === 'subida' || (data ? !data.drive_configured : false)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {busy === 'subida' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Subir a Drive
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
        </div>

        {loading && !data ? (
          <p className="text-xs text-gray-400">Cargando…</p>
        ) : (data?.documentos.length || 0) === 0 ? (
          <p className="text-xs text-gray-400">Todavía no hay documentos subidos.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data?.documentos.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{d.file_name}</p>
                    <p className="text-xs text-gray-500">
                      {TIPO_LABEL[d.tipo] || d.tipo} · {new Date(d.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
                {d.web_link && (
                  <a href={d.web_link} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-600 hover:text-gray-900 shrink-0">
                    Abrir
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Facturas */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Facturas</h3>

        {(data?.facturas.length || 0) === 0 ? (
          <p className="text-xs text-gray-400">No hay facturas vinculadas.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data?.facturas.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">
                    {f.invoice_number} · {fmtEur(f.total)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(f.issue_date).toLocaleDateString('es-ES')} · {f.status}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {f.pdf_drive_url && (
                    <a href={f.pdf_drive_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-600 hover:text-gray-900">
                      PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => unlink(f)}
                    disabled={busy === `unlink-${f.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <Unlink className="h-3.5 w-3.5" /> Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="pt-2 border-t border-gray-100 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              disabled={!hasContact}
              placeholder="Vincular factura: busca por número o cliente…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400 disabled:bg-gray-50"
            />
          </div>
          {resultados.length > 0 && (
            <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {resultados.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      {f.invoice_number} · {f.client_name}
                    </p>
                    <p className="text-xs text-gray-500">{fmtEur(f.total)} · {f.status}</p>
                  </div>
                  {vinculadas.has(f.id) ? (
                    <span className="text-xs text-gray-400 shrink-0">Ya vinculada</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => link(f)}
                      disabled={busy === `link-${f.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-900 hover:text-gray-600 shrink-0 disabled:opacity-50"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Vincular
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText, FolderOpen, Link2, Loader2, Receipt, Search, Unlink, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
type Archivos = {
  drive_configured: boolean
  carpeta: { folder_url: string; folder_name: string } | null
  documentos: Documento[]
  facturas: Factura[]
  can_see_invoices: boolean
}

const TIPO_LABEL: Record<string, string> = { documento: 'Documento', propuesta: 'Propuesta' }
const STATUS_LABEL: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', cancelled: 'Anulada' }
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const fecha = (s: string) => new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Documentos en Google Drive y facturas vinculadas de un lead. */
export default function LeadArchivos({ leadId }: { leadId: number }) {
  const [data, setData] = useState<Archivos | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tipo, setTipo] = useState<'documento' | 'propuesta'>('documento')
  const [buscar, setBuscar] = useState('')
  const [resultados, setResultados] = useState<Factura[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/leads/${leadId}/archivos`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r, 'No se pudieron cargar los archivos'))
        return r.json() as Promise<Archivos>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (buscar.trim().length < 2) {
      setResultados([])
      return
    }
    const t = window.setTimeout(() => {
      fetch(`/api/leads/${leadId}/facturas?buscar=${encodeURIComponent(buscar.trim())}`)
        .then(async (r) => (r.ok ? ((await r.json()) as { facturas: Factura[] }) : { facturas: [] }))
        .then((d) => setResultados(d.facturas))
        .catch(() => setResultados([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [buscar, leadId])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy('subida')
    setError('')
    try {
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('file', f))
      const res = await fetch(`/api/leads/${leadId}/documentos?tipo=${tipo}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo subir el archivo'))
      flash(files.length === 1 ? 'Subido a Drive' : `${files.length} archivos subidos a Drive`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const link = async (f: Factura) => {
    setBusy(`link-${f.id}`)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/facturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: f.id }),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo vincular la factura'))
      const d = (await res.json()) as { warning: string | null }
      if (d.warning) setError(d.warning)
      else flash(`Factura ${f.invoice_number} vinculada`)
      setBuscar('')
      setResultados([])
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular la factura')
    } finally {
      setBusy(null)
    }
  }

  const unlink = async (f: Factura) => {
    if (!window.confirm(`¿Quitar la factura ${f.invoice_number} de este lead?`)) return
    setBusy(`unlink-${f.id}`)
    try {
      const res = await fetch(`/api/leads/${leadId}/facturas?invoice_id=${f.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo quitar la factura'))
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la factura')
    } finally {
      setBusy(null)
    }
  }

  const vinculadas = new Set((data?.facturas || []).map((f) => f.id))
  const driveOff = data ? !data.drive_configured : false

  return (
    <>
      {/* Documentos en Drive */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <FolderOpen className="h-4 w-4" />
              Documentos
            </CardTitle>
            {data?.carpeta && (
              <a
                href={data.carpeta.folder_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                Abrir en Drive <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {driveOff && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Drive no está configurado: falta GOOGLE_DRIVE_CLIENTES_FOLDER_ID.
            </p>
          )}
          <div className="flex gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'documento' | 'propuesta')}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm"
            >
              <option value="documento">Documento</option>
              <option value="propuesta">Propuesta</option>
            </select>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy === 'subida' || driveOff}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {busy === 'subida' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Subir a Drive
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
          </div>
          {!data ? (
            <p className="text-xs text-gray-400">Cargando…</p>
          ) : data.documentos.length === 0 ? (
            <p className="text-xs text-gray-400">Sin documentos. Se guardan en la carpeta del cliente en Drive.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.documentos.map((d) => (
                <li key={d.id} className="flex items-center gap-2 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-900">{d.file_name}</p>
                    <p className="text-[11px] text-gray-500">
                      {TIPO_LABEL[d.tipo] || d.tipo} · {fecha(d.created_at)}
                    </p>
                  </div>
                  {d.web_link && (
                    <a href={d.web_link} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
                      Abrir
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Facturas */}
      {data?.can_see_invoices !== false && (
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Receipt className="h-4 w-4" />
              Facturas
              {data && data.facturas.length > 0 && (
                <span className="ml-auto text-xs font-normal text-gray-500">
                  {eur(data.facturas.reduce((s, f) => s + (f.status === 'cancelled' ? 0 : f.total), 0))}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data ? null : data.facturas.length === 0 ? (
              <p className="text-xs text-gray-400">Sin facturas vinculadas.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.facturas.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-900">
                        {f.invoice_number} · <span className="font-medium">{eur(f.total)}</span>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {fecha(f.issue_date)} · {STATUS_LABEL[f.status] || f.status}
                      </p>
                    </div>
                    {f.pdf_drive_url && (
                      <a href={f.pdf_drive_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
                        PDF
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => unlink(f)}
                      disabled={busy === `unlink-${f.id}`}
                      className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      aria-label="Quitar factura"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Vincular factura: número o cliente…"
                className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-sm focus:border-gray-400 focus:outline-none"
              />
            </div>
            {resultados.length > 0 && (
              <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {resultados.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-900">
                        {f.invoice_number} · {f.client_name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {eur(f.total)} · {STATUS_LABEL[f.status] || f.status}
                      </p>
                    </div>
                    {vinculadas.has(f.id) ? (
                      <span className="shrink-0 text-[11px] text-gray-400">Vinculada</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => link(f)}
                        disabled={busy === `link-${f.id}`}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-900 hover:text-gray-600 disabled:opacity-50"
                      >
                        <Link2 className="h-3.5 w-3.5" /> Vincular
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}
    </>
  )
}

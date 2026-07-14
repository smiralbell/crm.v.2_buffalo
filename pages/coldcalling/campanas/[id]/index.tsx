import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import { campanasListHref } from '@/lib/coldcall/routes'
import { getColdCallPageProps } from '@/lib/coldcall/page-auth'
import { Button } from '@/components/ui/button'

import { Input } from '@/components/ui/input'

import { Badge } from '@/components/ui/badge'

import { displayValue, stageLabel, type CampaignLeadRow } from '@/lib/coldcall/lead-table'
import { resolveLeadWeb, telHref } from '@/lib/coldcall/lead-links'
import { saveLastCampaignId } from '@/lib/coldcall/last-campaign'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'

import type { ColdCallCampaign, ImportBatchResult } from '@/lib/coldcall/types'

import CsvImportMappingDialog from '@/components/coldcall/CsvImportMappingDialog'
import CampaignScriptEditor from '@/components/coldcall/CampaignScriptEditor'
import RequestProspectsButton from '@/components/coldcall/RequestProspectsButton'

import { ColumnMappingEditor } from '@/components/coldcall/ColumnMappingEditor'
import {
  type ColumnMapping,
  normalizeStoredMapping,
  validateMapping,
} from '@/lib/coldcall/field-mapping'

import {

  ArrowLeft,

  ChevronLeft,

  ChevronRight,

  Loader2,

  Phone,

  Search,

  Settings2,

  Upload,

  BookOpen,

  Globe,

  ExternalLink,

  Copy,

} from 'lucide-react'



export const getServerSideProps: GetServerSideProps = getColdCallPageProps



const PAGE_SIZE = 50



export default function CampanaDetailPage() {

  const router = useRouter()
  const { user } = useAuth()
  const campanasHref = campanasListHref(user?.role)

  const campaignId = router.query.id as string | undefined

  const fileRef = useRef<HTMLInputElement>(null)



  const [campaign, setCampaign] = useState<ColdCallCampaign | null>(null)

  const [leads, setLeads] = useState<CampaignLeadRow[]>([])

  const [importColumns, setImportColumns] = useState<string[]>([])

  const [total, setTotal] = useState(0)

  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')

  const [searchInput, setSearchInput] = useState('')

  const [loading, setLoading] = useState(true)



  const [mapping, setMapping] = useState<ColumnMapping>({})

  const [savingMapping, setSavingMapping] = useState(false)

  const [showMapping, setShowMapping] = useState(false)



  const [importFile, setImportFile] = useState<File | null>(null)

  const [csvDialogOpen, setCsvDialogOpen] = useState(false)

  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null)

  const [scriptOpen, setScriptOpen] = useState(false)



  const load = useCallback(() => {

    if (!campaignId) return

    setLoading(true)

    const params = new URLSearchParams({

      page: String(page),

      limit: String(PAGE_SIZE),

    })

    if (search) params.set('q', search)



    fetch(`/api/coldcall/campaigns/${campaignId}/leads?${params}`)

      .then((r) => r.json())

      .then((d) => {

        if (d.error) throw new Error(d.error)

        setCampaign(d.campaign)

        setLeads(d.leads || [])

        setImportColumns(d.import_columns || [])

        setTotal(d.total ?? 0)



        setMapping(normalizeStoredMapping(d.column_mapping || {}))

      })

      .catch(() => {

        setCampaign(null)

        setLeads([])

      })

      .finally(() => setLoading(false))

  }, [campaignId, page, search])



  useEffect(() => {

    load()

  }, [load])



  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))



  const saveMapping = async () => {

    if (!campaignId || !importColumns.length) return

    const err = validateMapping(mapping)

    if (err) {

      alert(err)

      return

    }



    setSavingMapping(true)

    try {

      const res = await fetch(`/api/coldcall/campaigns/${campaignId}/mapping`, {

        method: 'PUT',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ import_columns: importColumns, column_mapping: mapping }),

      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      load()

      setShowMapping(false)

    } catch (e) {

      alert(e instanceof Error ? e.message : 'Error al guardar mapeo')

    } finally {

      setSavingMapping(false)

    }

  }



  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0]

    if (!file) return

    setImportFile(file)

    setCsvDialogOpen(true)

    if (fileRef.current) fileRef.current.value = ''

  }



  return (

    <Layout>

      <div className="space-y-5">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div className="space-y-2">

            <Link

              href={campanasHref}

              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"

            >

              <ArrowLeft className="h-4 w-4" />

              Volver a campañas

            </Link>

            {campaign ? (

              <>

                <div className="flex flex-wrap items-center gap-2">

                  <h1 className="text-xl font-semibold text-gray-900">{campaign.name}</h1>

                  <Badge variant="secondary">

                    {campaign.status === 'active' ? 'Activa' : campaign.status}

                  </Badge>

                </div>

                {campaign.description && (

                  <p className="text-sm text-gray-500 max-w-2xl">{campaign.description}</p>

                )}

                <p className="text-sm text-gray-600">

                  <strong>{total}</strong> leads importados

                </p>

              </>

            ) : !loading ? (

              <p className="text-sm text-red-600">Campaña no encontrada</p>

            ) : null}

          </div>



          {campaign && (

            <div className="flex flex-wrap gap-2">

              <Button

                variant="outline"

                size="sm"

                className="rounded-xl gap-1.5"

                onClick={() => setScriptOpen(true)}

              >

                <BookOpen className="h-3.5 w-3.5" />

                Configurar guión

              </Button>

              <Button

                variant="outline"

                size="sm"

                className="rounded-xl gap-1.5"

                asChild

              >

                <Link href={`/comercial/duplicados?campaign=${campaign.id}`}>

                  <Copy className="h-3.5 w-3.5" />

                  Duplicados

                </Link>

              </Button>

              <Button

                variant="outline"

                size="sm"

                className="rounded-xl gap-1.5"

                onClick={() => setShowMapping((v) => !v)}

                disabled={!importColumns.length}

              >

                <Settings2 className="h-3.5 w-3.5" />

                Relacionar variables

              </Button>

              <Button

                variant="outline"

                size="sm"

                className="rounded-xl gap-1.5"

                onClick={() => fileRef.current?.click()}

              >

                <Upload className="h-3.5 w-3.5" />

                Subir CSV

              </Button>

              {user?.role === 'comercial' && (
                <RequestProspectsButton
                  campaignId={campaign.id}
                  size="sm"
                  className="rounded-xl gap-1.5"
                />
              )}

              <Button size="sm" className="rounded-xl gap-1.5 bg-gray-900 hover:bg-gray-800" asChild>

                <Link
                  href={`/coldcalling/campanas/${campaign.id}/llamadas`}
                  onClick={() => saveLastCampaignId(campaign.id)}
                >

                  <Phone className="h-3.5 w-3.5" />

                  Empiezo llamada

                </Link>

              </Button>

            </div>

          )}

        </div>



        {showMapping && importColumns.length > 0 && (

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">

            <ColumnMappingEditor headers={importColumns} mapping={mapping} onChange={setMapping} />

            <div className="flex gap-2 justify-end">

              <Button variant="outline" onClick={() => setShowMapping(false)}>

                Cancelar

              </Button>

              <Button onClick={saveMapping} disabled={savingMapping}>

                {savingMapping ? 'Guardando...' : 'Guardar relación'}

              </Button>

            </div>

          </div>

        )}



        <form

          className="flex flex-wrap gap-2 max-w-md"

          onSubmit={(e) => {

            e.preventDefault()

            setPage(1)

            setSearch(searchInput.trim())

          }}

        >

          <div className="relative flex-1 min-w-[200px]">

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

            <Input

              value={searchInput}

              onChange={(e) => setSearchInput(e.target.value)}

              placeholder="Buscar en los datos..."

              className="pl-9 rounded-xl"

            />

          </div>

          <Button type="submit" variant="outline" className="rounded-xl">

            Buscar

          </Button>

          {search && (

            <Button

              type="button"

              variant="ghost"

              className="rounded-xl"

              onClick={() => {

                setSearchInput('')

                setSearch('')

                setPage(1)

              }}

            >

              Limpiar

            </Button>

          )}

        </form>



        {importResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Importación: <strong>{importResult.rows_imported}</strong> nuevos
            {importResult.rows_updated > 0 && (
              <> · <strong>{importResult.rows_updated}</strong> actualizados</>
            )}
            {importResult.rows_skipped_duplicate > 0 && (
              <> · {importResult.rows_skipped_duplicate} duplicados</>
            )}
            {(importResult.rows_skipped_other_campaign ?? 0) > 0 && (
              <> · {importResult.rows_skipped_other_campaign} omitidos (ya en otra campaña)</>
            )}
          </div>
        )}



        {loading ? (

          <div className="py-20 flex justify-center">

            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />

          </div>

        ) : total === 0 ? (

          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center">

            <Upload className="h-10 w-10 text-gray-300 mx-auto" />

            <p className="mt-3 text-sm text-gray-500">

              {search

                ? 'No hay leads que coincidan con la búsqueda.'

                : 'Aún no hay leads. Sube un CSV para empezar.'}

            </p>

            {!search && (

              <Button className="mt-4 rounded-xl" onClick={() => fileRef.current?.click()}>

                Subir CSV

              </Button>

            )}

          </div>

        ) : (

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

            <div className="overflow-x-auto">

              <table className="w-full text-base text-left">

                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/90">
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">#</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap min-w-[180px]">Nombre</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Teléfono</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Correo</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Web</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Estado</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap text-center">Llamadas</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap w-28" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map((lead, idx) => {
                    const webUrl = resolveLeadWeb(
                      { raw_data: lead.raw_data },
                      mapping
                    )
                    const tel = telHref(lead.telefono)
                    const phoneLabel = lead.telefono
                      ? formatPhoneForDisplay(lead.telefono) || lead.telefono
                      : null

                    return (
                    <tr
                      key={lead.id}
                      className="hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap text-sm">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-4 py-3.5 text-gray-900 font-semibold">
                        {displayValue(lead.nombre)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {tel && phoneLabel ? (
                          <a
                            href={tel}
                            className="text-gray-900 font-medium hover:text-blue-700 tabular-nums"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {phoneLabel}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-800 max-w-[220px] truncate">
                        {displayValue(lead.email)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {webUrl ? (
                          <a
                            href={webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Globe className="h-4 w-4 shrink-0" />
                            Web
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Badge variant="outline" className="font-normal text-sm">
                          {stageLabel(lead.stage)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-gray-800 whitespace-nowrap text-center tabular-nums">
                        {lead.call_count ?? lead.call_attempts}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Button
                          size="sm"
                          className="rounded-xl h-9 gap-1.5 bg-gray-900 hover:bg-gray-800"
                          onClick={() => {
                            saveLastCampaignId(parseInt(campaignId!, 10))
                            router.push(`/coldcalling/campanas/${campaignId}/llamadas?leadId=${lead.id}`)
                          }}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Llamar
                        </Button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>

              </table>

            </div>



            {totalPages > 1 && (

              <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50/50">

                <p className="text-xs text-gray-500">

                  Página {page} de {totalPages} · {total} leads

                </p>

                <div className="flex gap-1">

                  <Button

                    variant="outline"

                    size="sm"

                    className="rounded-lg h-8"

                    disabled={page <= 1}

                    onClick={() => setPage((p) => p - 1)}

                  >

                    <ChevronLeft className="h-4 w-4" />

                  </Button>

                  <Button

                    variant="outline"

                    size="sm"

                    className="rounded-lg h-8"

                    disabled={page >= totalPages}

                    onClick={() => setPage((p) => p + 1)}

                  >

                    <ChevronRight className="h-4 w-4" />

                  </Button>

                </div>

              </div>

            )}

          </div>

        )}

      </div>



      <input

        ref={fileRef}

        type="file"

        accept=".csv,.txt,.xlsx"

        className="hidden"

        onChange={handleFilePick}

      />



      {campaignId && (

        <CsvImportMappingDialog

          open={csvDialogOpen}

          onOpenChange={(open) => {

            setCsvDialogOpen(open)

            if (!open) setImportFile(null)

          }}

          campaignId={parseInt(campaignId, 10)}

          file={importFile}

          onImported={(result) => {
            if (result) setImportResult(result)
            if (page === 1) load()
            else setPage(1)
          }}

        />

      )}

      {campaignId && (
        <CampaignScriptEditor
          open={scriptOpen}
          onOpenChange={setScriptOpen}
          campaignId={parseInt(campaignId, 10)}
        />
      )}

    </Layout>

  )

}



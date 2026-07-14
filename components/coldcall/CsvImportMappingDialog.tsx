import { useEffect, useState } from 'react'

import {

  Dialog,

  DialogContent,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from '@/components/ui/dialog'

import { Button } from '@/components/ui/button'

import { Loader2 } from 'lucide-react'

import { ColumnMappingEditor } from '@/components/coldcall/ColumnMappingEditor'

import type { ImportBatchResult } from '@/lib/coldcall/types'

import {

  type ColumnMapping,

  guessColumnMapping,

  normalizeStoredMapping,

  validateMapping,

} from '@/lib/coldcall/field-mapping'



interface CsvImportMappingDialogProps {

  open: boolean

  onOpenChange: (open: boolean) => void

  campaignId: number

  file: File | null

  onImported: (result?: ImportBatchResult) => void

}



export default function CsvImportMappingDialog({

  open,

  onOpenChange,

  campaignId,

  file,

  onImported,

}: CsvImportMappingDialogProps) {

  const [loading, setLoading] = useState(false)

  const [importing, setImporting] = useState(false)

  const [headers, setHeaders] = useState<string[]>([])

  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([])

  const [mapping, setMapping] = useState<ColumnMapping>({})

  const [rowsTotal, setRowsTotal] = useState(0)

  const [csvText, setCsvText] = useState('')

  const [otherCampaignDupes, setOtherCampaignDupes] = useState<{
    count: number
    samples: { nombre: string; campaign_name: string; match_type: string }[]
  } | null>(null)

  const [checkingDupes, setCheckingDupes] = useState(false)



  useEffect(() => {

    if (!open || !file) return



    let cancelled = false

    setLoading(true)



    file.text().then(async (text) => {

      if (cancelled) return

      setCsvText(text)

      try {

        const res = await fetch(`/api/coldcall/campaigns/${campaignId}/import/preview`, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ csv_text: text }),

        })

        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Error al leer CSV')



        const hdrs: string[] = data.headers || []
        const suggested =
          data.suggested_mapping && Object.keys(data.suggested_mapping).length
            ? normalizeStoredMapping(data.suggested_mapping)
            : guessColumnMapping(hdrs)
        setHeaders(hdrs)
        setSampleRows(data.sample_rows || [])
        setRowsTotal(data.rows_total || 0)
        setMapping(suggested)

      } catch (e) {

        alert(e instanceof Error ? e.message : 'Error al leer CSV')

        onOpenChange(false)

      } finally {

        if (!cancelled) setLoading(false)

      }

    })



    return () => {

      cancelled = true

    }

  }, [open, file, campaignId, onOpenChange])



  useEffect(() => {

    if (!open || !csvText || loading) return

    const err = validateMapping(mapping)

    if (err) {

      setOtherCampaignDupes(null)

      return

    }



    let cancelled = false

    const timer = setTimeout(async () => {

      setCheckingDupes(true)

      try {

        const res = await fetch(`/api/coldcall/campaigns/${campaignId}/import/preview`, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ csv_text: csvText, column_mapping: mapping }),

        })

        const data = await res.json()

        if (!cancelled && res.ok) {

          setOtherCampaignDupes(data.other_campaign_duplicates ?? null)

        }

      } catch {

        if (!cancelled) setOtherCampaignDupes(null)

      } finally {

        if (!cancelled) setCheckingDupes(false)

      }

    }, 400)



    return () => {

      cancelled = true

      clearTimeout(timer)

    }

  }, [open, csvText, loading, mapping, campaignId])



  const handleImport = async () => {

    const err = validateMapping(mapping)

    if (err) {

      alert(err)

      return

    }



    setImporting(true)

    try {

      const res = await fetch(`/api/coldcall/campaigns/${campaignId}/import`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          csv_text: csvText,

          file_name: file?.name,

          import_columns: headers,

          column_mapping: mapping,

        }),

      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Error al importar')

      if (data.rows_imported === 0 && !data.rows_updated) {
        const parts = [
          `${data.rows_skipped_other_campaign || 0} ya en otra campaña`,
          `${data.rows_skipped_dnc || 0} omitidos (Do Not Call)`,
        ]
        alert(`No se importó ningún lead.\n${parts.join(' · ')}`)
      }

      onImported(data)

      onOpenChange(false)

    } catch (e) {

      alert(e instanceof Error ? e.message : 'Error al importar')

    } finally {

      setImporting(false)

    }

  }



  return (

    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">

        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">

          <DialogTitle>Relacionar variables con el CSV</DialogTitle>

        </DialogHeader>



        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">

        {loading ? (

          <div className="py-12 flex justify-center">

            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />

          </div>

        ) : (

          <div className="space-y-5">

            <p className="text-sm text-gray-500">

              {file?.name} · <strong>{rowsTotal}</strong> filas ·{' '}

              <strong>{headers.length}</strong> columnas detectadas

            </p>



            <ColumnMappingEditor headers={headers} mapping={mapping} onChange={setMapping} />



            {checkingDupes && (

              <p className="text-xs text-gray-400">Comprobando duplicados en otras campañas…</p>

            )}



            {otherCampaignDupes && otherCampaignDupes.count > 0 && (

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">

                <p>

                  <strong>{otherCampaignDupes.count}</strong> lead

                  {otherCampaignDupes.count === 1 ? '' : 's'} ya está

                  {otherCampaignDupes.count === 1 ? '' : 'n'} en otra campaña y no se importará

                  {otherCampaignDupes.count === 1 ? '' : 'n'}.

                </p>

                <ul className="text-xs text-amber-800 list-disc pl-4">

                  {otherCampaignDupes.samples.map((s, i) => (

                    <li key={i}>

                      {s.nombre} → <strong>{s.campaign_name}</strong>

                    </li>

                  ))}

                  {otherCampaignDupes.count > otherCampaignDupes.samples.length && (

                    <li>…y {otherCampaignDupes.count - otherCampaignDupes.samples.length} más</li>

                  )}

                </ul>

              </div>

            )}



            {sampleRows.length > 0 && (

              <div className="space-y-2">

                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">

                  Vista previa del archivo

                </p>

                <div className="overflow-auto max-h-36 rounded-xl border border-gray-200">

                  <table className="w-full text-xs text-left min-w-max">

                    <thead>

                      <tr className="bg-gray-50 border-b border-gray-200">

                        {headers.map((h) => (

                          <th

                            key={h}

                            className="px-2 py-2 font-semibold text-gray-600 whitespace-nowrap"

                          >

                            {h}

                          </th>

                        ))}

                      </tr>

                    </thead>

                    <tbody>

                      {sampleRows.slice(0, 3).map((row, i) => (

                        <tr key={i} className="border-b border-gray-100 last:border-0">

                          {headers.map((h) => (

                            <td

                              key={h}

                              className="px-2 py-1.5 text-gray-800 whitespace-nowrap max-w-[140px] truncate"

                            >

                              {row[h] || '—'}

                            </td>

                          ))}

                        </tr>

                      ))}

                    </tbody>

                  </table>

                </div>

              </div>

            )}

          </div>

        )}

        </div>



        <DialogFooter className="px-6 py-4 border-t border-gray-100 shrink-0 bg-white">

          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>

            Cancelar

          </Button>

          <Button type="button" disabled={loading || importing} onClick={handleImport}>

            {importing ? 'Importando...' : 'Importar leads'}

          </Button>

        </DialogFooter>

      </DialogContent>

    </Dialog>

  )

}



'use client'

import { useState } from 'react'
import { Copy, Check, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  buildDataColumnGuide,
  guideToMarkdown,
  type ProjectServiceFlags,
} from '@/lib/engranaje5/data-column-guide'

interface Props {
  projectId: string
  flags: ProjectServiceFlags
}

export default function DeveloperDataGuide({ projectId, flags }: Props) {
  const [copiedId, setCopiedId] = useState(false)
  const [copiedMd, setCopiedMd] = useState(false)
  const columns = buildDataColumnGuide(flags)

  const copy = async (text: string, which: 'id' | 'md') => {
    try {
      await navigator.clipboard.writeText(text)
      if (which === 'id') {
        setCopiedId(true)
        setTimeout(() => setCopiedId(false), 2000)
      } else {
        setCopiedMd(true)
        setTimeout(() => setCopiedMd(false), 2000)
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-lg font-semibold">
            Instrucciones para desarrollo — qué rellenar en engranaje5_data
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Columnas requeridas según los servicios activos de este proyecto.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => copy(guideToMarkdown(projectId, flags), 'md')}
        >
          {copiedMd ? <Check className="h-4 w-4 mr-1.5" /> : <FileText className="h-4 w-4 mr-1.5" />}
          {copiedMd ? 'Copiado' : 'Copiar como Markdown'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            project_id
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800 break-all">
              {projectId}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => copy(projectId, 'id')}
              title="Copiar ID"
            >
              {copiedId ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Usa este ID al insertar filas en engranaje5_data.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left font-medium text-gray-500 px-4 py-2.5 w-48">Columna</th>
                <th className="text-left font-medium text-gray-500 px-4 py-2.5 w-24">Tipo</th>
                <th className="text-left font-medium text-gray-500 px-4 py-2.5">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.name} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{col.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{col.type}</td>
                  <td className="px-4 py-2.5 text-gray-600">{col.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

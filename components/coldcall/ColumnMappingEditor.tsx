import { useState } from 'react'
import {
  INTERNAL_FIELDS,
  type ColumnMapping,
  type InternalFieldKey,
} from '@/lib/coldcall/field-mapping'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface ColumnMappingEditorProps {
  headers: string[]
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
}

export function ColumnMappingEditor({ headers, mapping, onChange }: ColumnMappingEditorProps) {
  const [columnsExpanded, setColumnsExpanded] = useState(false)
  const usedColumns = new Set(
    Object.values(mapping).filter((v): v is string => Boolean(v))
  )
  const manyColumns = headers.length > 12

  const setFieldColumn = (field: InternalFieldKey, csvColumn: string) => {
    const next: ColumnMapping = { ...mapping }
    if (csvColumn === '_none') {
      delete next[field]
    } else {
      for (const [k, v] of Object.entries(next)) {
        if (v === csvColumn && k !== field) delete next[k as InternalFieldKey]
      }
      next[field] = csvColumn
    }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">
              Columnas detectadas en el CSV
            </p>
            <p className="text-xs text-blue-700/80 mt-0.5">
              {headers.length} columna{headers.length === 1 ? '' : 's'}
              {manyColumns ? ' · desplázate para verlas todas' : ''}
            </p>
          </div>
          {manyColumns && (
            <button
              type="button"
              onClick={() => setColumnsExpanded((v) => !v)}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:text-blue-950"
            >
              {columnsExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Ver todas
                </>
              )}
            </button>
          )}
        </div>

        <div
          className={`mt-2 overflow-y-auto overflow-x-hidden pr-1 ${
            columnsExpanded ? 'max-h-40' : 'max-h-20'
          }`}
        >
          <div className="flex flex-wrap gap-1.5">
            {headers.map((h) => (
              <Badge
                key={h}
                variant="secondary"
                className="font-normal text-xs max-w-[200px] truncate"
                title={h}
              >
                {h}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        Relaciona cada variable que necesitamos con la columna correspondiente del archivo.
        <strong className="text-gray-800"> Nombre</strong> (o Apellidos) y{' '}
        <strong className="text-gray-800">Teléfono</strong> son obligatorios.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Relacionar variables
          </p>
        </div>
        <div className="divide-y divide-gray-100 max-h-[min(420px,50vh)] overflow-y-auto">
          {INTERNAL_FIELDS.map((field) => (
            <div
              key={field.key}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 items-center px-4 py-3 bg-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                </p>
                <p className="text-xs text-gray-400">Variable del sistema</p>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="sr-only">Columna CSV para {field.label}</Label>
                <Select
                  value={mapping[field.key] || '_none'}
                  onValueChange={(v) => setFieldColumn(field.key, v)}
                >
                  <SelectTrigger className="rounded-lg h-9">
                    <SelectValue placeholder="Seleccionar columna..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="_none">— Sin asignar —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem
                        key={h}
                        value={h}
                        disabled={usedColumns.has(h) && mapping[field.key] !== h}
                        className="truncate"
                      >
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

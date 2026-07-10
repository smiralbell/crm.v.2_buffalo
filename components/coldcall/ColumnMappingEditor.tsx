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

interface ColumnMappingEditorProps {
  headers: string[]
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
}

export function ColumnMappingEditor({ headers, mapping, onChange }: ColumnMappingEditorProps) {
  const usedColumns = new Set(
    Object.values(mapping).filter((v): v is string => Boolean(v))
  )

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
        <p className="text-xs font-medium text-blue-900 uppercase tracking-wide mb-2">
          Columnas detectadas en el CSV
        </p>
        <div className="flex flex-wrap gap-1.5">
          {headers.map((h) => (
            <Badge key={h} variant="secondary" className="font-normal text-xs">
              {h}
            </Badge>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-600">
        Relaciona cada variable que necesitamos con la columna correspondiente del archivo.
        <strong className="text-gray-800"> Nombre</strong> (o Apellidos) y{' '}
        <strong className="text-gray-800">Teléfono</strong> son obligatorios.
      </p>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {INTERNAL_FIELDS.map((field) => (
          <div
            key={field.key}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 items-center px-4 py-3 bg-white"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {field.label}
                {field.required ? <span className="text-red-500"> *</span> : null}
              </p>
              <p className="text-xs text-gray-400">Variable del sistema</p>
            </div>
            <div className="space-y-1">
              <Label className="sr-only">Columna CSV para {field.label}</Label>
              <Select
                value={mapping[field.key] || '_none'}
                onValueChange={(v) => setFieldColumn(field.key, v)}
              >
                <SelectTrigger className="rounded-lg h-9">
                  <SelectValue placeholder="Seleccionar columna..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Sin asignar —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem
                      key={h}
                      value={h}
                      disabled={usedColumns.has(h) && mapping[field.key] !== h}
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
  )
}

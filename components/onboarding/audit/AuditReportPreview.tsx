'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function AuditReportPreview({
  open,
  onOpenChange,
  markdown,
  generatedAt,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  markdown: string | null
  generatedAt?: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden rounded-[1.75rem] flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-3 border-b border-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Informe preliminar
            </DialogTitle>
          </DialogHeader>
          {generatedAt && (
            <p className="text-[11px] text-zinc-400 mt-1">
              Generado {new Date(generatedAt).toLocaleString('es-ES')}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700 font-sans">
            {markdown || 'Sin informe todavía. Pulsa Finalizar para generarlo.'}
          </pre>
        </div>
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end">
          <Button className="rounded-2xl" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

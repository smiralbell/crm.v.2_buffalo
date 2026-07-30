'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function AuditEditAnswerDialog({
  open,
  onOpenChange,
  initialText,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialText: string
  saving?: boolean
  onSave: (text: string) => void | Promise<void>
}) {
  const [text, setText] = useState(initialText)

  useEffect(() => {
    if (open) setText(initialText)
  }, [open, initialText])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[1.75rem]">
        <DialogHeader>
          <DialogTitle>Editar respuesta</DialogTitle>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full mt-2 resize-none rounded-[1.25rem] bg-zinc-50 ring-1 ring-zinc-200/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-2xl"
            disabled={saving || !text.trim()}
            onClick={() => void onSave(text.trim())}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

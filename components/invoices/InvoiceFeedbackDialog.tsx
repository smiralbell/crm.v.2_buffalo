'use client'

import { CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Variant = 'success' | 'error'

export default function InvoiceFeedbackDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = 'success',
  confirmLabel = 'Continuar',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  variant?: Variant
  confirmLabel?: string
  onConfirm?: () => void
}) {
  const isSuccess = variant === 'success'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-gray-200 p-0 overflow-hidden gap-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader className="space-y-3">
            <div
              className={
                isSuccess
                  ? 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700'
                  : 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600'
              }
            >
              {isSuccess ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <AlertCircle className="h-6 w-6" />
              )}
            </div>
            <DialogTitle className="text-center text-lg font-semibold text-gray-900">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-center text-sm text-gray-500">
                {description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
        </div>
        <DialogFooter className="border-t border-gray-100 bg-gray-50/80 px-6 py-4 sm:justify-center">
          <Button
            type="button"
            className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 sm:w-auto sm:min-w-[140px]"
            onClick={() => {
              onOpenChange(false)
              onConfirm?.()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

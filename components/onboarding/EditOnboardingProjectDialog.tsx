'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import OnboardingProjectEditForm from '@/components/onboarding/OnboardingProjectEditForm'

type Props = {
  open: boolean
  leadId: number | null
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

/** @deprecated Prefer embedding OnboardingProjectEditForm in /onboarding/configure */
export default function EditOnboardingProjectDialog({
  open,
  leadId,
  onOpenChange,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar datos del proyecto</DialogTitle>
          <DialogDescription>
            Cambia manualmente cualquier dato del cliente, lead y proyecto Buffalo.
          </DialogDescription>
        </DialogHeader>
        {leadId != null && (
          <OnboardingProjectEditForm
            leadId={leadId}
            onSaved={() => {
              onOpenChange(false)
              onSaved?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

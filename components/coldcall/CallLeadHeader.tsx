'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LeadFieldRow } from '@/lib/coldcall/lead-display'
import { telHref } from '@/lib/coldcall/lead-links'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import { stageLabel } from '@/lib/coldcall/lead-table'
import {
  ExternalLink,
  Globe,
  Linkedin,
  Mail,
  MessageCircle,
  Phone,
  ChevronDown,
} from 'lucide-react'

interface CallLeadHeaderProps {
  nombre: string
  empresa?: string | null
  cargo?: string | null
  ciudad?: string | null
  stage?: string
  phone: string | null
  phoneDisplay: string | null
  email?: string | null
  webUrl?: string | null
  linkedinUrl?: string | null
  onWhatsApp?: () => void
  extraFields?: LeadFieldRow[]
}

export default function CallLeadHeader({
  nombre,
  empresa,
  cargo,
  ciudad,
  stage,
  phone,
  phoneDisplay,
  email,
  webUrl,
  linkedinUrl,
  onWhatsApp,
  extraFields = [],
}: CallLeadHeaderProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const tel = telHref(phone)
  const displayPhone = phoneDisplay || formatPhoneForDisplay(phone) || 'Sin teléfono'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 bg-gradient-to-br from-gray-50 to-white border-b border-gray-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight truncate">{nombre}</h1>
            {(empresa || cargo || ciudad) && (
              <p className="mt-1 text-base text-gray-600">
                {[empresa, cargo, ciudad].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {stage && (
            <Badge variant="secondary" className="text-sm font-normal shrink-0">
              {stageLabel(stage)}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tel ? (
          <a
            href={tel}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-gray-900 text-white px-3 py-4 hover:bg-gray-800 transition-colors text-center min-h-[88px]"
          >
            <Phone className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Llamar</span>
            <span className="text-sm font-medium tabular-nums leading-tight">{displayPhone}</span>
          </a>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-gray-400 min-h-[88px]">
            <Phone className="h-5 w-5" />
            <span className="text-xs">Sin teléfono</span>
          </div>
        )}

        {webUrl ? (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-900 px-3 py-4 hover:bg-blue-100 transition-colors text-center min-h-[88px]"
          >
            <Globe className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Web</span>
            <span className="text-[11px] truncate max-w-full px-1 opacity-80">
              {webUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
            </span>
          </a>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-gray-400 min-h-[88px]">
            <Globe className="h-5 w-5" />
            <span className="text-xs">Sin web</span>
          </div>
        )}

        {linkedinUrl ? (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 px-3 py-4 hover:bg-sky-100 transition-colors text-center min-h-[88px]"
          >
            <Linkedin className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">LinkedIn</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-gray-400 min-h-[88px]">
            <Linkedin className="h-5 w-5" />
            <span className="text-xs">Sin LinkedIn</span>
          </div>
        )}

        {onWhatsApp ? (
          <button
            type="button"
            onClick={onWhatsApp}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 text-green-900 px-3 py-4 hover:bg-green-100 transition-colors text-center min-h-[88px]"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">WhatsApp</span>
          </button>
        ) : email ? (
          <a
            href={`mailto:${email}`}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-gray-800 px-3 py-4 hover:bg-gray-50 transition-colors text-center min-h-[88px]"
          >
            <Mail className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Email</span>
            <span className="text-[10px] truncate max-w-full px-1 opacity-70">{email}</span>
          </a>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-gray-400 min-h-[88px]">
            <Mail className="h-5 w-5" />
            <span className="text-xs">Sin email</span>
          </div>
        )}
      </div>

      {extraFields.length > 0 && (
        <div className="px-4 pb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-xl gap-2 text-sm"
            onClick={() => setDetailsOpen(true)}
          >
            Ver todos los datos
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      <LeadDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        nombre={nombre}
        fields={extraFields}
      />
    </div>
  )
}

function LeadDetailsDialog({
  open,
  onOpenChange,
  nombre,
  fields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nombre: string
  fields: LeadFieldRow[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-lg">Datos del lead — {nombre}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={`${field.label}-${field.value}`}
                className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 min-w-0"
              >
                <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  {field.label}
                </dt>
                <dd className="text-base text-gray-900 mt-1 break-words whitespace-pre-wrap">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/router'
import { FileText, StickyNote } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import {
  leadContextHref,
  leadIdFromRoute,
  leadNewNoteHref,
} from '@/lib/crm/lead-from-route'

export default function LeadContextShortcuts() {
  const router = useRouter()
  const { user } = useAuth()
  const leadId = leadIdFromRoute(router.pathname, router.query)

  if (user?.role !== 'admin' || !leadId) return null

  const onFicha =
    router.pathname === '/leads/[id]' && String(router.query.id) === String(leadId)

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 px-3">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-lg backdrop-blur-md">
        <Link
          href={leadContextHref(leadId)}
          onClick={(e) => {
            if (!onFicha) return
            e.preventDefault()
            document.getElementById('contexto')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <StickyNote className="h-3.5 w-3.5" />
          Contexto
        </Link>
        <Link
          href={leadNewNoteHref(leadId)}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FileText className="h-3.5 w-3.5" />
          Nueva nota
        </Link>
      </div>
    </div>
  )
}

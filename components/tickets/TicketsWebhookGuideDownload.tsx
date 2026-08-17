import { ChevronDown, Download, FileDown, FileText } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const triggerClass =
  'inline-flex items-center gap-2 px-4 h-10 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50'

export default function TicketsWebhookGuideDownload({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            compact
              ? 'inline-flex items-center gap-2 px-3 h-9 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50'
              : triggerClass
          }
        >
          <Download className="h-4 w-4" />
          Guía webhook
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <a href="/api/tickets/webhook-guide?format=md" download={true}>
            <FileText className="h-4 w-4 mr-2" />
            Markdown (.md)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/api/tickets/webhook-guide?format=pdf" download={true}>
            <FileDown className="h-4 w-4 mr-2" />
            PDF (.pdf)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

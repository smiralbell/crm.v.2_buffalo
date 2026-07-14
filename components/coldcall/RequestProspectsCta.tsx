import RequestProspectsButton from '@/components/coldcall/RequestProspectsButton'
import { PROSPECT_REQUEST_MESSAGE } from '@/lib/coldcall/prospect-requests'
import { Database } from 'lucide-react'

export default function RequestProspectsCta() {
  return (
    <div className="rounded-2xl border border-gray-900/10 bg-gray-900 text-white p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className="rounded-xl bg-white/10 p-2.5 shrink-0">
          <Database className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">¿Necesitas más prospectos?</p>
          <p className="text-xs text-white/75 mt-1 leading-relaxed">
            Solicita una nueva base de datos cuando quieras. Administración recibirá:{' '}
            <span className="text-white/90 font-medium">&quot;{PROSPECT_REQUEST_MESSAGE}&quot;</span>
          </p>
        </div>
      </div>
      <RequestProspectsButton
        variant="secondary"
        className="gap-2 rounded-xl shrink-0 bg-white text-gray-900 hover:bg-gray-100 border-0 font-semibold"
      />
    </div>
  )
}

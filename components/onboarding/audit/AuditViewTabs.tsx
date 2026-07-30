import { MessageCircle, FileText, Map } from 'lucide-react'

export type AuditWorkspaceView = 'chat' | 'document' | 'map'

const TABS: { id: AuditWorkspaceView; label: string; Icon: typeof MessageCircle }[] = [
  { id: 'chat', label: 'Chat', Icon: MessageCircle },
  { id: 'document', label: 'Documento', Icon: FileText },
  { id: 'map', label: 'Mapa', Icon: Map },
]

export function AuditViewTabs({
  value,
  onChange,
}: {
  value: AuditWorkspaceView
  onChange: (v: AuditWorkspaceView) => void
}) {
  return (
    <div className="inline-flex p-1 rounded-[1.35rem] bg-zinc-100/90 ring-1 ring-zinc-200/80">
      {TABS.map(({ id, label, Icon }) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-[1.1rem] text-[13px] font-medium transition-all duration-200 ${
              active
                ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-zinc-200/60'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? 'text-zinc-800' : 'text-zinc-400'}`} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

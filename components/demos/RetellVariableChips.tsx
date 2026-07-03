import {
  RETELL_DYNAMIC_VARS_HELP,
  RETELL_OUTBOUND_VAR_KEYS,
  retellVarPlaceholder,
  type RetellOutboundVarKey,
} from '@/lib/demos/outbound-form'

export function insertTextAtSelection(
  current: string,
  selectionStart: number,
  selectionEnd: number,
  token: string
): { value: string; cursor: number } {
  const value = current.slice(0, selectionStart) + token + current.slice(selectionEnd)
  return { value, cursor: selectionStart + token.length }
}

export default function RetellVariableChips({
  onInsert,
}: {
  onInsert: (token: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-500 leading-snug">{RETELL_DYNAMIC_VARS_HELP}</p>
      <div className="flex flex-wrap gap-1.5">
        {RETELL_OUTBOUND_VAR_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onInsert(retellVarPlaceholder(key as RetellOutboundVarKey))}
            className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[11px] text-violet-800 transition-colors hover:bg-violet-100"
          >
            {retellVarPlaceholder(key as RetellOutboundVarKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

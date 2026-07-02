import type { OutboundFormBrandingRef } from '@/lib/demos/types'
import { brandingToCssVars, normalizeFormFontId, resolveFormFontFamily } from '@/lib/demos/form-branding'
import { PhoneCall } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  nombreCliente: string
  branding: OutboundFormBrandingRef
  children: ReactNode
}

export default function PublicFormShell({ nombreCliente, branding, children }: Props) {
  const normalized = {
    ...branding,
    font_id: normalizeFormFontId(branding.font_id),
  }
  const cssVars = brandingToCssVars(normalized)
  const fontFamily = resolveFormFontFamily(normalized.font_id)

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{
        ...cssVars,
        backgroundColor: branding.color_secondary,
        fontFamily,
      }}
    >
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          {branding.logo_url ? (
            <div className="mx-auto mb-4 flex h-16 max-w-[200px] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logo_url}
                alt={nombreCliente}
                className="max-h-16 max-w-full object-contain"
              />
            </div>
          ) : (
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80"
            >
              <PhoneCall className="h-6 w-6" style={{ color: branding.color_primary }} />
            </div>
          )}
          <h1 className="text-xl font-semibold text-gray-900">{nombreCliente}</h1>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  )
}

export function PublicFormButton({
  children,
  disabled,
  type = 'button',
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      style={{
        backgroundColor: 'var(--form-primary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--form-primary-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--form-primary)'
      }}
    >
      {children}
    </button>
  )
}

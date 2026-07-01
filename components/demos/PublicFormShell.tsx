import type { OutboundFormBrandingRef } from '@/lib/demos/types'
import { brandingToCssVars } from '@/lib/demos/form-branding'
import { PhoneCall } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  nombreCliente: string
  branding: OutboundFormBrandingRef
  children: ReactNode
}

export default function PublicFormShell({ nombreCliente, branding, children }: Props) {
  const cssVars = brandingToCssVars(branding)

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{
        ...cssVars,
        background: `linear-gradient(to bottom, ${branding.color_secondary}, #ffffff)`,
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
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: branding.color_secondary }}
            >
              <PhoneCall className="h-6 w-6" style={{ color: branding.color_primary }} />
            </div>
          )}
          <h1 className="text-xl font-semibold text-gray-900">{nombreCliente}</h1>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>

        <p className="mt-6 text-center text-xs text-gray-400">Powered by Engranaje</p>
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

import type { OutboundFormBrandingRef } from '@/lib/demos/types'
import {
  brandingToCssVars,
  normalizeFormFontId,
  readableTextOnBg,
  resolveFormFontFamily,
} from '@/lib/demos/form-branding'
import { PhoneCall } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  branding: OutboundFormBrandingRef
  children: ReactNode
}

export default function PublicFormShell({ branding, children }: Props) {
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
        backgroundColor: branding.color_screen,
        color: branding.color_text,
        fontFamily,
      }}
    >
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          {branding.logo_url ? (
            <div className="mx-auto flex h-16 max-w-[240px] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logo_url}
                alt=""
                className="max-h-16 max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black/10">
              <PhoneCall className="h-6 w-6" style={{ color: branding.color_button }} />
            </div>
          )}
        </div>

        <div
          className="rounded-2xl border p-6 shadow-sm"
          style={{
            borderColor: `${branding.color_text}22`,
            backgroundColor: branding.color_form,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function PublicFormButton({
  children,
  disabled,
  type = 'button',
  onClick,
  branding,
}: {
  children: ReactNode
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
  branding?: OutboundFormBrandingRef
}) {
  const buttonText = branding ? readableTextOnBg(branding.color_button) : 'var(--form-button-text)'

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium transition-opacity disabled:opacity-50"
      style={{
        backgroundColor: 'var(--form-button)',
        color: buttonText,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--form-button-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--form-button)'
      }}
    >
      {children}
    </button>
  )
}

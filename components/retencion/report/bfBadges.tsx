/** Badges SVG para propuesta: html2canvas centra mal texto en cajas flex/padding. */

import { SEMAFORO_LABEL, type SemaforoLevel } from './buffaloTheme'

const SEMAFORO_FILL: Record<SemaforoLevel, string> = {
  ok: 'var(--bf-ok)',
  amber: 'var(--bf-amber)',
  red: 'var(--bf-red)',
}

export function NumBadge({ value }: { value: string | number }) {
  const label = String(value).padStart(2, '0')
  return (
    <svg
      className="bf-numbadge"
      width="28"
      height="22"
      viewBox="0 0 28 22"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="28" height="22" rx="3" fill="var(--bf-accent)" />
      <text
        x="14"
        y="15"
        textAnchor="middle"
        fill="var(--bf-accent-contrast)"
        fontFamily="Space Grotesk, Inter, Segoe UI, sans-serif"
        fontSize="10"
        fontWeight="700"
      >
        {label}
      </text>
    </svg>
  )
}

export function SemaforoPill({ level }: { level: SemaforoLevel }) {
  const label = SEMAFORO_LABEL[level]
  const w = Math.max(56, 18 + label.length * 7.2)
  return (
    <svg
      className={`bf-semaforo bf-semaforo-${level}`}
      width={w}
      height="20"
      viewBox={`0 0 ${w} 20`}
      aria-label={label}
      focusable="false"
    >
      <rect width={w} height="20" rx="10" fill={SEMAFORO_FILL[level]} />
      <text
        x={w / 2}
        y="14"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="Inter, Segoe UI, sans-serif"
        fontSize="10"
        fontWeight="700"
        letterSpacing="0.06em"
      >
        {label}
      </text>
    </svg>
  )
}

export function CheckMarkIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
      <path
        d="M2.2 6.2 L5 9 L9.8 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

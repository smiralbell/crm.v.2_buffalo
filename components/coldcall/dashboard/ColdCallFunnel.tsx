'use client'

import { cn } from '@/lib/utils'

export interface FunnelStep {
  key: string
  label: string
  value: number
  hint?: string
}

interface ColdCallFunnelProps {
  title: string
  subtitle?: string
  steps: FunnelStep[]
  className?: string
}

/** Colores del embudo de referencia (teal → púrpura → rojo → verde → amarillo) */
const TIER_COLORS = ['#2BB8C7', '#7B6FD6', '#E84855', '#4A9B5C', '#F5C518']

/** Anchos relativos de cada tramo (forma cónica) */
const TIER_WIDTHS = [
  { top: 168, bottom: 138 },
  { top: 138, bottom: 108 },
  { top: 108, bottom: 78 },
  { top: 78, bottom: 48 },
  { top: 48, bottom: 8 },
]

const SEGMENT_H = 44
const GAP = 4
const CX = 100

function tierY(index: number) {
  return index * (SEGMENT_H + GAP)
}

export default function ColdCallFunnel({ title, subtitle, steps, className }: ColdCallFunnelProps) {
  const tiers = steps.slice(0, 5)
  const totalH = tiers.length * SEGMENT_H + (tiers.length - 1) * GAP + 8

  return (
    <div className={cn('rounded-2xl border border-gray-200 bg-white p-5 shadow-sm', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex gap-4 items-start">
        <div className="shrink-0 w-[200px]">
          <svg
            viewBox={`0 0 200 ${totalH}`}
            className="w-full h-auto drop-shadow-sm"
            aria-hidden
          >
            {/* Borde superior elíptico (efecto 3D) */}
            <ellipse cx={CX} cy={6} rx={84} ry={10} fill={TIER_COLORS[0]} opacity={0.85} />

            {tiers.map((step, i) => {
              const w = TIER_WIDTHS[i] ?? TIER_WIDTHS[TIER_WIDTHS.length - 1]
              const y = tierY(i) + 8
              const color = TIER_COLORS[i] ?? TIER_COLORS[TIER_COLORS.length - 1]
              const leftT = CX - w.top / 2
              const rightT = CX + w.top / 2
              const leftB = CX - w.bottom / 2
              const rightB = CX + w.bottom / 2

              return (
                <g key={step.key}>
                  <polygon
                    points={`${leftT},${y} ${rightT},${y} ${rightB},${y + SEGMENT_H} ${leftB},${y + SEGMENT_H}`}
                    fill={color}
                  />
                  {/* Brillo lateral */}
                  <polygon
                    points={`${rightT - 8},${y + 2} ${rightT},${y} ${rightB},${y + SEGMENT_H} ${rightB - 6},${y + SEGMENT_H - 2}`}
                    fill="white"
                    opacity={0.12}
                  />
                  <text
                    x={CX}
                    y={y + SEGMENT_H / 2 + 5}
                    textAnchor="middle"
                    className="fill-white font-bold"
                    style={{ fontSize: step.value >= 100 ? 16 : 18, fontWeight: 700 }}
                  >
                    {step.value}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <div className="flex-1 min-w-0 space-y-2.5 pt-1">
          {tiers.map((step, i) => (
            <div key={step.key} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: TIER_COLORS[i] }}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{step.label}</p>
                {step.hint && (
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{step.hint}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

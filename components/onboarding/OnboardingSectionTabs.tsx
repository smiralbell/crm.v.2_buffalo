import Link from 'next/link'
import { cn } from '@/lib/utils'

export type OnboardingSectionTab = 'personas' | 'demos'

const TABS: { id: OnboardingSectionTab; label: string; short?: string; href: string; adminOnly?: boolean }[] = [
  { id: 'personas', label: 'Personas', href: '/onboarding' },
  { id: 'demos', label: 'Demos', href: '/demos', adminOnly: true },
]

/** Pestañas de Onboarding. «Configurar» y «Demos» solo las ve el admin. */
export default function OnboardingSectionTabs({
  active,
  adminView = true,
}: {
  active: OnboardingSectionTab
  /** false: oculta las pestañas de admin (project manager). */
  adminView?: boolean
}) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 sm:justify-center">
      {TABS.filter((tab) => !tab.adminOnly || adminView).map((tab) => {
        const isActive = active === tab.id
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-2 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors rounded-t-lg sm:flex-initial sm:px-4',
              isActive
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab.short ? (
              <>
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </>
            ) : (
              tab.label
            )}
          </Link>
        )
      })}
    </div>
  )
}

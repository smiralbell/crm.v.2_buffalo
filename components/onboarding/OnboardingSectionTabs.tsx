import Link from 'next/link'
import { cn } from '@/lib/utils'

export type OnboardingSectionTab = 'projects' | 'configure' | 'demos'

const TABS: { id: OnboardingSectionTab; label: string; href: string }[] = [
  { id: 'projects', label: 'Proyectos', href: '/onboarding?tab=projects' },
  { id: 'configure', label: 'Configurar nuevo proyecto', href: '/onboarding?tab=configure' },
  { id: 'demos', label: 'Demos', href: '/demos' },
]

export default function OnboardingSectionTabs({
  active,
  projectsCount,
}: {
  active: OnboardingSectionTab
  projectsCount?: number
}) {
  return (
    <div className="flex items-center justify-center gap-1 border-b border-gray-200">
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors rounded-t-lg',
              isActive
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab.label}
            {tab.id === 'projects' && projectsCount != null && projectsCount > 0 && (
              <span
                className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                  isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                )}
              >
                {projectsCount}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

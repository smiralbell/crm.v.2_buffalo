import { ReactNode, useState } from 'react'
import Sidebar from './Sidebar'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className="flex h-[100dvh] overflow-hidden shell-surface">
      {/* Desktop: en flujo → al expandir empuja el main */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar
          variant="desktop"
          expanded={sidebarExpanded}
          onExpandedChange={setSidebarExpanded}
        />
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden transition-opacity',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        <button
          type="button"
          aria-label="Cerrar menú"
          className={cn(
            'absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-[min(18rem,88vw)] shadow-2xl transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar variant="mobile" onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out">
        <header className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-foreground"
            aria-label="Abrir menú"
          >
            <Menu className="h-4 w-4" />
          </button>
          <img
            src="/brand/buffalo-mark.png"
            alt="Buffalo"
            width={28}
            height={28}
            className="h-7 w-7 rounded-lg object-cover"
          />
          <span className="text-sm font-semibold tracking-tight">Buffalo CRM</span>
        </header>

        <main className="flex-1 overflow-y-auto shell-surface">
          <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-6 lg:px-8 lg:py-7">{children}</div>
        </main>
      </div>
    </div>
  )
}

import { ReactNode, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Sidebar from './Sidebar'
import MobileTabBar from './MobileTabBar'
import LeadContextShortcuts from '@/components/crm/LeadContextShortcuts'
import { useAuth } from '@/components/AuthContext'
import { ArrowLeft, Bell } from 'lucide-react'
import { mobileHasBack, mobileTitle } from '@/lib/mobile-titles'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  const homeHref =
    user?.role === 'developer' ? '/developer' : user?.role === 'comercial' ? '/comercial' : '/dashboard'

  const title = mobileTitle(router.pathname)
  const hasBack = mobileHasBack(router.pathname)
  const goBack = () => {
    if (window.history.length > 1) router.back()
    else router.push(`/${router.pathname.split('/')[1] || ''}`)
  }

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

      <div className="flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out">
        <header className="mobile-header md:hidden sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
          <div className="flex h-12 items-center gap-2.5 px-4">
            {hasBack ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Volver"
                className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link href={homeHref} className="shrink-0" aria-label="Inicio">
                <img
                  src="/brand/buffalo-mark.png"
                  alt="Buffalo"
                  width={26}
                  height={26}
                  className="h-[26px] w-[26px] rounded-lg object-cover"
                />
              </Link>
            )}
            <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">{title}</h1>
            {user?.role === 'admin' && (
              <Link
                href="/alertas"
                aria-label="Alertas"
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground active:bg-muted',
                  router.pathname === '/alertas' && 'bg-muted'
                )}
              >
                <Bell className="h-[18px] w-[18px]" />
              </Link>
            )}
          </div>
        </header>

        <main className="mobile-main flex-1 overflow-y-auto overflow-x-hidden shell-surface">
          <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-6 lg:px-8 lg:py-7">{children}</div>
        </main>
        <LeadContextShortcuts />
      </div>

      <MobileTabBar />
    </div>
  )
}

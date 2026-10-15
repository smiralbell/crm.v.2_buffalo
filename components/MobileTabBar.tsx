import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Sidebar from '@/components/Sidebar'
import {
  Calendar,
  DollarSign,
  FolderKanban,
  HeartHandshake,
  LayoutDashboard,
  Megaphone,
  Menu,
  Ticket,
  TrendingUp,
  Workflow,
} from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import type { CrmRole } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Tab = {
  href: string
  label: string
  icon: React.ElementType
  /** Rutas (prefijos) que también marcan la pestaña como activa. */
  match: string[]
  exact?: boolean
}

const TABS: Record<CrmRole, Tab[]> = {
  admin: [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, match: ['/dashboard', '/alertas'] },
    { href: '/leads', label: 'Leads', icon: TrendingUp, match: ['/leads'] },
    { href: '/pipelines', label: 'Pipelines', icon: Workflow, match: ['/pipelines'] },
    { href: '/finances', label: 'Finanzas', icon: DollarSign, match: ['/finances', '/invoices'] },
  ],
  developer: [
    { href: '/developer', label: 'Inicio', icon: LayoutDashboard, match: ['/developer'], exact: true },
    { href: '/gestion-proyecto', label: 'Proyectos', icon: FolderKanban, match: ['/gestion-proyecto'] },
    { href: '/tickets', label: 'Tickets', icon: Ticket, match: ['/tickets'] },
    { href: '/retencion', label: 'Retención', icon: HeartHandshake, match: ['/retencion'] },
  ],
  comercial: [
    { href: '/comercial', label: 'Inicio', icon: LayoutDashboard, match: ['/comercial'], exact: true },
    { href: '/comercial/campanas', label: 'Campañas', icon: Megaphone, match: ['/comercial/campanas'] },
    {
      href: '/comercial/pipeline',
      label: 'Pipeline',
      icon: Workflow,
      match: ['/comercial/pipeline', '/pipelines'],
    },
    { href: '/comercial/reuniones', label: 'Reuniones', icon: Calendar, match: ['/comercial/reuniones'] },
  ],
}

function isActive(tab: Tab, pathname: string): boolean {
  if (tab.exact) return pathname === tab.href
  return tab.match.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Barra inferior tipo app (solo móvil). «Menú» abre el cajón con todas las secciones. */
export default function MobileTabBar() {
  const router = useRouter()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Al cambiar de pantalla, cerrar el cajón.
  useEffect(() => {
    setMenuOpen(false)
  }, [router.asPath])

  const tabs = user ? TABS[user.role] ?? [] : []

  const itemClass = (active: boolean) =>
    cn(
      'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[10.5px] font-medium transition-colors active:opacity-60',
      active ? 'text-foreground' : 'text-muted-foreground'
    )

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden transition-opacity',
          menuOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          aria-label="Cerrar menú"
          className={cn(
            'absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={cn(
            'mobile-drawer absolute inset-y-0 left-0 w-[min(18rem,88vw)] shadow-2xl transition-transform duration-300 ease-out shell-sidebar',
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar variant="mobile" onNavigate={() => setMenuOpen(false)} />
        </div>
      </div>

      <nav
        aria-label="Navegación principal"
        className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md md:hidden"
      >
        <div className="flex h-14 items-stretch">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab, router.pathname)
            return (
              <Link key={tab.href} href={tab.href} className={itemClass(active)} aria-current={active ? 'page' : undefined}>
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-muted'
                  )}
                >
                  <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.3 : 1.9} />
                </span>
                <span className="truncate">{tab.label}</span>
              </Link>
            )
          })}
          <button type="button" onClick={() => setMenuOpen(true)} className={itemClass(false)}>
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="h-[19px] w-[19px]" strokeWidth={1.9} />
            </span>
            <span>Menú</span>
          </button>
        </div>
      </nav>
    </>
  )
}

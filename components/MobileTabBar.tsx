import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Sidebar from '@/components/Sidebar'
import {
  Calendar,
  ChevronRight,
  DollarSign,
  FolderKanban,
  HeartHandshake,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  Ticket,
  TrendingUp,
  Workflow,
} from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import type { CrmRole } from '@/lib/auth'
import { cn } from '@/lib/utils'

/** La hamburguesa de la cabecera abre el cajón con este evento (Layout y PipelineLayout). */
export const OPEN_MOBILE_MENU_EVENT = 'crm:open-mobile-menu'

export function openMobileMenu() {
  window.dispatchEvent(new Event(OPEN_MOBILE_MENU_EVENT))
}

type SubLink = { href: string; label: string; description: string; icon: React.ElementType }

type Tab = {
  href: string
  label: string
  icon: React.ElementType
  /** Rutas (prefijos) que también marcan la pestaña como activa. */
  match: string[]
  exact?: boolean
  /** Si tiene opciones, al tocarla se abre una hoja para elegir. */
  options?: SubLink[]
}

const TABS: Record<CrmRole, Tab[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/dashboard', '/alertas'] },
    { href: '/leads', label: 'Leads', icon: TrendingUp, match: ['/leads', '/contacts'] },
    { href: '/marketing?tab=global', label: 'Marketing', icon: Megaphone, match: ['/marketing'] },
    { href: '/finances', label: 'Finanzas', icon: DollarSign, match: ['/finances', '/invoices'] },
    {
      href: '/gestion-proyecto',
      label: 'Proyectos',
      icon: FolderKanban,
      match: ['/onboarding', '/demos', '/gestion-proyecto', '/tickets', '/retencion'],
      options: [
        {
          href: '/onboarding?tab=projects',
          label: 'Onboarding',
          description: 'Proyectos activos, configurador y demos',
          icon: PackageCheck,
        },
        {
          href: '/gestion-proyecto',
          label: 'Proyectos',
          description: 'Proyectos abiertos y tickets',
          icon: FolderKanban,
        },
        {
          href: '/retencion',
          label: 'Retención',
          description: 'Clientes con mensualidad',
          icon: HeartHandshake,
        },
      ],
    },
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

/** Barra inferior tipo app (solo móvil) + cajón de secciones (lo abre la hamburguesa de arriba). */
export default function MobileTabBar() {
  const router = useRouter()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheet, setSheet] = useState<Tab | null>(null)

  useEffect(() => {
    const open = () => setMenuOpen(true)
    window.addEventListener(OPEN_MOBILE_MENU_EVENT, open)
    return () => window.removeEventListener(OPEN_MOBILE_MENU_EVENT, open)
  }, [])

  // Al cambiar de pantalla, cerrar cajón y hoja.
  useEffect(() => {
    setMenuOpen(false)
    setSheet(null)
  }, [router.asPath])

  const tabs = user ? TABS[user.role] ?? [] : []

  const itemClass = (active: boolean) =>
    cn(
      'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[10.5px] font-medium transition-colors active:opacity-60',
      active ? 'text-foreground' : 'text-muted-foreground'
    )

  const tabInner = (tab: Tab, active: boolean) => {
    const Icon = tab.icon
    return (
      <>
        <span
          className={cn(
            'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
            active && 'bg-muted'
          )}
        >
          <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.3 : 1.9} />
        </span>
        <span className="max-w-full truncate px-0.5">{tab.label}</span>
      </>
    )
  }

  return (
    <>
      {/* Cajón con todas las secciones */}
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
            'mobile-drawer absolute inset-y-0 right-0 w-[min(18rem,88vw)] shadow-2xl transition-transform duration-300 ease-out shell-sidebar',
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <Sidebar variant="mobile" onNavigate={() => setMenuOpen(false)} />
        </div>
      </div>

      {/* Hoja para elegir dentro de una pestaña con opciones (Proyectos) */}
      <div
        className={cn(
          'fixed inset-0 z-[45] md:hidden transition-opacity',
          sheet ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden={!sheet}
      >
        <button
          type="button"
          aria-label="Cerrar"
          className="absolute inset-0 bg-black/30"
          onClick={() => setSheet(null)}
        />
        <div
          className={cn(
            'absolute inset-x-3 bottom-[calc(var(--tabbar-h)+0.5rem)] rounded-2xl border border-border bg-card p-2 shadow-2xl transition-transform duration-200 ease-out',
            sheet ? 'translate-y-0' : 'translate-y-4'
          )}
        >
          {sheet && (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {sheet.label}
              </p>
              {sheet.options?.map((opt) => {
                const Icon = opt.icon
                const path = opt.href.split('?')[0]
                const active = router.pathname === path || router.pathname.startsWith(`${path}/`)
                return (
                  <Link
                    key={opt.href}
                    href={opt.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 active:bg-muted',
                      active && 'bg-muted'
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-foreground">{opt.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{opt.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                )
              })}
            </>
          )}
        </div>
      </div>

      <nav
        aria-label="Navegación principal"
        className="mobile-tabbar fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-md md:hidden"
      >
        <div className="flex h-14 items-stretch">
          {tabs.map((tab) => {
            const active = isActive(tab, router.pathname) || sheet?.href === tab.href
            if (tab.options) {
              return (
                <button
                  key={tab.href}
                  type="button"
                  onClick={() => setSheet((cur) => (cur?.href === tab.href ? null : tab))}
                  className={itemClass(active)}
                  aria-expanded={sheet?.href === tab.href}
                >
                  {tabInner(tab, active)}
                </button>
              )
            }
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={itemClass(active)}
                aria-current={active ? 'page' : undefined}
              >
                {tabInner(tab, active)}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

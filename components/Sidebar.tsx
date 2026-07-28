import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  LogOut,
  Workflow,
  DollarSign,
  Megaphone,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  HeartHandshake,
  Bot,
  FolderKanban,
  Users,
  Calendar,
  Phone,
  Clock,
  MessageSquare,
  Copy,
  ListChecks,
  Sparkles,
  Moon,
  Sun,
  HelpCircle,
  Video,
} from 'lucide-react'
import { getLastCampaignId, lastCampaignCallHref } from '@/lib/coldcall/last-campaign'
import ComercialSidebarBrand from '@/components/coldcall/ComercialSidebarBrand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import type { CrmRole } from '@/lib/auth'

interface SubItem {
  href: string
  label: string
  developerLabel?: string
  tab?: string
  cc?: string
  roles?: CrmRole[]
}

interface NavItem {
  href: string
  label: string
  badge?: string
  icon: React.ElementType
  children?: SubItem[]
  roles?: CrmRole[]
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { href: '/leads', label: 'Leads', icon: TrendingUp, roles: ['admin'] },
  {
    href: '/finances',
    label: 'Finanzas',
    icon: DollarSign,
    roles: ['admin'],
    children: [
      { href: '/finances', label: 'Resumen' },
      { href: '/invoices', label: 'Facturas' },
      { href: '/invoices/recurring', label: 'Recurrentes' },
    ],
  },
  { href: '/pipelines', label: 'Pipelines', icon: Workflow, roles: ['admin'] },
  {
    href: '/marketing',
    label: 'Marketing',
    badge: 'ENG 1',
    icon: Megaphone,
    roles: ['admin'],
    children: [
      { href: '/marketing', label: 'Métricas globales', tab: 'global' },
      { href: '/marketing', label: 'Web', tab: 'web' },
      { href: '/marketing', label: 'Email Outreach', tab: 'email' },
      { href: '/marketing', label: 'Cold Calling', tab: 'coldcalling' },
      { href: '/marketing', label: 'Meta Ads', tab: 'meta' },
      { href: '/marketing', label: 'Google Ads', tab: 'google' },
    ],
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    badge: 'ENG 2',
    icon: PackageCheck,
    roles: ['admin'],
    children: [
      { href: '/onboarding', label: 'Proyectos activos', tab: 'projects' },
      { href: '/onboarding/configure', label: 'Configurador' },
      { href: '/demos', label: 'Demos' },
    ],
  },
  {
    href: '/gestion-proyecto',
    label: 'Proyectos',
    badge: 'ENG 3',
    icon: FolderKanban,
    roles: ['admin', 'developer'],
    children: [
      { href: '/gestion-proyecto', label: 'Proyectos abiertos' },
      { href: '/tickets', label: 'Tickets', roles: ['admin', 'developer'] },
    ],
  },
  {
    href: '/retencion',
    label: 'Retención',
    badge: 'ENG 4',
    icon: HeartHandshake,
    roles: ['admin', 'developer'],
    children: [
      { href: '/retencion', label: 'Buffalo con mensualidad', developerLabel: 'Proyectos' },
    ],
  },
  { href: '/developer', label: 'Dashboard', icon: LayoutDashboard, roles: ['developer'] },
  { href: '/comercial', label: 'Inicio', icon: LayoutDashboard, roles: ['comercial'] },
  { href: '/comercial/campanas', label: 'Campañas', icon: Megaphone, roles: ['comercial'] },
  { href: '/comercial/pipeline', label: 'Pipeline', icon: Workflow, roles: ['comercial'] },
  { href: '/comercial/reuniones', label: 'Reuniones', icon: Calendar, roles: ['comercial'] },
  { href: '/comercial/fireflies', label: 'Fireflies', icon: Video, roles: ['comercial', 'admin'] },
  { href: '/comercial/llamar-mas-tarde', label: 'Llamar más tarde', icon: Clock, roles: ['comercial'] },
  { href: '/comercial/objeciones', label: 'Objeciones', icon: MessageSquare, roles: ['comercial'] },
  { href: '/comercial/duplicados', label: 'Duplicados', icon: Copy, roles: ['comercial'] },
  { href: '/comercial/preparar-demos', label: 'Preparar demos', icon: Bot, roles: ['comercial'] },
  {
    href: '/developer/facturas',
    label: 'Facturas',
    icon: FileText,
    roles: ['developer', 'comercial'],
    children: [
      { href: '/developer/facturas', label: 'Mis facturas' },
      { href: '/developer/facturas/nueva', label: 'Nueva factura' },
    ],
  },
  { href: '/calendario', label: 'Calendario', icon: Calendar, roles: ['admin'] },
  { href: '/analisis', label: 'Análisis IA', icon: Sparkles, roles: ['admin'] },
  { href: '/checklist', label: 'Checklist', icon: ListChecks, roles: ['admin'] },
]

type SidebarProps = {
  variant: 'desktop' | 'mobile'
  onNavigate?: () => void
  /** Solo desktop: controlado por Layout para empujar el contenido */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

export default function Sidebar({
  variant,
  onNavigate,
  expanded: expandedProp,
  onExpandedChange,
}: SidebarProps) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const role = user?.role
  const isAdmin = role === 'admin'
  const isDesktop = variant === 'desktop'
  const expanded = isDesktop ? Boolean(expandedProp) : true

  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [callNowHref, setCallNowHref] = useState('/comercial/campanas')

  const showLabels = !isDesktop || expanded
  const setExpanded = (v: boolean) => {
    if (isDesktop) onExpandedChange?.(v)
  }

  const navItems = useMemo(() => {
    if (!role) return []
    const items = NAV.filter((item) => !item.roles || item.roles.includes(role))
    if (role === 'developer') {
      const order = ['/developer', '/gestion-proyecto', '/retencion', '/developer/facturas']
      return [...items].sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href))
    }
    if (role === 'comercial') {
      const order = [
        '/comercial',
        '/comercial/campanas',
        '/comercial/pipeline',
        '/comercial/reuniones',
        '/comercial/fireflies',
        '/comercial/llamar-mas-tarde',
        '/comercial/objeciones',
        '/comercial/duplicados',
        '/comercial/preparar-demos',
        '/developer/facturas',
      ]
      return [...items].sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href))
    }
    return items
  }, [role])

  useEffect(() => {
    if (role !== 'comercial') return
    setCallNowHref(lastCampaignCallHref(getLastCampaignId()))
  }, [role, router.pathname])

  useEffect(() => {
    const updates: Record<string, boolean> = {}
    for (const item of navItems) {
      if (!item.children) continue
      const onParent =
        router.pathname === item.href || router.pathname.startsWith(`${item.href}/`)
      const onChild = item.children.some(
        (c) => router.pathname === c.href || router.pathname.startsWith(`${c.href}/`)
      )
      if (onParent || onChild) updates[item.href] = true
    }
    setOpen((prev) => ({ ...prev, ...updates }))
  }, [router.pathname, navItems])

  const go = (href: string) => {
    router.push(href)
    onNavigate?.()
  }

  const handleParentNav = (item: NavItem) => {
    if (!showLabels && item.children) {
      // Colapsado: ir al destino por defecto
      if (item.href === '/marketing') go('/marketing?tab=global')
      else if (item.href === '/onboarding') go('/onboarding?tab=projects')
      else go(item.href)
      return
    }
    setOpen((prev) => ({ ...prev, [item.href]: true }))
    if (item.href === '/marketing') go('/marketing?tab=global')
    else if (item.href === '/onboarding') go('/onboarding?tab=projects')
    else if (item.href === '/retencion') go('/retencion')
    else if (item.href === '/gestion-proyecto') go('/gestion-proyecto')
    else if (item.href === '/finances') go('/finances')
    else if (item.href === '/comercial') go('/comercial')
    else if (item.href === '/comercial/campanas') go('/comercial/campanas')
    else if (item.href === '/comercial/pipeline') go('/comercial/pipeline')
    else if (item.href === '/comercial/reuniones') go('/comercial/reuniones')
    else if (item.href === '/comercial/fireflies') go('/comercial/fireflies')
    else if (item.href === '/comercial/llamar-mas-tarde') go('/comercial/llamar-mas-tarde')
    else if (item.href === '/comercial/objeciones') go('/comercial/objeciones')
    else if (item.href === '/comercial/duplicados') go('/comercial/duplicados')
    else if (item.href === '/comercial/preparar-demos') go('/comercial/preparar-demos')
    else if (item.href === '/developer/facturas') go('/developer/facturas')
    else if (item.href === '/developer') go('/developer')
    else go(item.href)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const isParentActive = (item: NavItem) => {
    if (router.pathname === item.href || router.pathname.startsWith(`${item.href}/`)) return true
    return Boolean(
      item.children?.some(
        (c) => router.pathname === c.href || router.pathname.startsWith(`${c.href}/`)
      )
    )
  }

  const isComercialNavActive = (href: string) => {
    if (href === '/comercial') return router.pathname === '/comercial'
    if (href === '/comercial/pipeline') {
      return (
        router.pathname === '/comercial/pipeline' || router.pathname.startsWith('/pipelines/')
      )
    }
    return router.pathname === href || router.pathname.startsWith(`${href}/`)
  }

  const homeHref =
    role === 'developer' ? '/developer' : role === 'comercial' ? '/comercial' : '/dashboard'

  const childLabel = (child: SubItem) =>
    role === 'developer' && child.developerLabel ? child.developerLabel : child.label

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors',
      showLabels ? 'justify-start' : 'justify-center',
      active
        ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]'
        : 'text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]'
    )

  return (
    <aside
      onMouseEnter={() => isDesktop && setExpanded(true)}
      onMouseLeave={() => isDesktop && setExpanded(false)}
      className={cn(
        'shell-sidebar flex h-full flex-col border-r transition-[width] duration-200 ease-out overflow-hidden',
        isDesktop ? (expanded ? 'w-60' : 'w-[68px]') : 'h-full w-full'
      )}
    >
      <div
        className={cn(
          'shrink-0',
          showLabels ? 'px-3 pt-3 pb-1' : 'px-2 pt-3 pb-1'
        )}
      >
        {role === 'comercial' && showLabels ? (
          <ComercialSidebarBrand href={homeHref} />
        ) : (
          <Link
            href={homeHref}
            onClick={() => onNavigate?.()}
            className="flex items-center justify-center"
            title="Buffalo"
          >
            {showLabels ? (
              <span className="inline-flex w-full items-center justify-center rounded-2xl bg-transparent px-3 py-2.5 shadow-sm ring-1 ring-[hsl(var(--sidebar-border))]">
                <img
                  src="https://agenciabuffalo.es/wp-content/uploads/2025/10/Generated_Image_September_25__2025_-_11_16AM-removebg-preview.png"
                  alt="Buffalo AI"
                  className="h-9 w-auto max-w-full object-contain"
                />
              </span>
            ) : (
              <img
                src="/brand/buffalo-mark.png"
                alt="Buffalo"
                width={48}
                height={48}
                className="h-12 w-12 rounded-2xl object-cover shadow-sm ring-1 ring-[hsl(var(--sidebar-border))]"
              />
            )}
          </Link>
        )}
      </div>

      <div className="sidebar-nav-fade flex-1 min-h-0 relative">
        <nav className="sidebar-nav-scroll hide-scrollbar h-full py-2.5 px-2 pb-8 space-y-0.5">
          {loading ? (
            <div className="px-1 py-2 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 rounded-xl bg-[hsl(var(--sidebar-accent))] animate-pulse" />
              ))}
            </div>
          ) : role === 'comercial' ? (
            <>
              {showLabels && (
                <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-muted))]">
                  Llamadas
                </p>
              )}
              <Link
                href={callNowHref}
                onClick={() => onNavigate?.()}
                title="Llamar ahora"
                className={cn(
                  'flex items-center gap-2 rounded-xl mx-0.5 mb-2 px-2.5 py-2 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-colors',
                  showLabels ? 'justify-center' : 'justify-center'
                )}
              >
                <Phone className="h-4 w-4 shrink-0" />
                {showLabels && <span>Llamar ahora</span>}
              </Link>
              {navItems
                .filter((item) =>
                  [
                    '/comercial',
                    '/comercial/campanas',
                    '/comercial/pipeline',
                    '/comercial/reuniones',
                    '/comercial/fireflies',
                    '/comercial/llamar-mas-tarde',
                    '/comercial/objeciones',
                    '/comercial/duplicados',
                    '/comercial/preparar-demos',
                  ].includes(item.href)
                )
                .map((item) => {
                  const Icon = item.icon
                  const active = isComercialNavActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      onClick={() => onNavigate?.()}
                      className={itemClass(active)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {showLabels && <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              {showLabels && (
                <p className="px-2.5 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-muted))]">
                  Facturación
                </p>
              )}
              {navItems
                .filter((item) => item.href === '/developer/facturas')
                .map((item) => {
                  const Icon = item.icon
                  const active = isParentActive(item)
                  const isOpen = open[item.href] ?? false
                  return (
                    <div key={item.href}>
                      <button
                        type="button"
                        title={item.label}
                        onClick={() => handleParentNav(item)}
                        className={cn(itemClass(active), 'w-full')}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {showLabels && (
                          <>
                            <span className="flex-1 text-left truncate">{item.label}</span>
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
                            )}
                          </>
                        )}
                      </button>
                      {showLabels && isOpen && item.children && (
                        <div className="ml-2 mt-0.5 mb-1 border-l border-[hsl(var(--sidebar-border))] pl-2 space-y-0.5">
                          {item.children.map((child) => {
                            const childActive =
                              router.pathname === child.href ||
                              router.pathname.startsWith(child.href + '/')
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => onNavigate?.()}
                                className={cn(
                                  'block rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                                  childActive
                                    ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]'
                                    : 'text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))]'
                                )}
                              >
                                {child.label}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
            </>
          ) : (
            navItems.map((item) => {
              const Icon = item.icon
              const active = isParentActive(item)
              const isOpen = open[item.href] ?? false

              if (!item.children) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    onClick={() => onNavigate?.()}
                    className={itemClass(active)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {showLabels && <span className="flex-1 truncate">{item.label}</span>}
                  </Link>
                )
              }

              return (
                <div key={item.href}>
                  <button
                    type="button"
                    title={item.label}
                    onClick={() => handleParentNav(item)}
                    className={cn(itemClass(active), 'w-full')}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {showLabels && (
                      <>
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {item.badge && isAdmin && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900 tracking-wide shrink-0">
                            {item.badge}
                          </span>
                        )}
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
                        )}
                      </>
                    )}
                  </button>

                  {showLabels && isOpen && (
                    <div className="ml-2 mt-0.5 mb-1 border-l border-[hsl(var(--sidebar-border))] pl-2 space-y-0.5">
                      {item.children
                        .filter((child) => !child.roles || (role && child.roles.includes(role)))
                        .map((child) => {
                          const query = new URLSearchParams()
                          if (child.tab) query.set('tab', child.tab)
                          if (child.cc) query.set('cc', child.cc)
                          const childHref = child.tab
                            ? `${child.href}?${query.toString()}`
                            : child.href
                          const tabParam = router.query.tab as string | undefined
                          const ccParam = router.query.cc as string | undefined
                          const childActive = child.tab
                            ? router.pathname === child.href &&
                              tabParam === child.tab &&
                              (child.cc
                                ? child.cc === 'dashboard'
                                  ? !ccParam || ccParam === 'dashboard'
                                  : ccParam === child.cc
                                : true)
                            : router.pathname === child.href ||
                              router.pathname.startsWith(child.href + '/')

                          return (
                            <Link
                              key={`${child.href}-${child.tab || child.label}`}
                              href={childHref}
                              onClick={() => onNavigate?.()}
                              className={cn(
                                'block rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                                childActive
                                  ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]'
                                  : 'text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))]'
                              )}
                            >
                              {childLabel(child)}
                            </Link>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </nav>
      </div>

      <div className="border-t border-[hsl(var(--sidebar-border))] p-2 shrink-0 space-y-0.5">
        <button
          type="button"
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          onClick={toggleTheme}
          className={cn(itemClass(false), 'w-full')}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {showLabels && (
            <span className="flex-1 text-left">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
          )}
        </button>

        {isAdmin && (
          <Link
            href="/usuarios"
            title="Usuarios"
            onClick={() => onNavigate?.()}
            className={itemClass(
              router.pathname === '/usuarios' || router.pathname.startsWith('/usuarios/')
            )}
          >
            <Users className="h-4 w-4 shrink-0" />
            {showLabels && <span className="flex-1 truncate">Usuarios</span>}
          </Link>
        )}

        <div
          className={cn(
            'flex gap-1',
            showLabels ? 'w-full flex-row items-center' : 'flex-col items-center'
          )}
        >
          <button
            type="button"
            title="Documentación (abre en pestaña nueva)"
            aria-label="Abrir documentación"
            onClick={() => {
              window.open('/ayuda', '_blank', 'noopener,noreferrer')
              onNavigate?.()
            }}
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--sidebar-muted))] transition-colors hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]',
              showLabels && 'order-2'
            )}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <Button
            variant="ghost"
            size="sm"
            title="Cerrar sesión"
            className={cn(
              'h-auto rounded-xl px-2.5 py-2 text-sm text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))]',
              showLabels ? 'order-1 min-w-0 flex-1 justify-start' : 'justify-center'
            )}
            onClick={handleLogout}
          >
            <LogOut className={cn('h-4 w-4', showLabels && 'mr-2')} />
            {showLabels && <span className="truncate">Cerrar sesión</span>}
          </Button>
        </div>
      </div>
    </aside>
  )
}

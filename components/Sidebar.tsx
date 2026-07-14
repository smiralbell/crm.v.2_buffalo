import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard, TrendingUp, FileText, LogOut, Workflow,
  DollarSign, Megaphone,
  ChevronDown, ChevronRight, PackageCheck, HeartHandshake, Ticket, Bot, FolderKanban,
  Users, Calendar, Phone, Clock, MessageSquare, Copy,
} from 'lucide-react'
import { getLastCampaignId, lastCampaignCallHref } from '@/lib/coldcall/last-campaign'
import ComercialSidebarBrand from '@/components/coldcall/ComercialSidebarBrand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'
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
    href: '/invoices',
    label: 'Facturas',
    icon: FileText,
    roles: ['admin'],
    children: [
      { href: '/invoices', label: 'Listado' },
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
    ],
  },
  {
    href: '/gestion-proyecto',
    label: 'Proyectos',
    badge: 'ENG 3',
    icon: FolderKanban,
    roles: ['admin', 'developer'],
    children: [{ href: '/gestion-proyecto', label: 'Proyectos abiertos' }],
  },
  {
    href: '/retencion',
    label: 'Retención',
    badge: 'ENG 4',
    icon: HeartHandshake,
    roles: ['admin', 'developer'],
    children: [{ href: '/retencion', label: 'Clientes con mensualidad', developerLabel: 'Proyectos' }],
  },
  { href: '/finances', label: 'Finanzas', icon: DollarSign, roles: ['admin'] },
  { href: '/tickets', label: 'Tickets', icon: Ticket, roles: ['admin', 'developer'] },
  { href: '/developer', label: 'Dashboard', icon: LayoutDashboard, roles: ['developer'] },
  { href: '/comercial', label: 'Métricas', icon: LayoutDashboard, roles: ['comercial'] },
  { href: '/comercial/campanas', label: 'Campañas', icon: Megaphone, roles: ['comercial'] },
  { href: '/comercial/pipeline', label: 'Pipeline', icon: Workflow, roles: ['comercial'] },
  { href: '/comercial/reuniones', label: 'Reuniones', icon: Calendar, roles: ['comercial'] },
  { href: '/comercial/llamar-mas-tarde', label: 'Llamar más tarde', icon: Clock, roles: ['comercial'] },
  { href: '/comercial/objeciones', label: 'Objeciones', icon: MessageSquare, roles: ['comercial'] },
  { href: '/comercial/duplicados', label: 'Duplicados', icon: Copy, roles: ['comercial'] },
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
  { href: '/demos', label: 'Demos', icon: Bot, roles: ['admin'] },
  { href: '/usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
]

export default function Sidebar() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const role = user?.role
  const isAdmin = role === 'admin'

  const navItems = useMemo(() => {
    if (!role) return []
    const items = NAV.filter((item) => !item.roles || item.roles.includes(role))
    if (role === 'developer') {
      const order = [
        '/developer',
        '/gestion-proyecto',
        '/retencion',
        '/tickets',
        '/developer/facturas',
      ]
      return [...items].sort(
        (a, b) => order.indexOf(a.href) - order.indexOf(b.href)
      )
    }
    if (role === 'comercial') {
      const order = ['/comercial', '/comercial/campanas', '/comercial/reuniones', '/comercial/llamar-mas-tarde', '/comercial/objeciones', '/comercial/duplicados', '/developer/facturas']
      return [...items].sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href))
    }
    return items
  }, [role])

  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [callNowHref, setCallNowHref] = useState('/comercial/campanas')

  useEffect(() => {
    if (role !== 'comercial') return
    setCallNowHref(lastCampaignCallHref(getLastCampaignId()))
  }, [role, router.pathname])

  useEffect(() => {
    const updates: Record<string, boolean> = {}
    for (const item of navItems) {
      if (item.children && router.pathname.startsWith(item.href)) {
        updates[item.href] = true
      }
    }
    setOpen((prev) => ({ ...prev, ...updates }))
  }, [router.pathname, navItems])

  const handleParentNav = (item: NavItem) => {
    setOpen((prev) => ({ ...prev, [item.href]: true }))
    if (item.href === '/marketing') router.push('/marketing?tab=global')
    else if (item.href === '/onboarding') router.push('/onboarding?tab=projects')
    else if (item.href === '/retencion') router.push('/retencion')
    else if (item.href === '/gestion-proyecto') router.push('/gestion-proyecto')
    else if (item.href === '/comercial') router.push('/comercial')
    else if (item.href === '/comercial/campanas') router.push('/comercial/campanas')
    else if (item.href === '/comercial/reuniones') router.push('/comercial/reuniones')
    else if (item.href === '/comercial/llamar-mas-tarde') router.push('/comercial/llamar-mas-tarde')
    else if (item.href === '/comercial/objeciones') router.push('/comercial/objeciones')
    else if (item.href === '/comercial/duplicados') router.push('/comercial/duplicados')
    else if (item.href === '/developer/facturas') router.push('/developer/facturas')
    else if (item.href === '/developer') router.push('/developer')
    else router.push(item.href)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const isParentActive = (item: NavItem) =>
    router.pathname === item.href || router.pathname.startsWith(item.href + '/')

  const isComercialNavActive = (href: string) => {
    if (href === '/comercial') return router.pathname === '/comercial'
    return router.pathname === href || router.pathname.startsWith(`${href}/`)
  }

  const homeHref =
    role === 'developer' ? '/developer' : role === 'comercial' ? '/comercial' : '/dashboard'

  const childLabel = (child: SubItem) =>
    role === 'developer' && child.developerLabel ? child.developerLabel : child.label

  return (
    <div className="flex h-screen w-60 shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-4 py-5 shrink-0">
        {role === 'comercial' ? (
          <ComercialSidebarBrand href={homeHref} />
        ) : (
          <Link href={homeHref} className="flex items-center justify-center px-1">
            <img
              src="https://agenciabuffalo.es/wp-content/uploads/2025/10/Generated_Image_September_25__2025_-_11_16AM-removebg-preview.png"
              alt="Buffalo AI"
              className="h-[52px] w-auto object-contain"
            />
          </Link>
        )}
        {user && (
          <p className="mt-3 text-center text-[11px] text-gray-400 truncate px-1" title={user.email}>
            {user.name}
          </p>
        )}
      </div>

      <div className="sidebar-nav-fade flex-1 min-h-0 relative">
        <nav className="sidebar-nav-scroll h-full py-4 px-3 space-y-0.5">
          {loading ? (
            <div className="px-1 py-2 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : role === 'comercial' ? (
            <>
              <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Llamadas
              </p>
              <Link
                href={callNowHref}
                className="flex items-center justify-center gap-2 rounded-xl mx-0.5 mb-3 px-3 py-3 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors shadow-sm"
              >
                <Phone className="h-4 w-4" />
                Llamar ahora
              </Link>
              {navItems
                .filter((item) =>
                  ['/comercial', '/comercial/campanas', '/comercial/reuniones', '/comercial/llamar-mas-tarde', '/comercial/objeciones', '/comercial/duplicados'].includes(item.href)
                )
                .map((item) => {
                  const Icon = item.icon
                  const active = isComercialNavActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  )
                })}
              <p className="px-3 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Facturación
              </p>
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
                        onClick={() => handleParentNav(item)}
                        className={cn(
                          'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        )}
                      </button>
                      {isOpen && item.children && (
                        <div className="ml-3 mt-0.5 mb-1 border-l border-gray-100 pl-3 space-y-0.5">
                          {item.children.map((child) => {
                            const childActive =
                              router.pathname === child.href ||
                              router.pathname.startsWith(child.href + '/')
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={cn(
                                  'block rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                  childActive
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
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
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              )
            }

            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => handleParentNav(item)}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && isAdmin && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white tracking-wide shrink-0">
                      {item.badge}
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="ml-3 mt-0.5 mb-1 border-l border-gray-100 pl-3 space-y-0.5">
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
                        : router.pathname === child.href || router.pathname.startsWith(child.href + '/')

                      return (
                        <Link
                          key={`${child.href}-${child.tab || child.label}`}
                          href={childHref}
                          className={cn(
                            'block rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                            childActive
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
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

      <div className="border-t border-gray-100 p-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-xl text-gray-500"
          onClick={handleLogout}
        >
          <LogOut className="mr-2.5 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}

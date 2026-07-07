import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, TrendingUp, FileText, LogOut, Workflow,
  DollarSign, Megaphone,
  ChevronDown, ChevronRight, PackageCheck, HeartHandshake, Ticket, Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubItem {
  href: string
  label: string
  tab?: string   // si el subapartado es un tab de la página padre, no ruta propia
}

interface NavItem {
  href: string
  label: string
  badge?: string
  icon: React.ElementType
  children?: SubItem[]
}

// ── Nav structure ─────────────────────────────────────────────────────────────

const NAV: NavItem[] = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/leads',       label: 'Leads',      icon: TrendingUp },
  { href: '/invoices',    label: 'Facturas',   icon: FileText },
  { href: '/pipelines',   label: 'Pipelines',  icon: Workflow },
  {
    href: '/marketing',
    label: 'Marketing',
    badge: 'ENG 1',
    icon: Megaphone,
    children: [
      { href: '/marketing', label: 'Métricas globales', tab: 'global' },
      { href: '/marketing', label: 'Web',               tab: 'web' },
      { href: '/marketing', label: 'Email Outreach',    tab: 'email' },
      { href: '/marketing', label: 'Cold Calling',      tab: 'coldcalling' },
      { href: '/marketing', label: 'Meta Ads',          tab: 'meta' },
      { href: '/marketing', label: 'Google Ads',        tab: 'google' },
    ],
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    badge: 'ENG 2',
    icon: PackageCheck,
    children: [
      { href: '/onboarding',           label: 'Proyectos activos', tab: 'projects' },
      { href: '/onboarding/configure', label: 'Configurador'     },
    ],
  },
  {
    href: '/retencion',
    label: 'Retención',
    badge: 'ENG 3',
    icon: HeartHandshake,
    children: [
      { href: '/retencion', label: 'Clientes con mensualidad' },
    ],
  },
  { href: '/finances', label: 'Finanzas', icon: DollarSign },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/demos', label: 'Demos', icon: Bot },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const router = useRouter()

  // Qué grupos están abiertos (por href del padre)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  // Abrir automáticamente el grupo activo al cargar/navegar
  useEffect(() => {
    const updates: Record<string, boolean> = {}
    for (const item of NAV) {
      if (item.children && router.pathname.startsWith(item.href)) {
        updates[item.href] = true
      }
    }
    setOpen(prev => ({ ...prev, ...updates }))
  }, [router.pathname])

  const handleParentNav = (item: NavItem) => {
    setOpen(prev => ({ ...prev, [item.href]: true }))
    if (item.href === '/marketing') router.push('/marketing?tab=global')
    else if (item.href === '/onboarding') router.push('/onboarding?tab=projects')
    else if (item.href === '/retencion') router.push('/retencion')
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const isParentActive = (item: NavItem) =>
    router.pathname === item.href || router.pathname.startsWith(item.href + '/')

  return (
    <div className="flex h-screen w-60 flex-col border-r border-gray-100 bg-white">

      {/* Logo */}
      <div className="border-b border-gray-100 px-5 py-6">
        <Link href="/dashboard" className="flex items-center justify-center">
          <img
            src="https://agenciabuffalo.es/wp-content/uploads/2025/10/Generated_Image_September_25__2025_-_11_16AM-removebg-preview.png"
            alt="Buffalo AI"
            className="h-[52px] w-auto object-contain"
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map((item) => {
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

          // Item con submenú
          return (
            <div key={item.href}>
              <button
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
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white tracking-wide shrink-0">
                    {item.badge}
                  </span>
                )}
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                }
              </button>

              {isOpen && (
                <div className="ml-3 mt-0.5 mb-1 border-l border-gray-100 pl-3 space-y-0.5">
                  {item.children.map((child) => {
                    const childHref = child.tab
                      ? `${child.href}?tab=${child.tab}`
                      : child.href

                    // Activo si estamos en la ruta exacta y el tab coincide (si hay)
                    const tabParam = router.query.tab as string | undefined
                    const childActive = child.tab
                      ? router.pathname === child.href && (
                          tabParam === child.tab ||
                          (!tabParam && child.tab === 'global')
                        )
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
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-100 p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start rounded-xl text-gray-500" onClick={handleLogout}>
          <LogOut className="mr-2.5 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}

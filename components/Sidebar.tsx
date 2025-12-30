import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutDashboard, Users, TrendingUp, FileText, LogOut, Workflow, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Sidebar() {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/contacts', label: 'Contacts', icon: Users },
    { href: '/leads', label: 'Leads', icon: TrendingUp },
    { href: '/invoices', label: 'Facturas', icon: FileText },
    { href: '/pipelines', label: 'Pipelines', icon: Workflow },
    { href: '/finances', label: 'Finanzas', icon: DollarSign },
  ]

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-white">
      {/* Logo */}
      <div className="border-b p-6">
        <Link href="/dashboard" className="flex items-center justify-center">
          <img
            src="https://agenciabuffalo.es/wp-content/uploads/2025/10/Generated_Image_September_25__2025_-_11_16AM-removebg-preview.png"
            alt="Buffalo AI Logo"
            className="h-12 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = router.pathname === item.href || router.pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="mr-3 h-5 w-5" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}


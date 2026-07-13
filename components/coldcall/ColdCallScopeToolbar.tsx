'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/AuthContext'
import type { ColdCallFilter } from '@/lib/coldcall/scope'
import { ChevronDown, RefreshCw } from 'lucide-react'

interface TeamMemberOption {
  id: number
  name: string
  email: string
  role: string
}

interface ColdCallScopeToolbarProps {
  filter: ColdCallFilter
  onFilterChange: (filter: ColdCallFilter) => void
  onRefresh: () => void
  loading?: boolean
  className?: string
}

export default function ColdCallScopeToolbar({
  filter,
  onFilterChange,
  onRefresh,
  loading = false,
  className = '',
}: ColdCallScopeToolbarProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users || [])
          .filter(
            (u: TeamMemberOption & { active: boolean }) =>
              u.active && (u.role === 'comercial' || u.role === 'admin')
          )
          .map((u: TeamMemberOption) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
          }))
        setTeamMembers(list)
      })
      .catch(() => setTeamMembers([]))
  }, [isAdmin])

  const selectValue = filter === 'team' ? 'team' : String(filter)

  const sortedMembers = useMemo(() => {
    const list = [...teamMembers]
    if (isAdmin && user && !list.some((m) => m.id === user.id)) {
      list.push({
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'admin',
      })
    }
    return list.sort((a, b) => {
      if (a.id === user?.id) return -1
      if (b.id === user?.id) return 1
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
      return a.name.localeCompare(b.name, 'es')
    })
  }, [teamMembers, user, isAdmin])

  return (
    <div className={`flex items-center justify-end gap-2 ${className}`}>
      {isAdmin && (
        <div className="relative">
          <select
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value
              onFilterChange(v === 'team' ? 'team' : parseInt(v, 10))
            }}
            className="appearance-none border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm font-medium bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-200 max-w-[240px] truncate"
            title="Ver panel del equipo o de una persona"
          >
            <option value="team">Todo el equipo</option>
            {sortedMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id === user?.id ? `Yo — ${member.name}` : member.name}
                {member.role === 'admin' && member.id !== user?.id ? ' (admin)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl shrink-0"
        onClick={onRefresh}
        disabled={loading}
        title="Actualizar"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Megaphone,
  Plus,
  Upload,
  Phone,
  Users,
  Loader2,
  ArrowRight,
  Trash2,
} from 'lucide-react'
import type { ColdCallCampaign, ImportBatchResult } from '@/lib/coldcall/types'
import CsvImportMappingDialog from '@/components/coldcall/CsvImportMappingDialog'
import ColdCallScopeToolbar from '@/components/coldcall/ColdCallScopeToolbar'
import AdminProspectRequestsPanel from '@/components/coldcall/AdminProspectRequestsPanel'
import RequestProspectsButton from '@/components/coldcall/RequestProspectsButton'
import { coldCallScopeQuery } from '@/lib/coldcall/api-query'
import type { ColdCallFilter } from '@/lib/coldcall/scope'
import { useAuth } from '@/components/AuthContext'
import { saveLastCampaignId } from '@/lib/coldcall/last-campaign'

export default function ColdCallingCampanasTab({
  filter: filterProp,
  onFilterChange,
  reloadToken = 0,
  hideToolbar = false,
  onLoadingChange,
}: {
  filter?: ColdCallFilter
  onFilterChange?: (filter: ColdCallFilter) => void
  reloadToken?: number
  hideToolbar?: boolean
  onLoadingChange?: (loading: boolean) => void
}) {
  const router = useRouter()
  const { user } = useAuth()
  const defaultFilter: ColdCallFilter = user?.id ?? 'team'
  const [campaigns, setCampaigns] = useState<ColdCallCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [localFilter, setLocalFilter] = useState<ColdCallFilter>(filterProp ?? defaultFilter)

  const effectiveFilter = onFilterChange ? (filterProp ?? defaultFilter) : localFilter
  const setFilter = onFilterChange ?? setLocalFilter

  useEffect(() => {
    if (filterProp !== undefined) setLocalFilter(filterProp)
  }, [filterProp])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadCampaignId, setUploadCampaignId] = useState<number | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ColdCallCampaign | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const openDelete = (c: ColdCallCampaign) => {
    setDeleteTarget(c)
    setDeleteStep(1)
    setDeleteConfirmName('')
  }

  const closeDelete = () => {
    setDeleteTarget(null)
    setDeleteStep(1)
    setDeleteConfirmName('')
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/coldcall/campaigns/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      closeDelete()
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const load = () => {
    setLoading(true)
    onLoadingChange?.(true)
    fetch(`/api/coldcall/campaigns${coldCallScopeQuery(effectiveFilter, user?.id)}`)
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .catch(() => setCampaigns([]))
      .finally(() => {
        setLoading(false)
        onLoadingChange?.(false)
      })
  }

  useEffect(() => {
    load()
  }, [effectiveFilter, reloadToken])

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/coldcall/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear')
      setCreateOpen(false)
      setName('')
      setDescription('')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const campaignId = uploadCampaignId
    if (!file || !campaignId) return

    setImportFile(file)
    setMappingOpen(true)
    setUploadCampaignId(campaignId)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      {user?.role === 'admin' && <AdminProspectRequestsPanel reloadToken={reloadToken} />}

      <div
        className={`flex flex-col gap-3 sm:flex-row sm:items-center ${
          hideToolbar ? 'sm:justify-end' : 'sm:justify-between'
        }`}
      >
        {!hideToolbar && (
          <ColdCallScopeToolbar
            filter={effectiveFilter}
            onFilterChange={setFilter}
            onRefresh={load}
            loading={loading}
            className="sm:order-2"
          />
        )}
        <Button
          className={`gap-2 rounded-xl ${hideToolbar ? '' : 'sm:order-1'}`}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Nueva campaña
        </Button>
        {user?.role === 'comercial' && (
          <RequestProspectsButton size="sm" className="rounded-xl gap-1.5 sm:order-1" />
        )}
      </div>

      {importResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Importación: <strong>{importResult.rows_imported}</strong> nuevos
          {importResult.rows_updated > 0 && (
            <> · <strong>{importResult.rows_updated}</strong> actualizados</>
          )}
          {importResult.rows_skipped_dnc > 0 && (
            <> · {importResult.rows_skipped_dnc} Do Not Call</>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-14 text-center">
          <Megaphone className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Crea tu primera campaña e importa leads de Apollo.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/coldcalling/campanas/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push(`/coldcalling/campanas/${c.id}`)
                }
              }}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 cursor-pointer hover:border-gray-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  {c.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="Eliminar campaña"
                    onClick={() => openDelete(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Badge variant="secondary">{c.status === 'active' ? 'Activa' : c.status}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 px-2 py-2">
                  <p className="text-lg font-bold text-gray-900">{c.stats?.total_leads ?? 0}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Leads</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-2">
                  <p className="text-lg font-bold text-gray-900">{c.stats?.in_queue ?? 0}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">En cola</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-2">
                  <p className="text-lg font-bold text-gray-900">{c.stats?.meetings ?? 0}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Reuniones</p>
                </div>
              </div>

              {c.assignee_name && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {c.assignee_name}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5"
                  onClick={() => {
                    setUploadCampaignId(c.id)
                    fileRef.current?.click()
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  CSV Apollo
                </Button>
                <Button size="sm" className="rounded-xl gap-1.5 bg-gray-900 hover:bg-gray-800" asChild>
                  <Link
                    href={`/coldcalling/campanas/${c.id}/llamadas`}
                    onClick={() => saveLastCampaignId(c.id)}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Llamar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CsvImportMappingDialog
        open={mappingOpen}
        onOpenChange={(open) => {
          setMappingOpen(open)
          if (!open) {
            setImportFile(null)
            setUploadCampaignId(null)
          }
        }}
        campaignId={uploadCampaignId || 0}
        file={importFile}
        onImported={(result) => {
          if (result) setImportResult(result)
          load()
          if (result && result.rows_imported > 0 && uploadCampaignId) {
            router.push(`/coldcalling/campanas/${uploadCampaignId}`)
          }
        }}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={handleImport}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && closeDelete()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteStep === 1 ? '¿Eliminar campaña?' : 'Confirmación final'}
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && deleteStep === 1 && (
            <div className="space-y-3 text-sm text-gray-600">
              <p>
                Vas a eliminar la campaña <strong className="text-gray-900">{deleteTarget.name}</strong>{' '}
                y todos sus leads ({deleteTarget.stats?.total_leads ?? 0}). Esta acción no se puede deshacer.
              </p>
            </div>
          )}
          {deleteTarget && deleteStep === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Escribe <strong>{deleteTarget.name}</strong> para confirmar la eliminación.
              </p>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={deleteTarget.name}
                autoFocus
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDelete}>
              Cancelar
            </Button>
            {deleteStep === 1 ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteStep(2)}
              >
                Continuar
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteConfirmName.trim() !== deleteTarget?.name || deleting}
                onClick={confirmDelete}
              >
                {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva campaña</DialogTitle>
          </DialogHeader>
          <form onSubmit={createCampaign} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="camp_name">Nombre</Label>
              <Input
                id="camp_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Despachos Barcelona 50-200 empleados"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="camp_desc">Descripción</Label>
              <Textarea
                id="camp_desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Segmento, objetivo, notas para el equipo..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creando...' : 'Crear campaña'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

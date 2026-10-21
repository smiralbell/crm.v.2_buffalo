'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  CreditCard,
  FolderKanban,
  HelpCircle,
  Landmark,
  Loader2,
  Search,
  Sparkles,
  Users,
  Code2,
} from 'lucide-react'
import {
  AUTO_DETECTED_SAAS,
  MANUAL_TRANSFER_RULES,
  MARKETING_PAYMENT_RULES,
} from '@/lib/finance/payment-concepts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
      title="Copiar"
    >
      <span>{text}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-slate-400 group-hover:text-slate-600 shrink-0" />
      )}
    </button>
  )
}

type CrmUser = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
}

type ProjectRow = {
  kind?: string
  id: string
  name: string
  status: string
  config_ref: string | null
  contact?: { nombre: string | null; empresa: string | null } | null
}

function shortName(name: string) {
  const first = (name || '').trim().split(/\s+/)[0] || 'NOMBRE'
  return first
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function projectLabel(p: ProjectRow) {
  const client = (p.contact?.empresa || p.contact?.nombre || '').trim()
  if (client && client.toLowerCase() !== p.name.toLowerCase()) {
    return `${client} · ${p.name}`
  }
  return p.name
}

function IdFinderPanel() {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<CrmUser[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [uRes, pRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/gestion-proyecto/proyectos'),
      ])
      const uJson = await uRes.json()
      const pJson = await pRes.json()
      if (!uRes.ok) throw new Error(uJson.error || 'No se pudieron cargar usuarios')
      if (!pRes.ok) throw new Error(pJson.error || 'No se pudieron cargar proyectos')
      setUsers((uJson.users || []) as CrmUser[])
      setProjects(
        ((pJson.proyectos || []) as ProjectRow[]).filter(
          (p) => p.kind !== 'assignment' && (p.config_ref || p.name)
        )
      )
      setLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al buscar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const needle = q.trim().toLowerCase()

  const matchedUsers = useMemo(() => {
    const list = users.filter((u) => u.active !== false)
    if (!needle) return list.slice(0, 8)
    return list
      .filter(
        (u) =>
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          String(u.id) === needle ||
          u.role.toLowerCase().includes(needle)
      )
      .slice(0, 12)
  }, [users, needle])

  const matchedProjects = useMemo(() => {
    if (!needle) return projects.slice(0, 8)
    return projects
      .filter((p) => {
        const hay = [
          p.name,
          p.config_ref || '',
          p.contact?.empresa || '',
          p.contact?.nombre || '',
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      })
      .slice(0, 12)
  }, [projects, needle])

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 px-5 py-5 shadow-sm">
      <div className="text-center mb-4">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
          <Search className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Buscar IDs (sin Postgres)</h3>
        <p className="mt-1 text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
          Escribe un nombre y copia el ID. No hace falta mirar la base de datos.
        </p>
      </div>

      <div className="relative mx-auto max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Laura, CBD, BUF-2026…"
          className="h-10 rounded-xl border-slate-200 bg-white pl-9"
        />
      </div>

      {error && (
        <p className="mt-3 text-center text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && !loaded ? (
        <div className="mt-6 flex justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Usuarios (ID numérico)
            </p>
            {matchedUsers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center rounded-xl border border-dashed border-slate-200 bg-white">
                Ningún usuario coincide
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {matchedUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2 shadow-sm"
                  >
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-medium text-slate-900">{u.name}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        {u.role} · {u.email}
                      </p>
                    </div>
                    <CopyChip text={String(u.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FolderKanban className="h-3 w-3" /> Proyectos (código BUF-…)
            </p>
            {matchedProjects.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center rounded-xl border border-dashed border-slate-200 bg-white">
                Ningún proyecto coincide
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {matchedProjects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2 shadow-sm"
                  >
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-medium text-slate-900">{projectLabel(p)}</p>
                      <p className="truncate text-[10px] text-slate-500">{p.status}</p>
                    </div>
                    {p.config_ref ? (
                      <CopyChip text={p.config_ref} />
                    ) : (
                      <span className="text-[10px] text-amber-700 shrink-0">Sin código</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <DevConceptBuilder users={users} projects={projects} loading={loading && !loaded} />
    </section>
  )
}

function DevConceptBuilder({
  users,
  projects,
  loading,
}: {
  users: CrmUser[]
  projects: ProjectRow[]
  loading: boolean
}) {
  const developers = useMemo(
    () => users.filter((u) => u.active !== false && (u.role === 'developer' || u.role === 'admin')),
    [users]
  )
  const withRef = useMemo(
    () => projects.filter((p) => p.config_ref),
    [projects]
  )

  const [userId, setUserId] = useState('')
  const [projectId, setProjectId] = useState('')

  const user = developers.find((u) => String(u.id) === userId)
  const project = withRef.find((p) => p.id === projectId)

  const concept =
    user && project?.config_ref
      ? `DEV ${user.id} ${shortName(user.name)} ${project.config_ref}`
      : ''

  return (
    <div className="mt-5 rounded-xl border border-emerald-100 bg-white px-4 py-4">
      <p className="text-xs font-semibold text-slate-900 text-center sm:text-left">
        Montar el concepto DEV automáticamente
      </p>
      <p className="mt-1 text-[11px] text-slate-500 text-center sm:text-left leading-relaxed">
        Elige developer y proyecto → copias el concepto listo para el banco.
      </p>

      {loading ? (
        <div className="mt-4 flex justify-center text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-left">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Developer
            </span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
            >
              <option value="">Elegir…</option>
              {developers.map((u) => (
                <option key={u.id} value={u.id}>
                  #{u.id} · {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-left">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Proyecto
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
            >
              <option value="">Elegir…</option>
              {withRef.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.config_ref} · {projectLabel(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {concept ? (
        <div className="mt-3 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
          <p className="font-mono text-sm font-semibold text-slate-900">{concept}</p>
          <CopyChip text={concept} />
        </div>
      ) : (
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Selecciona developer y proyecto para generar el concepto.
        </p>
      )}
    </div>
  )
}

function WhereToFindIds() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div className="text-center mb-4">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <HelpCircle className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Dónde está cada cosa</h3>
        <p className="mt-1 text-xs text-slate-500">
          No hace falta entrar en Postgres. Todo está en el CRM.
        </p>
      </div>

      <div className="space-y-2.5 text-left">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold text-slate-900">ID de usuario (developer)</p>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Es el número del developer en el CRM (ej. <span className="font-mono">3</span>).
            Búscalo arriba por nombre, o ve a <strong>Usuarios</strong> en el menú lateral.
            En el concepto DEV es el primer número: <span className="font-mono">DEV 3 LAURA …</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold text-slate-900">Código de proyecto (PROYECTO-ID)</p>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Es la referencia tipo <span className="font-mono">BUF-2026-0042</span>, no el UUID
            interno. Está en <strong>Proyectos</strong> (campo de referencia / config) y también
            arriba en el buscador. Va al final del concepto DEV.
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold text-slate-900">Cliente / empresa (FAC)</p>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            No es un ID numérico: pon un nombre corto de la empresa (ej.{' '}
            <span className="font-mono">CBD</span>) y el número de factura{' '}
            <span className="font-mono">BUF-…</span>. El número de factura lo ves en{' '}
            <strong>Facturas</strong>.
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold text-slate-900">Nóminas y marketing</p>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            No llevan ID. Solo mes + apellido (nómina) o el concepto fijo MKT (Meta, Google, Email…).
          </p>
        </div>
      </div>
    </section>
  )
}

function PaymentConceptGuideContent() {
  const nomina = MANUAL_TRANSFER_RULES[0]
  const developer = MANUAL_TRANSFER_RULES[1]
  const iva303 = MANUAL_TRANSFER_RULES[2]

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <p className="text-center text-sm text-slate-600 leading-relaxed">
        En el <strong className="font-semibold text-slate-800">concepto de la transferencia</strong>{' '}
        pon exactamente el formato indicado (mayúsculas, sin tildes). Así el CRM sabe si es nómina,
        developer, IVA o marketing.
      </p>

      <IdFinderPanel />
      <WhereToFindIds />

      {/* Nóminas */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Users className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{nomina.category}</h3>
        <p className="mt-1 text-xs text-slate-500">{nomina.applies_to}</p>

        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Concepto exacto
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{nomina.format}</p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{nomina.detail}</p>
          <div className="mt-3 flex justify-center">
            <CopyChip text={nomina.example} />
          </div>
        </div>
      </section>

      {/* Developers */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Code2 className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{developer.category}</h3>
        <p className="mt-1 text-xs text-slate-500">{developer.applies_to}</p>

        <div className="mt-4 rounded-xl bg-indigo-50/50 border border-indigo-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
            Concepto exacto
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{developer.format}</p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{developer.detail}</p>
          <div className="mt-3 flex justify-center">
            <CopyChip text={developer.example} />
          </div>
        </div>
      </section>

      {/* IVA 303 */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white">
          <Landmark className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{iva303.category}</h3>
        <p className="mt-1 text-xs text-slate-500">{iva303.applies_to}</p>

        <div className="mt-4 rounded-xl bg-amber-50/60 border border-amber-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700/70">
            Concepto exacto
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{iva303.format}</p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{iva303.detail}</p>
          <div className="mt-3 flex justify-center">
            <CopyChip text={iva303.example} />
          </div>
        </div>
      </section>

      {/* Marketing */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-5">
        <div className="text-center mb-4">
          <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Marketing / captación</h3>
          <p className="mt-1 text-xs text-slate-500">
            Concepto exacto → canal y ROI en Analítica de leads
          </p>
        </div>

        <div className="space-y-2.5">
          {MARKETING_PAYMENT_RULES.map((rule) => (
            <div
              key={rule.token}
              className="rounded-xl border border-white bg-white px-4 py-3 shadow-sm text-center sm:text-left"
            >
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                <p className="text-xs font-semibold text-slate-900">{rule.label}</p>
                <p className="text-[10px] text-slate-500">{rule.model}</p>
              </div>
              {rule.concepts.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Sin gasto: web orgánica no lleva inversión.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-1.5">
                  {rule.concepts.map((c) => (
                    <div key={c.example} className="flex flex-col gap-0.5 items-center sm:items-start">
                      <CopyChip text={c.example} />
                      <span className="text-[10px] text-slate-400 px-0.5">{c.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SaaS auto */}
      <section className="rounded-2xl border border-dashed border-slate-200 px-5 py-4 text-center">
        <div className="mx-auto mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <CreditCard className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Plataformas SaaS (tarjeta)</h3>
        <p className="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-md mx-auto">
          Twilio, Cursor, Retell, OpenAI… se detectan solos. No hace falta concepto. Solo usa{' '}
          <span className="font-mono text-slate-600">PLT {'{servicio}'}</span> si pagas por
          transferencia.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {AUTO_DETECTED_SAAS.map((name) => (
            <span
              key={name}
              className="rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-slate-400 leading-relaxed">
        Cobros de clientes:{' '}
        <span className="font-mono text-slate-500">FAC {'{cliente}'} {'{nº factura}'}</span>
        . Los gastos variables / gestoría no llevan plantilla fija.
      </p>
    </div>
  )
}

export default function PaymentConceptGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-9 gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shrink-0',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <Landmark className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Cómo pagar</span>
        <span className="sm:hidden">Pagos</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 sm:rounded-2xl">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5 text-center sm:text-center space-y-0">
            <div className="flex flex-col items-center gap-2 pr-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                <Landmark className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  Cómo poner el concepto al pagar
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Busca IDs · nóminas · developers · marketing
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-5 py-6 sm:px-8">
            {open && <PaymentConceptGuideContent />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

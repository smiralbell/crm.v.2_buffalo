import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Clock, ListTodo, Phone, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FOLLOW_KINDS, type FollowData, type FollowKind, type FollowLead } from '@/lib/marketing/sales.types'
import { OutcomeDialog } from '@/components/marketing/LeadOutcome'
import { ErrorBox, Lbl, call, field, isoDay, json, shortDay } from '@/components/marketing/shared'

const API = '/api/marketing/followups'
const DEFAULT_TASK: Record<FollowKind, string> = {
  propuesta: 'Preguntar por la propuesta',
  reunion: 'Enviar el siguiente paso tras la reunión',
  nuevo: 'Primer contacto',
  parado: 'Retomar el contacto',
}

/** Leads a los que les toca una acción, con las acciones más habituales a un clic. */
export default function FollowUps() {
  const [data, setData] = useState<FollowData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [task, setTask] = useState<FollowLead | null>(null)
  const [f, setF] = useState({ title: '', user_id: '', due_date: '' })
  const [lost, setLost] = useState<{ id: number; name: string } | null>(null)
  const [more, setMore] = useState<Partial<Record<FollowKind, boolean>>>({})

  const load = useCallback(
    () =>
      call<FollowData>(API)
        .then((d) => {
          setData(d)
          setError(null)
        })
        .catch((e) => setError(e.message)),
    []
  )
  useEffect(() => {
    void load()
  }, [load])

  const act = async (leadId: number, body: Record<string, unknown>) => {
    setBusy(leadId)
    setError(null)
    try {
      await call(API, json('POST', { lead_id: leadId, ...body }))
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      setBusy(null)
    }
  }
  const openTask = (l: FollowLead) => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    const mine = data?.people.some((p) => p.id === data.me.id)
    setF({ title: `${DEFAULT_TASK[l.kind]}: ${l.name}`, user_id: mine && data ? String(data.me.id) : '', due_date: isoDay(d) })
    setTask(l)
  }
  const btn = 'inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900 disabled:opacity-50'

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Personas que ya tenéis y que llevan días sin movimiento. Se actualiza solo; quien tiene reunión próxima no sale.</p>
      <ErrorBox text={error} />
      {!data && !error && <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />}
      {data && data.leads.length === 0 && (
        <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-900">Todo al día: ningún lead parado.</p>
      )}
      {data &&
        FOLLOW_KINDS.filter((k) => data.counts[k.id] > 0).map((k) => {
          const all = data.leads.filter((l) => l.kind === k.id)
          const list = more[k.id] ? all : all.slice(0, 10)
          return (
            <Card key={k.id} className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800">
                  {k.label} <span className="font-normal text-gray-400">· {all.length}</span>
                </CardTitle>
                <p className="text-xs text-gray-400">{k.hint}</p>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-gray-50">
                  {list.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/leads/${l.id}`} className="font-medium text-gray-900 hover:underline">
                          {l.name}
                          {l.empresa && <span className="font-normal text-gray-500"> · {l.empresa}</span>}
                        </Link>
                        <p className="text-xs text-gray-400">
                          <span className={l.days >= k.days * 2 ? 'font-semibold text-red-600' : 'text-amber-700'}>
                            {l.exact ? '' : 'al menos '}
                            {l.days} {l.days === 1 ? 'día' : 'días'}
                          </span>
                          {` · ${l.canal_label}`}
                          {l.stage && ` · ${l.stage}`}
                          {l.task && ` · Tarea: ${l.task.owner ?? '—'}${l.task.due_date ? ` (${shortDay(l.task.due_date)})` : ''}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {l.telefono && (
                          <a href={`tel:${l.telefono.replace(/[^\d+]/g, '')}`} className={btn}>
                            <Phone className="h-3 w-3" /> Llamar
                          </a>
                        )}
                        <button type="button" className={btn} disabled={busy === l.id} onClick={() => act(l.id, { action: 'contacted' })}>
                          <Check className="h-3 w-3" /> Contactado
                        </button>
                        <button type="button" className={btn} disabled={busy === l.id} onClick={() => openTask(l)}>
                          <ListTodo className="h-3 w-3" /> Tarea
                        </button>
                        <button type="button" className={btn} disabled={busy === l.id} onClick={() => act(l.id, { action: 'snooze', days: 7 })}>
                          <Clock className="h-3 w-3" /> 7 días
                        </button>
                        <button type="button" className={btn} disabled={busy === l.id} onClick={() => setLost({ id: l.id, name: l.name })}>
                          <XCircle className="h-3 w-3" /> Perdido
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {all.length > 10 && (
                  <button type="button" className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-900" onClick={() => setMore((m) => ({ ...m, [k.id]: !m[k.id] }))}>
                    {more[k.id] ? 'Ver menos' : `Ver los ${all.length}`}
                  </button>
                )}
              </CardContent>
            </Card>
          )
        })}

      <Dialog open={!!task} onOpenChange={(o) => !o && setTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <ErrorBox text={error} />
            <label className="block">
              <Lbl>Tarea</Lbl>
              <input className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} name="task-title" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {data?.can_assign ? (
                <label className="block">
                  <Lbl>Para</Lbl>
                  <select className={field} value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} name="task-user">
                    <option value="">Elige…</option>
                    {data.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="self-end text-xs text-gray-400">La tarea será para ti.</p>
              )}
              <label className="block">
                <Lbl>Para cuándo</Lbl>
                <input type="date" className={field} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
              </label>
            </div>
            <p className="text-xs text-gray-400">Se crea como una tarea normal del CRM y avisa a esa persona como siempre.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setTask(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="rounded-xl"
                disabled={!f.title.trim() || (data?.can_assign && !f.user_id) || busy != null}
                onClick={async () => {
                  if (!task) return
                  const ok = await act(task.id, { action: 'task', title: f.title, user_id: f.user_id ? Number(f.user_id) : null, due_date: f.due_date || null })
                  if (ok) setTask(null)
                }}
              >
                Crear tarea
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <OutcomeDialog lead={lost} startLost onClose={() => setLost(null)} onSaved={() => void load()} />
    </div>
  )
}

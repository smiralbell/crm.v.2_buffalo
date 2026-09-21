'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ClipboardCopy,
  ExternalLink,
  FileCode2,
  Loader2,
  Plus,
  Trash2,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingFormSubmission, OnboardingPublicForm } from '@/lib/onboarding/public-forms'
import { getPublicFormsBaseUrl, publicFormUrl } from '@/lib/onboarding/public-forms-url'

type Props = {
  leadId: number
}

const HTML_HELP = `CÓMO DEBE GUARDARSE EL ENVÍO EN EL CRM
=====================================

El CRM inyecta en la página esta función (no la inventes tú):

  window.BuffaloCRM.submit({ campo1: "valor", campo2: "valor", ... })

Eso hace POST a /api/f/{slug} y guarda la fila en
onboarding_form_submissions. Sin esa llamada (o un <form> nativo),
NO se guarda nada — aunque el HTML muestre “¡Enviado!”.


── Opción recomendada para cuestionarios SPA (Delokos, La Llar…) ──

1) Guarda las respuestas en un objeto JS, p.ej. answers = { nombre, area, ... }

2) En el botón “Enviar”, llama SIEMPRE a BuffaloCRM.submit con un objeto plano:

function enviarAlCRM() {
  if (!window.BuffaloCRM || typeof BuffaloCRM.submit !== "function") {
    alert("Error: el CRM no está disponible. Abre el link /f/… del CRM, no el HTML suelto.");
    return;
  }
  BuffaloCRM.submit({
    empresa: "La Llar del Vidre",
    formulario: "Diagnóstico equipo",
    contacto_nombre: answers.nombre || "",
    // ...todas las respuestas (claves = nombres de campo):
    ...answers
  }).then(function (ok) {
    if (ok) {
      // aquí tu modal de gracias
    } else {
      alert("No se han podido guardar las respuestas. Revisa la conexión.");
    }
  });
}

3) NO uses Web3Forms / email / solo localStorage como único envío.
   Puedes seguir mostrando un modal, pero el guardado real es BuffaloCRM.submit.


── Opción B — formulario HTML clásico ──

<form>
  <label>Nombre <input name="contacto_nombre" required></label>
  <label>Email <input type="email" name="contacto_email" required></label>
  <label>Empresa <input name="empresa"></label>
  <label>Mensaje <textarea name="notas"></textarea></label>
  <button type="submit">Enviar</button>
</form>

Cada campo DEBE tener atributo name. No hace falta action ni method:
el CRM captura el submit solo.


── Qué NO funciona ──

- Solo “Enviado!” en pantalla sin BuffaloCRM.submit ni <form> con name=
- Abrir el .html en local (file://) en vez del link /f/tu-slug
- Enviar solo por email / Web3Forms sin copiar también a BuffaloCRM.submit


Nombres útiles (opcionales): contacto_nombre, contacto_email,
contacto_tel, empresa, notas. Cualquier otra clave también se guarda.`

export default function OnboardingPublicFormsPanel({ leadId }: Props) {
  const [forms, setForms] = useState<OnboardingPublicForm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('Formulario onboarding')
  const [slug, setSlug] = useState('')
  const [html, setHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [viewSubs, setViewSubs] = useState<OnboardingPublicForm | null>(null)
  const [submissions, setSubmissions] = useState<OnboardingFormSubmission[]>([])
  const [subsLoading, setSubsLoading] = useState(false)

  // El dominio de formularios llega del servidor (runtime). Así basta con
  // cambiar FORMS_PUBLIC_HOST en EasyPanel y reiniciar: sin rebuild.
  const [serverFormsBase, setServerFormsBase] = useState('')
  const fallbackFormsBase = useMemo(() => getPublicFormsBaseUrl(), [])
  const formsBase = serverFormsBase || fallbackFormsBase
  const usingCrmOrigin =
    typeof window !== 'undefined' &&
    (!formsBase || formsBase === window.location.origin)

  const publicUrlPreview = useMemo(() => {
    const s = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return s ? publicFormUrl(s, formsBase) : publicFormUrl('…', formsBase)
  }, [formsBase, slug])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/public-forms`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los formularios')
      setForms(data.forms || [])
      setServerFormsBase(typeof data.formsBaseUrl === 'string' ? data.formsBaseUrl : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setTitle('Formulario onboarding')
    setSlug('')
    setHtml(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Formulario</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 40px auto; padding: 0 16px; color: #111; }
    label { display: block; margin-bottom: 14px; font-size: 14px; }
    input, textarea { width: 100%; margin-top: 6px; padding: 10px 12px; border: 1px solid #ddd; border-radius: 10px; font: inherit; }
    button { margin-top: 8px; padding: 12px 18px; border: 0; border-radius: 12px; background: #111; color: #fff; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Datos de onboarding</h1>
  <form>
    <label>Nombre completo
      <input name="contacto_nombre" required />
    </label>
    <label>Email
      <input type="email" name="contacto_email" required />
    </label>
    <label>Teléfono
      <input name="contacto_tel" />
    </label>
    <label>Empresa
      <input name="empresa" />
    </label>
    <label>Notas
      <textarea name="notas" rows="4"></textarea>
    </label>
    <button type="submit">Enviar</button>
  </form>
</body>
</html>`)
    setCreateOpen(true)
  }

  const create = async () => {
    if (!slug.trim() || !html.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/public-forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, html }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear')
      setCreateOpen(false)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (form: OnboardingPublicForm) => {
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/public-forms`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: form.id, is_active: !form.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    }
  }

  const remove = async (form: OnboardingPublicForm) => {
    if (!confirm(`¿Eliminar el formulario /f/${form.slug}? Se borrarán también las respuestas.`)) return
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/public-forms`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: form.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    }
  }

  const copyLink = async (formSlug: string) => {
    const url = publicFormUrl(formSlug, formsBase)
    try {
      await navigator.clipboard.writeText(url)
      alert('Link copiado')
    } catch {
      prompt('Copia el link:', url)
    }
  }

  const openSubmissions = async (form: OnboardingPublicForm) => {
    setViewSubs(form)
    setSubsLoading(true)
    try {
      const res = await fetch(
        `/api/onboarding/projects/${leadId}/public-forms?formId=${encodeURIComponent(form.id)}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las respuestas')
      setSubmissions(data.submissions || [])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
      setViewSubs(null)
    } finally {
      setSubsLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Formularios públicos
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Pega un HTML, elige el nombre del link y compártelo con el cliente. No puede entrar al CRM.
          </p>
          {usingCrmOrigin && (
            <p className="text-[11px] text-amber-800 mt-2 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              Configura <code className="font-mono">FORMS_PUBLIC_HOST</code> (ej.{' '}
              <code className="font-mono">forms.agenciabuffalo.es</code>) en el servidor para que el
              link no use el dominio del CRM ni exponga el login.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <FileCode2 className="h-3.5 w-3.5 mr-1.5" />
            Cómo preparar el HTML
          </Button>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Crear formulario
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : forms.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Aún no hay formularios. Crea uno y envía el link al cliente.
        </p>
      ) : (
        <ul className="space-y-3">
          {forms.map((form) => (
            <li
              key={form.id}
              className="rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{form.title}</p>
                <p className="text-xs text-gray-500 font-mono truncate">
                  {publicFormUrl(form.slug, formsBase)}
                  <span
                    className={cn(
                      'ml-2 inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-semibold',
                      form.is_active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {form.is_active ? 'Activo' : 'Pausado'}
                  </span>
                  <span className="ml-2 text-gray-400">
                    {form.submission_count ?? 0} respuesta
                    {(form.submission_count ?? 0) === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => copyLink(form.slug)}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copiar link
                </button>
                <a
                  href={publicFormUrl(form.slug, formsBase)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir
                </a>
                <button
                  type="button"
                  onClick={() => openSubmissions(form)}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Inbox className="h-3.5 w-3.5" />
                  Respuestas
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(form)}
                  className="inline-flex items-center px-2.5 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {form.is_active ? 'Pausar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(form)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-100 text-red-600 hover:bg-red-50"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear formulario público</DialogTitle>
            <DialogDescription>
              Pega el HTML completo y define el nombre del link que compartirás con el cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="form_title">
                  Título interno
                </label>
                <Input
                  id="form_title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Formulario onboarding"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="form_slug">
                  Nombre del link *
                </label>
                <Input
                  id="form_slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="aic-onboarding"
                  className="font-mono"
                />
                <p className="text-[11px] text-gray-500 break-all">{publicUrlPreview}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="form_html">
                HTML *
              </label>
              <Textarea
                id="form_html"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={16}
                className="font-mono text-xs min-h-[280px]"
                placeholder="Pega aquí el HTML del formulario…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={saving || !slug.trim() || !html.trim()}>
              {saving ? 'Creando…' : 'Generar link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documentación HTML</DialogTitle>
            <DialogDescription>
              Requisitos para que los datos se guarden en Postgres correctamente.
            </DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-700 font-sans">
            {HTML_HELP}
          </pre>
          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewSubs} onOpenChange={(o) => !o && setViewSubs(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Respuestas · {viewSubs?.title}</DialogTitle>
            <DialogDescription>
              Datos guardados en <code className="text-xs">onboarding_form_submissions</code>
            </DialogDescription>
          </DialogHeader>
          {subsLoading ? (
            <div className="py-10 flex justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Todavía no hay respuestas.</p>
          ) : (
            <ul className="space-y-3">
              {submissions.map((s) => (
                <li key={s.id} className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3">
                  <p className="text-[11px] text-gray-400 mb-2">
                    {new Date(s.created_at).toLocaleString('es-ES')}
                  </p>
                  <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {Object.entries(s.payload).map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {k}
                        </dt>
                        <dd className="text-gray-900 break-words">{String(v ?? '')}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

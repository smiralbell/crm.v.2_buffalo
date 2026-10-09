/**
 * Orquestador del módulo Blog.
 *
 * Cada pocos minutos (tick):
 *  1. Planifica los huecos aleatorios de las próximas semanas.
 *  2. Asigna un tema a cada hueco que se acerca (calendario de Sergi,
 *     propuestas aceptadas, temas manuales o, en los huecos de
 *     actualidad, una noticia).
 *  3. Hace avanzar cada artículo: brief (N días antes) → borrador,
 *     control SEO e imágenes (M días antes) → revisión → publicación
 *     en su hora.
 * Todo se puede lanzar también a mano desde el panel.
 */
import { getRules, getSettings } from './config'
import { calendarTopics } from './calendar-seed'
import { findNews } from './research'
import { ensurePlanned } from './schedule'
import { blockingFailures, runChecks } from './seo'
import * as store from './store'
import type { BlogRules, BlogSettings, Post, RunLog, Slot, Topic } from './types'
import { checkAndFix, log, makeBrief, makeDraft, makeImages } from './writer'

const DAY = 24 * 3600 * 1000
const nowIso = () => new Date().toISOString()

/* ---------------- Registro y gasto ---------------- */

export async function record(kind: string, ok: boolean, message: string, extra: Partial<RunLog> = {}) {
  await store.put<RunLog>('runs', { id: store.newId('run-'), at: nowIso(), kind, ok, message, ...extra })
}

export async function monthSpend(): Promise<number> {
  const month = nowIso().slice(0, 7)
  const runs = await store.list<RunLog>('runs')
  return Math.round(runs.filter((r) => r.at.startsWith(month)).reduce((n, r) => n + (r.usd || 0), 0) * 100) / 100
}

/* ---------------- Arranque ---------------- */

export async function bootstrap() {
  const topics = await store.list<Topic>('topics')
  if (!topics.some((t) => t.source === 'calendario')) await store.putMany('topics', calendarTopics())
}

export function emptyPost(t: Partial<Topic> & { title: string; theme: Topic['theme'] }, s: BlogSettings): Post {
  const now = nowIso()
  return {
    id: store.newId('post-'),
    topicId: t.id,
    status: 'idea',
    kind: t.kind || 'articulo',
    theme: t.theme,
    title: t.title,
    h1: t.title,
    slug: '',
    metaDescription: '',
    keyword: t.keyword || '',
    secondary: [],
    excerpt: '',
    body: '',
    faq: [],
    internalLinks: [],
    externalLinks: [],
    images: [],
    author: s.site.authorName,
    updatedAt: now,
    createdAt: now,
    history: [{ at: now, event: 'Creado', detail: t.source ? `Tema de ${t.source}` : undefined }],
  }
}

/* ---------------- Asignación de temas a huecos ---------------- */

function nextTopic(topics: Topic[], s: BlogSettings, kind: Slot['kind']): Topic | null {
  const queue = topics.filter((t) => t.status === 'pendiente').sort((a, b) => a.order - b.order)
  if (kind === 'actualidad') return queue.find((t) => t.source === 'noticia') || null
  const chosen = queue.filter((t) => t.source === 'propuesta' || t.source === 'manual')
  const cal = queue.filter((t) => t.source === 'calendario')
  if (s.topics.source === 'calendario') return cal[0] || chosen[0] || null
  if (s.topics.source === 'propuestas') return chosen[0] || null
  return chosen[0] || cal[0] || null // mixto: primero lo que elegís, luego el calendario
}

async function assignSlots(s: BlogSettings, slots: Slot[]) {
  const horizon = Date.now() + (s.leadTimes.briefDaysBefore + 4) * DAY
  const topics = await store.list<Topic>('topics')
  for (const slot of slots) {
    if (slot.postId || new Date(slot.at).getTime() > horizon || new Date(slot.at).getTime() < Date.now()) continue
    let topic = nextTopic(topics, s, slot.kind)
    if (!topic && slot.kind === 'actualidad') {
      // No hay noticia elegida: se busca la más relevante de las dos últimas semanas
      try {
        const posts = await store.list<Post>('posts')
        const { topics: news, usd } = await findNews(s, 3, posts)
        await record('noticias', true, `${news.length} noticias relevantes encontradas para el hueco del ${slot.at.slice(0, 10)}`, { usd })
        news.forEach((n, i) => (n.status = i === 0 ? 'pendiente' : 'sugerido'))
        await store.putMany('topics', news)
        topics.push(...news)
        topic = news[0] || null
      } catch (e) {
        await record('noticias', false, e instanceof Error ? e.message : String(e))
      }
      // Si no hay ninguna noticia que valga la pena, el hueco pasa a ser normal
      if (!topic) {
        slot.kind = 'normal'
        topic = nextTopic(topics, s, 'normal')
      }
    }
    if (!topic) continue
    const post = emptyPost(topic, s)
    post.scheduledAt = slot.at
    if (topic.source === 'noticia') post.kind = 'actualidad'
    topic.status = 'usado'
    slot.postId = post.id
    await store.put('posts', post)
    await store.put('topics', topic)
    await store.put('slots', slot)
  }
}

/* ---------------- Pasos de un artículo ---------------- */

async function saveImagesApart(post: Post) {
  for (const img of post.images || []) {
    if (!img.dataUrl) continue
    const ext = img.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : img.dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
    await store.put('images', { id: `${post.id}-${img.slot}`, dataUrl: img.dataUrl })
    img.file = `${img.slot}.${ext}`
    delete img.dataUrl
  }
}

export type Step = 'brief' | 'borrador' | 'control' | 'imagenes' | 'todo'

const running = new Set<string>()
export const isRunning = (postId: string) => running.has(postId)

/** Lanza un paso en segundo plano (puede tardar minutos) y vuelve enseguida. */
export function startStep(postId: string, step: Step, by?: string) {
  if (running.has(postId)) throw new Error('Este artículo ya se está procesando')
  void runStep(postId, step, by).catch(() => undefined)
}

export async function runStep(postId: string, step: Step, by?: string): Promise<Post> {
  if (running.has(postId)) throw new Error('Este artículo ya se está procesando')
  running.add(postId)
  const s = await getSettings()
  const rules = await getRules()
  try {
    const all = await store.list<Post>('posts')
    const post = all.find((p) => p.id === postId)
    if (!post) throw new Error('Artículo no encontrado')
    const topic = post.topicId ? await store.get<Topic>('topics', post.topicId) : null
    const before = post.cost?.usd || 0

    // Se guarda tras cada fase para que el panel vaya mostrando el avance
    const save = () => store.put('posts', post)
    if (post.manual) {
      // Escrito por una persona: el motor revisa y hace las imágenes, pero no reescribe el texto
      if (step === 'brief') await makeBrief(post, topic, s, rules, all).then(save)
    } else {
      if (step === 'brief' || step === 'todo' || !post.brief) await makeBrief(post, topic, s, rules, all).then(save)
      if (step === 'borrador' || step === 'todo') await makeDraft(post, s, rules).then(save)
      if (['borrador', 'control', 'todo'].includes(step)) await checkAndFix(post, s, rules).then(save)
    }
    if (step === 'imagenes' || step === 'todo' || (step === 'borrador' && !post.images?.length)) {
      await makeImages(post, s, rules)
      await saveImagesApart(post)
    }
    if (step !== 'brief' && post.body) afterChecks(post, s, rules)
    if (by) log(post, `Paso «${step}» lanzado a mano`, undefined, by)
    await store.put('posts', post)
    await record(step, true, `${post.h1 || post.title}`, { postId, usd: (post.cost?.usd || 0) - before })
    return post
  } catch (e) {
    await record(step, false, e instanceof Error ? e.message : String(e), { postId })
    throw e
  } finally {
    running.delete(postId)
  }
}

/** Tras el control: a revisión, o aprobado directamente en modo automático si todo está bien. */
function afterChecks(post: Post, s: BlogSettings, rules: BlogRules) {
  const { checks, score } = runChecks(post, s, rules)
  post.checks = checks
  post.score = score
  if (!['borrador', 'brief'].includes(post.status)) return
  const ok = blockingFailures(checks).length === 0
  const gaps = /\[SERGI:/.test(post.body)
  if (s.publishing.mode === 'automatico' && ok && !gaps) {
    post.status = 'aprobado'
    log(post, 'Aprobado automáticamente', `Nota ${score}/100`)
  } else {
    post.status = 'revision'
    log(post, 'Pendiente de revisión', ok ? `Nota ${score}/100` : 'Con fallos de control: revisar antes de aprobar')
  }
}

export async function publishPost(post: Post, by?: string) {
  post.status = 'publicado'
  post.publishedAt = post.publishedAt || nowIso()
  log(post, 'Publicado', 'Incluido en el paquete del blog', by)
  await store.put('posts', post)
  await record('publicar', true, post.h1, { postId: post.id })
}

/* ---------------- Tick ---------------- */

let ticking = false

export async function tick(reason = 'programado'): Promise<{ ok: boolean; message: string }> {
  if (ticking) return { ok: false, message: 'Ya hay una ejecución en marcha' }
  ticking = true
  try {
    const s = await getSettings()
    if (!s.enabled) return { ok: true, message: 'El motor está en pausa (Configuración → Activar)' }
    await bootstrap()
    const slots = await ensurePlanned(s)
    const overBudget = (await monthSpend()) >= s.budget.monthlyUsd
    if (!overBudget) await assignSlots(s, slots)

    const posts = await store.list<Post>('posts')
    const now = Date.now()
    for (const post of posts) {
      if (!post.scheduledAt || ['publicado', 'rechazado'].includes(post.status)) continue
      const until = new Date(post.scheduledAt).getTime() - now
      try {
        if (!overBudget && post.status === 'idea' && until <= s.leadTimes.briefDaysBefore * DAY) await runStep(post.id, 'brief')
        else if (!overBudget && post.status === 'brief' && until <= s.leadTimes.draftDaysBefore * DAY) await runStep(post.id, 'borrador')
        else if (post.status === 'revision' && s.publishing.mode === 'revision_con_plazo') {
          const since = post.history.find((h) => h.event === 'Pendiente de revisión')?.at
          const fails = blockingFailures(post.checks || []).length
          if (since && !fails && !/\[SERGI:/.test(post.body) && now - new Date(since).getTime() >= s.publishing.autoPublishAfterHours * 3600 * 1000) {
            post.status = 'aprobado'
            log(post, 'Aprobado por plazo', `Nadie lo rechazó en ${s.publishing.autoPublishAfterHours} h`)
            await store.put('posts', post)
          }
        } else if (post.status === 'aprobado' && until <= 0) await publishPost(post)
      } catch {
        // ya queda registrado en runs; seguimos con el resto
      }
    }
    if (overBudget) await record('presupuesto', false, `Gasto del mes ≥ ${s.budget.monthlyUsd} $: no se generan artículos nuevos`)
    return { ok: true, message: `Tick (${reason}) completado` }
  } finally {
    ticking = false
  }
}

/* ---------------- Programador en proceso ---------------- */

const g = globalThis as unknown as { __blogTimer?: NodeJS.Timeout }

/** Arranca el programador la primera vez que se usa el módulo. En EasyPanel también se puede llamar a /api/blog/cron. */
export function ensureRunner() {
  if (g.__blogTimer || process.env.BLOG_SCHEDULER === '0') return
  g.__blogTimer = setInterval(() => void tick('programado').catch(() => undefined), 10 * 60 * 1000)
}

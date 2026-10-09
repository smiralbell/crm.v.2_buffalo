/**
 * API del módulo Blog. Un solo router para que el módulo quede aislado.
 * Todas las rutas exigen sesión de administrador, salvo /api/blog/cron,
 * que usa CRON_SECRET para que EasyPanel pueda lanzar el motor.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { getRules, getSettings, rulesHistory, saveRules, saveSettings } from '@/lib/blog/config'
import { bootstrap, cancelJob, emptyPost, ensureRunner, isRunning, monthSpend, publishPost, record, startAutoPost, startStep, syncWeb, tick, type Step } from '@/lib/blog/engine'
import { allThemes } from '@/lib/blog/defaults'
import { buildPackage, testConnection } from '@/lib/blog/publish'
import { ftpConfigured } from '@/lib/blog/ftp'
import { articleHtml, indexHtml, type ImageResolver } from '@/lib/blog/render'
import { findNews, proposeTopics } from '@/lib/blog/research'
import { reshuffleWeek, ensurePlanned } from '@/lib/blog/schedule'
import { runChecks, slugify } from '@/lib/blog/seo'
import * as store from '@/lib/blog/store'
import type { BlogRules, BlogSettings, Post, RunLog, Slot, Topic } from '@/lib/blog/types'
import { log } from '@/lib/blog/writer'

export const config = { api: { bodyParser: { sizeLimit: '8mb' }, responseLimit: false } }

const EDITABLE: (keyof Post)[] = ['title', 'h1', 'slug', 'metaDescription', 'keyword', 'secondary', 'excerpt', 'body', 'faq', 'theme', 'kind', 'scheduledAt', 'imagePrompts']

/** Resolver de imágenes para la vista previa: lee las imágenes guardadas y las incrusta. */
async function previewImages(posts: Post[]): Promise<ImageResolver> {
  const map = new Map<string, string>()
  for (const p of posts) for (const img of p.images || []) {
    const doc = await store.get<{ id: string; dataUrl: string }>('images', `${p.id}-${img.slot}`)
    if (doc?.dataUrl) map.set(`${p.id}-${img.slot}`, doc.dataUrl)
  }
  return (p, slot) => map.get(`${p.id}-${slot}`) || null
}

/** Para el listado: sin el cuerpo ni el brief, que pesan. */
const light = (p: Post) => {
  const { body, brief, history, ...rest } = p
  return {
    ...rest,
    words: body ? body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length : 0,
    gaps: (body.match(/\[SERGI:/g) || []).length,
    lastEvent: history?.[0],
    demand: brief?.research?.demand,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const route = (req.query.route as string[]) || []
  const [a, b, c] = route

  // Lanzamiento externo (cron de EasyPanel): Authorization: Bearer CRON_SECRET
  if (a === 'cron') {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'No autorizado' })
    return res.status(200).json(await tick('cron'))
  }

  let user
  try {
    user = await requireAdminAPI(req, res)
  } catch {
    return
  }
  const by = user.email

  try {
    const st = await store.storeStatus()
    if (!st.ok) return res.status(200).json({ setupRequired: true, message: st.message })
    ensureRunner()
    await bootstrap()

    /* ---------- Estado general ---------- */
    if (a === 'state' && req.method === 'GET') {
      const [settings, rules, posts, topics, slots, runs, spend, history] = await Promise.all([
        getSettings(), getRules(), store.list<Post>('posts'), store.list<Topic>('topics'), store.list<Slot>('slots'), store.list<RunLog>('runs'), monthSpend(), rulesHistory(),
      ])
      return res.status(200).json({
        settings, rules, rulesHistory: history,
        posts: posts.map(light),
        topics: topics.sort((x, y) => x.order - y.order),
        slots: slots.sort((x, y) => x.at.localeCompare(y.at)),
        runs: runs.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 60),
        status: {
          store: st.mode,
          spend,
          keys: { openrouter: !!process.env.OPENROUTER_API_KEY, openai: !!process.env.OPENAI_API_KEY, cron: !!process.env.CRON_SECRET, ftp: ftpConfigured() },
        },
      })
    }

    /* ---------- Configuración y reglas ---------- */
    if (a === 'settings' && req.method === 'PUT') return res.status(200).json({ settings: await saveSettings(req.body as BlogSettings, by) })
    if (a === 'rules' && req.method === 'PUT') return res.status(200).json({ rules: await saveRules(req.body as BlogRules, by) })

    /* ---------- Motor ---------- */
    if (a === 'tick' && req.method === 'POST') {
      const s = await getSettings()
      if (!s.enabled) {
        // Ejecución puntual aunque el motor esté en pausa: sólo planifica
        await ensurePlanned(s)
        return res.status(200).json({ ok: true, message: 'Calendario planificado. El motor está en pausa: actívalo en Configuración para que avance solo.' })
      }
      return res.status(200).json(await tick('manual'))
    }

    /* ---------- Calendario ---------- */
    if (a === 'schedule') {
      const s = await getSettings()
      if (b === 'plan' && req.method === 'POST') return res.status(200).json({ slots: await ensurePlanned(s) })
      if (b === 'reshuffle' && req.method === 'POST') return res.status(200).json({ slots: await reshuffleWeek(String(req.body.week), s) })
    }
    if (a === 'slot' && b && req.method === 'POST') {
      const slot = await store.get<Slot>('slots', b)
      if (!slot) return res.status(404).json({ error: 'Hueco no encontrado' })
      if (c === 'lock') slot.locked = !slot.locked
      if (c === 'kind') slot.kind = slot.kind === 'actualidad' ? 'normal' : 'actualidad'
      if (c === 'assign') {
        const postId = String(req.body.postId || '')
        // Un artículo sólo puede estar en un hueco
        for (const other of await store.list<Slot>('slots')) if (other.postId === postId && other.id !== slot.id) { delete other.postId; await store.put('slots', other) }
        slot.postId = postId || undefined
        if (postId) {
          const p = await store.get<Post>('posts', postId)
          if (p) { p.scheduledAt = slot.at; log(p, 'Asignado a un hueco', slot.at, by); await store.put('posts', p) }
        }
      }
      if (c === 'delete') { await store.remove('slots', slot.id); return res.status(200).json({ ok: true }) }
      await store.put('slots', slot)
      return res.status(200).json({ slot })
    }

    /* ---------- Temas ---------- */
    if (a === 'topics') {
      const s = await getSettings()
      const rules = await getRules()
      if (b === 'propose' && req.method === 'POST') {
        const [topics, posts] = await Promise.all([store.list<Topic>('topics'), store.list<Post>('posts')])
        const { topics: found, usd } = await proposeTopics(
          { focus: req.body.focus ? String(req.body.focus) : undefined, theme: req.body.theme || '', count: Number(req.body.count) || s.topics.proposalsPerSearch },
          s, rules, topics, posts
        )
        found.forEach((t) => (t.status = 'sugerido'))
        await store.putMany('topics', found)
        await record('propuestas', true, `${found.length} temas propuestos${req.body.focus ? ' sobre «' + req.body.focus + '»' : ''}`, { usd })
        return res.status(200).json({ topics: found })
      }
      if (b === 'news' && req.method === 'POST') {
        const posts = await store.list<Post>('posts')
        const { topics: found, usd } = await findNews(s, Number(req.body.count) || 4, posts)
        found.forEach((t) => (t.status = 'sugerido'))
        await store.putMany('topics', found)
        await record('noticias', true, `${found.length} noticias relevantes`, { usd })
        return res.status(200).json({ topics: found })
      }
      if (b === 'new' && req.method === 'POST') {
        const all = await store.list<Topic>('topics')
        const t: Topic = {
          id: store.newId('man-'), source: 'manual', order: Math.min(0, ...all.map((x) => x.order)) - 1,
          title: String(req.body.title || '').trim(), keyword: String(req.body.keyword || '').trim(), theme: req.body.theme || 'A',
          kind: req.body.kind || 'articulo', destination: req.body.destination || '/auditoria/', ownMaterial: req.body.ownMaterial || 'Banco de ideas',
          notes: req.body.notes, status: 'pendiente', createdAt: new Date().toISOString(),
        }
        if (!t.title) return res.status(400).json({ error: 'Falta el título' })
        await store.put('topics', t)
        return res.status(200).json({ topic: t })
      }
      if (b && req.method === 'POST') {
        const t = await store.get<Topic>('topics', b)
        if (!t) return res.status(404).json({ error: 'Tema no encontrado' })
        if (c === 'accept') {
          // Las propuestas aceptadas pasan delante del calendario
          const all = await store.list<Topic>('topics')
          t.status = 'pendiente'
          t.order = req.body.first ? Math.min(0, ...all.map((x) => x.order)) - 1 : t.order
        }
        if (c === 'discard') t.status = 'descartado'
        if (c === 'restore') t.status = 'pendiente'
        if (c === 'order') t.order = Number(req.body.order)
        if (c === 'update') Object.assign(t, { title: req.body.title ?? t.title, keyword: req.body.keyword ?? t.keyword, theme: req.body.theme ?? t.theme, destination: req.body.destination ?? t.destination, notes: req.body.notes ?? t.notes })
        if (c === 'write') {
          // Crear el artículo de este tema ya, sin esperar a su hueco
          const post = emptyPost(t, s)
          if (t.source === 'noticia') post.kind = 'actualidad'
          t.status = 'usado'
          await store.put('topics', t)
          await store.put('posts', post)
          startStep(post.id, 'todo', by)
          return res.status(200).json({ post, working: true })
        }
        await store.put('topics', t)
        return res.status(200).json({ topic: t })
      }
    }

    /* ---------- Artículos ---------- */
    if (a === 'post') {
      const s = await getSettings()
      const rules = await getRules()

      // Nuevo artículo en el que la IA elige el tema según lo más buscado ahora
      if (b === 'new' && req.method === 'POST' && req.body.auto) {
        const post = emptyPost({ title: 'Eligiendo el tema con más potencial…', theme: req.body.theme || 'A' }, s)
        log(post, 'La IA está eligiendo el tema', req.body.focus ? `Enfoque: ${req.body.focus}` : undefined, by)
        await store.put('posts', post)
        startAutoPost(post.id, { focus: req.body.focus || undefined, theme: req.body.theme || undefined }, by)
        return res.status(200).json({ post, working: true })
      }

      // Nuevo artículo: de un tema de la cola, de un tema escrito al momento, o escrito a mano
      if (b === 'new' && req.method === 'POST') {
        let topic: Topic | null = req.body.topicId ? await store.get<Topic>('topics', String(req.body.topicId)) : null
        const post = topic
          ? emptyPost(topic, s)
          : emptyPost({ title: String(req.body.title || 'Artículo sin título'), keyword: req.body.keyword, theme: req.body.theme || 'A', kind: req.body.kind || 'articulo' }, s)
        if (topic) {
          if (topic.source === 'noticia') post.kind = 'actualidad'
          topic.status = 'usado'
          await store.put('topics', topic)
        } else if (!req.body.manual && req.body.notes) {
          // Tema escrito al momento: se guarda como tema para que el brief tenga las notas
          topic = {
            id: store.newId('man-'), source: 'manual', order: 0, title: post.title, keyword: post.keyword, theme: post.theme, kind: post.kind,
            destination: req.body.destination || '/auditoria/', ownMaterial: 'Banco de ideas', notes: String(req.body.notes), status: 'usado', createdAt: new Date().toISOString(),
          }
          await store.put('topics', topic)
          post.topicId = topic.id
        }
        if (req.body.manual) {
          post.manual = true
          post.h1 = String(req.body.title || '')
          post.slug = slugify(post.h1).slice(0, s.seo.slugMax)
          post.body = String(req.body.body || '')
          post.status = 'borrador'
          log(post, 'Escrito a mano', undefined, by)
        }
        await store.put('posts', post)
        // Con IA: se investiga, se escribe, se revisa y se ilustra en segundo plano
        if (!req.body.manual) startStep(post.id, 'todo', by)
        return res.status(200).json({ post, working: !req.body.manual })
      }

      const post = b ? await store.get<Post>('posts', b) : null
      if (!post) return res.status(404).json({ error: 'Artículo no encontrado' })

      if (!c && req.method === 'GET') {
        return res.status(200).json({ post, working: isRunning(post.id), themes: s.customThemes })
      }
      if (!c && req.method === 'PUT') {
        for (const k of EDITABLE) if (k in req.body) (post as unknown as Record<string, unknown>)[k] = req.body[k]
        if (req.body.slug) post.slug = slugify(String(req.body.slug)).slice(0, s.seo.slugMax)
        const r = runChecks(post, s, rules)
        post.checks = r.checks
        post.score = r.score
        log(post, 'Editado', undefined, by)
        await store.put('posts', post)
        // Si ya estaba en la web, se actualiza también allí
        const sync = post.status === 'publicado' ? await syncWeb() : null
        return res.status(200).json({ post, message: sync?.message })
      }
      if (c === 'cancel' && req.method === 'POST') {
        const ok = cancelJob(post.id)
        return res.status(200).json({ ok, message: ok ? 'Cancelado. Lo gastado hasta ahora queda apuntado en el artículo.' : 'No había nada en marcha.' })
      }
      if (c === 'step' && req.method === 'POST') {
        const step = String(req.body.step) as Step
        // En segundo plano: investigar y redactar puede tardar varios minutos y el proxy cortaría la petición
        startStep(post.id, step, by)
        return res.status(202).json({ post, working: true })
      }
      if (c === 'approve' && req.method === 'POST') {
        if (/\[SERGI:/.test(post.body)) return res.status(400).json({ error: 'Quedan huecos [SERGI: …] por rellenar' })
        if (!post.body) return res.status(400).json({ error: 'El artículo todavía no tiene texto' })
        post.status = 'aprobado'
        // Si no tenía fecha, ocupa el siguiente hueco libre del calendario
        const slots = await store.list<Slot>('slots')
        if (!slots.some((sl) => sl.postId === post.id)) {
          const free = slots.filter((sl) => !sl.postId && sl.at > new Date().toISOString() && sl.kind === 'normal').sort((x, y) => x.at.localeCompare(y.at))[0]
          if (free) {
            free.postId = post.id
            post.scheduledAt = free.at
            await store.put('slots', free)
          }
        }
        log(post, 'Aprobado', post.scheduledAt ? `Se publicará el ${new Date(post.scheduledAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` : undefined, by)
        await store.put('posts', post)
        return res.status(200).json({ post, message: post.scheduledAt ? 'Aprobado. Se publicará y subirá a la web solo en su fecha.' : 'Aprobado. No hay huecos libres en el calendario: usa «Publicar ahora» o planifica más semanas.' })
      }
      if (c === 'reject' && req.method === 'POST') {
        post.status = 'rechazado'
        post.rejectReason = String(req.body.reason || '')
        log(post, 'Rechazado', post.rejectReason, by)
        // El hueco queda libre para el siguiente tema
        for (const sl of await store.list<Slot>('slots')) if (sl.postId === post.id) { delete sl.postId; await store.put('slots', sl) }
        await store.put('posts', post)
        return res.status(200).json({ post })
      }
      if (c === 'reopen' && req.method === 'POST') {
        post.status = post.body ? 'revision' : post.brief ? 'brief' : 'idea'
        log(post, 'Reabierto', undefined, by)
        await store.put('posts', post)
        return res.status(200).json({ post })
      }
      if (c === 'publish' && req.method === 'POST') {
        if (/\[SERGI:/.test(post.body)) return res.status(400).json({ error: 'Quedan huecos [SERGI: …] por rellenar' })
        if (!post.body) return res.status(400).json({ error: 'El artículo todavía no tiene texto' })
        const r = await publishPost(post, by)
        return res.status(200).json({ post: await store.get<Post>('posts', post.id), message: r.message })
      }
      if (c === 'unpublish' && req.method === 'POST') {
        post.status = 'aprobado'
        delete post.uploadedAt
        log(post, 'Despublicado', 'Se retira de la web', by)
        await store.put('posts', post)
        const r = await syncWeb()
        return res.status(200).json({ post, message: r.uploaded ? 'Retirado de la web.' : r.message })
      }
      if (c === 'delete' && req.method === 'POST') {
        for (const sl of await store.list<Slot>('slots')) if (sl.postId === post.id) { delete sl.postId; await store.put('slots', sl) }
        for (const img of post.images || []) await store.remove('images', `${post.id}-${img.slot}`)
        await store.remove('posts', post.id)
        return res.status(200).json({ ok: true })
      }
    }

    /* ---------- Imagen de un artículo (para verla en el panel) ---------- */
    if (a === 'image' && b && c && req.method === 'GET') {
      const doc = await store.get<{ id: string; dataUrl: string }>('images', `${b}-${c}`)
      if (!doc?.dataUrl) return res.status(404).end()
      const [meta, data] = doc.dataUrl.split(',')
      res.setHeader('Content-Type', meta.replace('data:', '').replace(';base64', '') || 'image/png')
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.status(200).send(Buffer.from(data, 'base64'))
    }

    /* ---------- Modelos de imagen disponibles en OpenRouter (lista pública) ---------- */
    if (a === 'image-models' && req.method === 'GET') {
      const r = await fetch('https://openrouter.ai/api/v1/models')
      const data = (await r.json()) as { data: { id: string; name: string; created: number; architecture?: { output_modalities?: string[] } }[] }
      const models = (data.data || [])
        .filter((m) => m.architecture?.output_modalities?.includes('image') && !m.id.startsWith('openrouter/'))
        .sort((x, y) => y.created - x.created)
        .map((m) => ({ id: m.id, name: m.name }))
      return res.status(200).json({ models })
    }

    /* ---------- Vista previa y paquete ---------- */
    if (a === 'preview' && req.method === 'GET') {
      const s = await getSettings()
      const posts = await store.list<Post>('posts')
      const img = await previewImages(b === 'index' ? posts.filter((p) => p.status === 'publicado') : posts.filter((p) => p.id === b || p.status === 'publicado'))
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      if (b === 'index') return res.status(200).send(indexHtml(posts, s, img, undefined, true))
      const post = posts.find((p) => p.id === b)
      if (!post) return res.status(404).send('No encontrado')
      return res.status(200).send(articleHtml(post, posts, s, img, true))
    }
    /* ---------- Categorías creadas desde el panel ---------- */
    if (a === 'categories' && b === 'new' && req.method === 'POST') {
      const s = await getSettings()
      const name = String(req.body.name || '').trim()
      if (!name) return res.status(400).json({ error: 'Falta el nombre de la categoría' })
      if (allThemes(s).some((t) => t.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' })
      const theme = {
        code: 'c-' + store.newId(),
        name,
        question: String(req.body.question || '').trim() || `Artículos sobre ${name.toLowerCase()}`,
        salesPage: String(req.body.salesPage || '/auditoria/').trim(),
      }
      s.customThemes = [...(s.customThemes || []), theme]
      await saveSettings(s, by)
      return res.status(200).json({ theme })
    }
    if (a === 'categories' && b && c === 'delete' && req.method === 'POST') {
      const s = await getSettings()
      const posts = await store.list<Post>('posts')
      if (posts.some((p) => p.theme === b && p.status !== 'rechazado')) return res.status(400).json({ error: 'No se puede borrar: hay artículos en esta categoría' })
      s.customThemes = (s.customThemes || []).filter((t) => t.code !== b)
      await saveSettings(s, by)
      return res.status(200).json({ ok: true })
    }

    /* ---------- Conexión con la web (CDMON) ---------- */
    if (a === 'web' && b === 'test' && req.method === 'POST') {
      return res.status(200).json({ message: await testConnection(await getSettings()) })
    }
    if (a === 'web' && b === 'sync' && req.method === 'POST') {
      return res.status(200).json(await syncWeb())
    }

    if (a === 'package' && req.method === 'GET') {
      const s = await getSettings()
      const zip = await buildPackage(await store.list<Post>('posts'), s)
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="blog-buffaloia-${new Date().toISOString().slice(0, 10)}.zip"`)
      return res.status(200).send(zip)
    }

    return res.status(404).json({ error: 'Ruta no encontrada' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    console.error('[blog]', e)
    return res.status(500).json({ error: msg })
  }
}

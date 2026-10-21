import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import type { Post } from './types'

function safe(s: string): string {
  return s.replace(/</g, '')
}

function titleOf(post: Post): string {
  return (post.h1 || post.title || 'Artículo').trim()
}

/** Aviso inmediato: un artículo acaba de quedar listo para leer y aprobar. */
export async function alertBlogReadyForReview(post: Post): Promise<void> {
  const title = titleOf(post)
  const url = `/blog/${post.id}`
  const link = opsLink(url)
  const subject = `Blog para revisar: ${title}`
  const text = `Hay un artículo listo para leer y publicar (sin rellenar huecos).\n\n${title}\n\nAbrir: ${link}`
  try {
    await sendOpsAlert({
      subject,
      text,
      html: `<p>Hay un artículo listo para leer y publicar.</p><p><b>${safe(title)}</b></p><p><a href="${link}">Abrir artículo</a></p>`,
      telegramHtml: `<b>${safe(subject)}</b>\n${safe(title)}\n${link}`,
      url,
    })
  } catch (e) {
    console.warn('[blog] aviso revisión', e instanceof Error ? e.message : e)
  }
}

/** Recordatorio del día: siguen artículos en revisión. */
export async function alertBlogReviewDigest(posts: Post[]): Promise<void> {
  if (!posts.length) return
  const lines = posts.map((p) => `· ${titleOf(p)}`).join('\n')
  const first = `/blog/${posts[0].id}`
  const list = opsLink('/marketing?tab=blog')
  const subject =
    posts.length === 1 ? `Blog para revisar: ${titleOf(posts[0])}` : `${posts.length} artículos del blog para revisar`
  const text = `${subject}\n\n${lines}\n\nAbrir: ${list}`
  try {
    await sendOpsAlert({
      subject,
      text,
      html: `<p>${safe(subject)}</p><pre style="font-family:inherit;white-space:pre-wrap">${safe(lines)}</pre><p><a href="${list}">Abrir el blog</a></p>`,
      telegramHtml: `<b>${safe(subject)}</b>\n${safe(lines)}\n${list}`,
      url: first,
    })
  } catch (e) {
    console.warn('[blog] aviso revisión (digest)', e instanceof Error ? e.message : e)
  }
}

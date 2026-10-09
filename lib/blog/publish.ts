/**
 * Publicación. De momento genera el paquete ZIP para subir a CDMON
 * (como se ha hecho siempre con la web). Lleva sólo lo que cambia:
 * /blog/ entero, sitemap.xml y /assets/css/blog.css.
 *
 * Cuando el blog lleve unos 8 artículos sin problemas, el brief prevé
 * subir por SFTP: la configuración ya tiene los campos (host, usuario,
 * ruta) y la contraseña irá en CDMON_SFTP_PASSWORD.
 */
import { articleHtml, blogCss, feedXml, indexHtml, publishedImage, sitemapXml, themePages } from './render'
import * as store from './store'
import type { BlogSettings, Post } from './types'

/* ---------- ZIP mínimo (sin compresión), sin dependencias ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

/* ---------- Ficheros del blog ---------- */

const dataUrlToBuffer = (d: string) => Buffer.from(d.split(',')[1] || '', 'base64')

export async function buildSiteFiles(posts: Post[], s: BlogSettings): Promise<Record<string, Buffer>> {
  const pub = posts.filter((p) => p.status === 'publicado')
  const files: Record<string, Buffer> = {}
  const add = (p: string, content: string | Buffer) => (files[p] = typeof content === 'string' ? Buffer.from(content, 'utf8') : content)

  add('assets/css/blog.css', blogCss())
  add('blog/index.html', indexHtml(posts, s, publishedImage))
  for (const t of themePages(posts)) add(`blog/tema/${t.slug}/index.html`, indexHtml(posts, s, publishedImage, t.code))
  for (const p of pub) {
    add(`blog/${p.slug}/index.html`, articleHtml(p, posts, s, publishedImage))
    for (const img of p.images || []) {
      if (!img.file) continue
      const doc = await store.get<{ id: string; dataUrl: string }>('images', `${p.id}-${img.slot}`)
      if (doc?.dataUrl) add(`blog/${p.slug}/${img.file}`, dataUrlToBuffer(doc.dataUrl))
    }
  }
  add('blog/feed.xml', feedXml(posts, s))
  add('sitemap.xml', sitemapXml(posts, s))
  add(
    'LEEME-BLOG.txt',
    `Paquete del blog generado por el CRM el ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.

Subir a la raíz de buffaloia.com en CDMON respetando las carpetas:
- blog/            → la portada, los temas y cada artículo
- assets/css/blog.css
- sitemap.xml      → sustituye al actual (incluye todas las páginas de la web)

Después, en Search Console: Sitemaps → reenviar sitemap.xml.
Artículos publicados: ${pub.length}.
`
  )
  return files
}

export async function buildPackage(posts: Post[], s: BlogSettings): Promise<Buffer> {
  return zip(await buildSiteFiles(posts, s))
}

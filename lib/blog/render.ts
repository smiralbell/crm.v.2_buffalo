/**
 * Genera el HTML del blog con el diseño aprobado de buffaloia.com:
 * índice en mosaico (opción B), artículo de lectura limpia, páginas de
 * tema, sitemap y RSS. Cabecera, pie y etiquetas de Google y Meta se
 * copian tal cual de la web (lib/blog/template).
 */
import fs from 'fs'
import path from 'path'
import { SITE_PAGES, THEMES } from './defaults'
import { slugify, stripTags } from './seo'
import type { BlogSettings, Post, ThemeCode } from './types'

const TPL = path.join(process.cwd(), 'lib', 'blog', 'template')
const tpl = (f: string) => fs.readFileSync(path.join(TPL, f), 'utf8')

export const blogCss = () => tpl('blog.css')

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

const themeName = (c: ThemeCode) => THEMES.find((t) => t.code === c)?.name || 'Blog'
const themeSlug = (c: ThemeCode) => slugify(themeName(c).split(':')[0].split(',')[0])

export const postUrl = (p: Post, s: BlogSettings) => `${s.site.blogPath}${p.slug}/`

const fmtDate = (iso?: string, short = false) =>
  iso
    ? new Date(iso).toLocaleDateString('es-ES', short ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
    : ''

const readMins = (p: Post) => Math.max(2, Math.round(stripTags(p.body).split(/\s+/).length / 220))

/** Cómo resolver la URL de cada imagen: en la vista previa, data URL; publicada, fichero. */
export type ImageResolver = (p: Post, slot: 'destacada' | 'imagen1' | 'imagen2') => string | null

export const publishedImage: ImageResolver = (p, slot) => {
  const img = p.images?.find((i) => i.slot === slot)
  return img?.file ? `${'/blog/'}${p.slug}/${img.file}` : null
}

function page(opts: {
  s: BlogSettings
  title: string
  description: string
  canonical: string
  ogImage?: string
  jsonLd?: unknown
  body: string
  navBlog?: boolean
  preview?: boolean
}) {
  const { s } = opts
  const abs = (u: string) => (u.startsWith('http') ? u : s.site.domain + u)
  // En la vista previa del CRM los estilos se cargan de la web publicada y blog.css va en línea
  const asset = (u: string) => (opts.preview ? s.site.domain + u : u)
  return `<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.preview ? '<meta name="robots" content="noindex, nofollow">' : tpl('tracking.html')}
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${abs(opts.canonical)}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="article">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="BuffaloIA">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${abs(opts.canonical)}">
<meta property="og:image" content="${abs(opts.ogImage || '/assets/img/og-portada.jpg')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="Blog de BuffaloIA" href="${abs('/blog/feed.xml')}">
<link rel="icon" href="${asset('/assets/img/logo/favicon.ico')}" sizes="16x16 32x32 48x48">
<link rel="icon" type="image/png" href="${asset('/assets/img/logo/favicon-192.png')}" sizes="192x192">
<link rel="apple-touch-icon" href="${asset('/assets/img/logo/apple-touch-icon.png')}">
<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f%5B%5D=satoshi@400,500,700&display=swap">
<script>document.documentElement.classList.add("js");</script>
<link rel="stylesheet" href="${asset('/assets/css/tokens.css')}">
<link rel="stylesheet" href="${asset('/assets/css/base.css')}">
<link rel="stylesheet" href="${asset('/assets/css/components.css')}">
<link rel="stylesheet" href="${asset('/assets/css/motion.css')}">
<link rel="stylesheet" href="${asset('/assets/css/cookies.css')}">
${opts.preview ? `<style>${blogCss()}</style>` : '<link rel="stylesheet" href="/assets/css/blog.css">'}
${opts.jsonLd ? `<script type="application/ld+json">\n${JSON.stringify(opts.jsonLd)}\n</script>` : ''}
</head>
<body>

<div class="progress" aria-hidden="true"><div class="progress__bar"></div></div>
<a class="skip-link" href="#main">Saltar al contenido</a>

${tpl('header.html').replace('{{NAV_BLOG}}', opts.navBlog ? ' aria-current="page"' : '')}
<main id="main">
${opts.body}
</main>

${tpl('footer.html')}
<script src="${asset('/assets/js/main.js')}" defer></script>
${opts.preview ? '' : '<script src="/assets/js/cookies.js" defer></script>'}
</body>
</html>
`
}

/* ---------------- Tarjetas ---------------- */

function photo(p: Post, img: ImageResolver, alt: string) {
  const src = img(p, 'destacada')
  return `<div class="ph">${src ? `<img src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">` : ''}</div>`
}

const card = (p: Post, s: BlogSettings, img: ImageResolver) => `      <a class="post" href="${postUrl(p, s)}" data-reveal="up">
        ${photo(p, img, p.h1)}
        <div class="post__body">
          <p class="post__tag">${esc(themeName(p.theme))}</p>
          <h3 class="post__title">${esc(p.h1)}</h3>
          <p class="post__excerpt">${esc(p.excerpt)}</p>
          <div class="post__foot"><span>${fmtDate(p.publishedAt, true)} · ${readMins(p)} min</span><span class="post__go">Leer${ARROW}</span></div>
        </div>
      </a>`

const rowCard = (p: Post, s: BlogSettings, img: ImageResolver) => `        <a class="post post--row" href="${postUrl(p, s)}" data-reveal="up">
          ${photo(p, img, p.h1)}
          <div class="post__body">
            <p class="post__tag">${esc(themeName(p.theme))}</p>
            <h3 class="post__title">${esc(p.h1)}</h3>
            <p class="post__meta">${fmtDate(p.publishedAt, true)} · ${readMins(p)} min</p>
          </div>
        </a>`

/* ---------------- Artículo ---------------- */

function bodyWithImages(p: Post, img: ImageResolver) {
  const fig = (slot: 'imagen1' | 'imagen2') => {
    const src = img(p, slot)
    const meta = p.images?.find((i) => i.slot === slot)
    if (!src) return ''
    return `<figure class="rd-fig"><div class="ph"><img src="${src}" alt="${esc(meta?.alt || p.keyword)}" loading="lazy" decoding="async"></div></figure>`
  }
  let html = p.body
    .replace(/<p>\s*\(imagen1\)\s*<\/p>/, fig('imagen1'))
    .replace(/<p>\s*\(imagen2\)\s*<\/p>/, fig('imagen2'))
    .replace(/\(imagen[12]\)/g, '')
  // ids en los H2 para el índice del artículo
  html = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner) => `<h2 id="${slugify(stripTags(inner)).slice(0, 60)}">${inner}</h2>`)
  return html
}

export function articleHtml(p: Post, all: Post[], s: BlogSettings, img: ImageResolver, preview = false): string {
  const url = postUrl(p, s)
  const theme = THEMES.find((t) => t.code === p.theme)
  const dest = p.brief?.internalLinks?.[0]?.url || theme?.salesPage || '/auditoria/'
  const destPage = SITE_PAGES.find((x) => x.path === dest)
  const h2s = Array.from(p.body.matchAll(/<h2>([\s\S]*?)<\/h2>/g)).map((m) => stripTags(m[1]))
  const related = all
    .filter((x) => x.id !== p.id && x.status === 'publicado')
    .sort((a, b) => (a.theme === p.theme ? -1 : 0) - (b.theme === p.theme ? -1 : 0) || (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 3)
  const hero = img(p, 'destacada')
  const published = p.publishedAt || p.scheduledAt || new Date().toISOString()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': s.site.domain + url + '#article',
        headline: p.h1,
        description: p.metaDescription,
        image: hero && !hero.startsWith('data:') ? s.site.domain + hero : undefined,
        datePublished: published,
        dateModified: p.updatedAt,
        inLanguage: 'es-ES',
        keywords: [p.keyword, ...p.secondary].join(', '),
        articleSection: theme?.name,
        author: { '@type': 'Person', name: s.site.authorName, jobTitle: s.site.authorRole, url: s.site.domain + '/sobre-nosotros/' },
        publisher: { '@type': 'Organization', name: 'BuffaloIA', url: s.site.domain, logo: s.site.domain + '/assets/img/logo/buffalo-ai-full.png' },
        mainEntityOfPage: s.site.domain + url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: s.site.domain + '/' },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: s.site.domain + '/blog/' },
          { '@type': 'ListItem', position: 3, name: p.h1, item: s.site.domain + url },
        ],
      },
      p.faq.length
        ? { '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
        : null,
    ].filter(Boolean),
  }

  const body = `
<article class="rd">
<header class="rd-head">
  <div class="container">
    <nav class="breadcrumb" aria-label="Migas de pan"><a href="/">Inicio</a><span>/</span><a href="/blog/">Blog</a><span>/</span><a href="/blog/tema/${themeSlug(p.theme)}/">${esc(themeName(p.theme))}</a></nav>
    <h1 class="rd-head__title">${esc(p.h1)}</h1>
    <p class="rd-head__by"><img src="${preview ? s.site.domain : ''}/assets/img/equipo/sergi.webp" alt=""><span>${esc(s.site.authorName)}</span><i></i><time datetime="${published}">${fmtDate(published, true)}</time><i></i><span>${readMins(p)} min de lectura</span></p>
  </div>
</header>

<div class="container">
  ${hero ? `<figure class="rd-hero"><div class="ph"><img src="${hero}" alt="${esc(p.images.find((i) => i.slot === 'destacada')?.alt || p.h1)}" fetchpriority="high"></div></figure>` : ''}

  <div class="rd-body">
    ${h2s.length >= 3 ? `<p class="rd-toc-t">En este artículo</p>
    <ol class="rd-toc">
${h2s.map((h) => `      <li><a href="#${slugify(h).slice(0, 60)}">${esc(h)}</a></li>`).join('\n')}
    </ol>` : ''}

    ${bodyWithImages(p, img)}

    <aside class="rd-cta">
      <p>${esc(p.brief?.cta || 'En la auditoría revisamos tu caso contigo: media hora, sin coste, y si no compensa te lo decimos.')}</p>
      <a class="btn btn--primary btn--pill" href="${dest}">${dest.includes('contact') ? 'Reservar auditoría gratuita' : destPage ? 'Ver ' + esc(destPage.title.toLowerCase()) : 'Pedir auditoría gratuita'}</a>
    </aside>

    ${p.faq.length ? `<section class="rd-faq" aria-labelledby="preguntas">
    <h2 id="preguntas">Preguntas frecuentes</h2>
${p.faq.map((f) => `    <h3>${esc(f.q)}</h3>\n    <p>${esc(f.a)}</p>`).join('\n')}
    </section>` : ''}

    <footer class="rd-foot">
      <img src="${preview ? s.site.domain : ''}/assets/img/equipo/sergi.webp" alt="">
      <div>
        <p><strong>${esc(s.site.authorName)}</strong>, ${esc(s.site.authorRole)}. Implantamos asistentes virtuales con IA, WhatsApp y llamadas, y automatizaciones en empresas de servicios. <a href="/sobre-nosotros/">Sobre nosotros</a>.</p>
        <p class="rd-dates">Publicado el ${fmtDate(published)} · Última revisión el ${fmtDate(p.updatedAt)}</p>
      </div>
    </footer>
  </div>
</div>
</article>

${related.length ? `<section class="section section--alt">
  <div class="container">
    <div data-reveal="up" style="text-align:center;margin-bottom:var(--sp-7)">
      <span class="label label--accent">Seguir leyendo</span>
      <h2 class="h2" style="margin-top:var(--sp-3)">Artículos relacionados</h2>
    </div>
    <div class="posts" data-stagger="90">
${related.map((r) => card(r, s, img)).join('\n')}
    </div>
  </div>
</section>` : ''}`

  return page({ s, preview, title: `${p.h1} | BuffaloIA`, description: p.metaDescription, canonical: url, ogImage: hero && !hero.startsWith('data:') ? hero : undefined, jsonLd, body })
}

/* ---------------- Índice y páginas de tema ---------------- */

const usedThemes = (posts: Post[]) => THEMES.filter((t) => posts.some((p) => p.theme === t.code))

export function indexHtml(posts: Post[], s: BlogSettings, img: ImageResolver, theme?: ThemeCode, preview = false): string {
  const list = posts
    .filter((p) => p.status === 'publicado' && (!theme || p.theme === theme))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
  const all = posts.filter((p) => p.status === 'publicado')
  const [f, ...rest] = list
  const t = theme ? THEMES.find((x) => x.code === theme) : null
  const canonical = t ? `/blog/tema/${themeSlug(t.code)}/` : '/blog/'

  const filters = `<nav class="filters" aria-label="Temas del blog">
      <a href="/blog/"${!theme ? ' aria-current="page"' : ''}>Todos</a>
${usedThemes(all).map((x) => `      <a href="/blog/tema/${themeSlug(x.code)}/"${theme === x.code ? ' aria-current="page"' : ''}>${esc(x.name.split(':')[0])}</a>`).join('\n')}
    </nav>`

  const body = `
<section class="bhead">
  <div class="container">
    <nav class="breadcrumb" aria-label="Migas de pan"><a href="/">Inicio</a><span>/</span>${t ? `<a href="/blog/">Blog</a><span>/</span><span>${esc(t.name)}</span>` : '<span>Blog</span>'}</nav>
    <h1 class="bhead__title">${t ? esc(t.name) : 'Blog de IA <em>para empresas</em>'}</h1>
    <p class="bhead__sub">${t ? esc(t.question) : 'Lo que vemos en auditorías e implantaciones, con números cuando los hay y contando también lo que sale mal.'}</p>
    ${filters}
  </div>
</section>

<section class="section" style="padding-top:var(--sp-6)">
  <div class="container">
${
  f
    ? `    <div class="mosaic">
      <a class="post post--big" href="${postUrl(f, s)}" data-reveal="up">
        ${photo(f, img, f.h1)}
        <div class="post__body">
          <p class="post__tag">${esc(themeName(f.theme))} · Último artículo</p>
          <h2 class="post__title">${esc(f.h1)}</h2>
          <p class="post__excerpt">${esc(f.excerpt)}</p>
          <p class="post__meta">${fmtDate(f.publishedAt, true)} · ${readMins(f)} min de lectura</p>
        </div>
      </a>
      <div class="mosaic__side">
${rest.slice(0, 3).map((p) => rowCard(p, s, img)).join('\n')}
      </div>
    </div>
    <div class="posts" data-stagger="90">
${rest.slice(3).map((p) => card(p, s, img)).join('\n')}
    </div>`
    : '    <p class="lead" style="text-align:center">Pronto publicaremos el primer artículo.</p>'
}
  </div>
</section>`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: t ? `${t.name} · Blog de BuffaloIA` : 'Blog de BuffaloIA',
    url: s.site.domain + canonical,
    publisher: { '@type': 'Organization', name: 'BuffaloIA', url: s.site.domain },
    blogPost: list.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.h1, url: s.site.domain + postUrl(p, s), datePublished: p.publishedAt })),
  }

  return page({
    s,
    preview,
    navBlog: true,
    title: t ? `${t.name} · Blog | BuffaloIA` : 'Blog de IA para empresas · Automatización y agentes | BuffaloIA',
    description: t ? `${t.question} Artículos de BuffaloIA sobre ${t.name.toLowerCase()}.` : 'Artículos sobre asistentes virtuales con IA, WhatsApp y llamadas, y automatización de procesos en empresas de servicios. Lo que vemos al implantarlos.',
    canonical,
    jsonLd,
    body,
  })
}

export const themePages = (posts: Post[]) => usedThemes(posts.filter((p) => p.status === 'publicado')).map((t) => ({ code: t.code, slug: themeSlug(t.code) }))

/* ---------------- RSS y sitemap ---------------- */

const xml = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function feedXml(posts: Post[], s: BlogSettings): string {
  const list = posts.filter((p) => p.status === 'publicado').sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 30)
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Blog de BuffaloIA</title>
  <link>${s.site.domain}/blog/</link>
  <atom:link href="${s.site.domain}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Asistentes virtuales con IA, WhatsApp y llamadas, y automatización de procesos en empresas de servicios.</description>
  <language>es-ES</language>
${list
  .map(
    (p) => `  <item>
    <title>${xml(p.h1)}</title>
    <link>${s.site.domain}${postUrl(p, s)}</link>
    <guid isPermaLink="true">${s.site.domain}${postUrl(p, s)}</guid>
    <pubDate>${new Date(p.publishedAt || p.updatedAt).toUTCString()}</pubDate>
    <category>${xml(themeName(p.theme))}</category>
    <description>${xml(p.metaDescription)}</description>
  </item>`
  )
  .join('\n')}
</channel>
</rss>
`
}

/** Sitemap completo: páginas de la web + blog, con lastmod real en el blog. */
export function sitemapXml(posts: Post[], s: BlogSettings): string {
  const pub = posts.filter((p) => p.status === 'publicado')
  const last = pub.map((p) => p.updatedAt).sort().pop()
  const entries: { loc: string; lastmod?: string; priority: string }[] = [
    ...SITE_PAGES.map((p) => ({ loc: p.path, priority: p.path === '/' ? '1.0' : '0.8' })),
    { loc: '/blog/', lastmod: last, priority: '0.8' },
    ...themePages(pub).map((t) => ({ loc: `/blog/tema/${t.slug}/`, lastmod: last, priority: '0.6' })),
    ...pub.map((p) => ({ loc: postUrl(p, s), lastmod: p.updatedAt, priority: p.kind === 'pilar' ? '0.8' : '0.7' })),
    ...['/aviso-legal/', '/politica-privacidad/', '/politicas-cookies/', '/terminos_condiciones/'].map((loc) => ({ loc, priority: '0.3' })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map((e) => `  <url>\n    <loc>${s.site.domain}${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : ''}\n    <priority>${e.priority}</priority>\n  </url>`)
  .join('\n')}
</urlset>
`
}

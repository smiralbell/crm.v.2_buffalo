/**
 * Valores de partida del módulo Blog. Todo esto se puede cambiar desde
 * el CRM (Blog → Configuración y Blog → Reglas); aquí sólo está lo que
 * se usa la primera vez.
 *
 * Las reglas de voz, temas y material propio salen del brief anual de
 * Sergi (9-oct-2026). Las normas SEO, de las que pasó Santi.
 */
import type { BlogRules, BlogSettings, SitePage, Theme } from './types'

export const THEMES: Theme[] = [
  { code: 'A', name: 'Atención y captación de clientes', question: '¿Cómo dejo de perder consultas y de revisar WhatsApp uno por uno?', salesPage: '/llamadas-con-ia-para-el-sector-legal/' },
  { code: 'B', name: 'Antes de automatizar', question: '¿Por dónde empiezo y cómo sé si compensa?', salesPage: '/auditoria/' },
  { code: 'C', name: 'Voz y WhatsApp: cómo funciona de verdad', question: '¿Se conecta a lo que uso? ¿Qué pasa en producción?', salesPage: '/agentes-ia-llamada/' },
  { code: 'D', name: 'Procesos internos, documentos y software a medida', question: '¿Cómo quito el trabajo administrativo que se repite?', salesPage: '/automatizaciones-internas/' },
  { code: 'E', name: 'Riesgo, ley y confianza', question: '¿Y el RGPD? ¿Y si molesta a mis clientes?', salesPage: '/auditoria/' },
  { code: 'F', name: 'Precio y decisión', question: '¿Cuánto cuesta y frente a qué lo comparo?', salesPage: '/contact/' },
  { code: 'G', name: 'Formación en IA para equipos', question: '¿Cómo consigo que mi equipo use la IA de verdad?', salesPage: 'https://academy.buffaloia.com/' },
  { code: 'S', name: 'Sectores', question: 'La misma pregunta del tema A, en su sector', salesPage: '/servicios-ia/' },
  { code: 'N', name: 'Actualidad que te afecta', question: '¿Qué ha cambiado y qué significa para mi empresa?', salesPage: '/auditoria/' },
]

/** Páginas de buffaloia.com que el motor puede enlazar. */
export const SITE_PAGES: SitePage[] = [
  { path: '/', title: 'Inicio', about: 'Agencia de IA en Barcelona: agentes de voz, agentes de texto y automatizaciones' },
  { path: '/servicios-ia/', title: 'Servicios de IA para empresas', about: 'Voz, texto y automatización; listado de sectores' },
  { path: '/auditoria/', title: 'Auditoría de IA para empresas', about: 'Punto de partida gratuito: qué automatizar y qué no' },
  { path: '/agentes-ia-llamada/', title: 'Agentes de voz con IA', about: 'Contestan y hacen llamadas, agendan, derivan a una persona' },
  { path: '/agentes-de-texto-multicanal/', title: 'Agentes de texto', about: 'WhatsApp, web e Instagram con IA' },
  { path: '/automatizaciones-internas/', title: 'Automatizaciones internas', about: 'Facturas, informes, documentos, integraciones' },
  { path: '/buffalo-core/', title: 'Buffalo Core', about: 'Software a medida y panel de KPIs de la operación' },
  { path: '/casos-de-exito/', title: 'Casos de éxito', about: 'No enlazar desde el blog', noLink: true },
  { path: '/contact/', title: 'Contacto', about: 'Reservar la auditoría gratuita' },
  { path: '/llamadas-con-ia-para-el-sector-legal/', title: 'Asistente virtual con IA para abogados', about: 'Landing de despachos: WhatsApp y llamadas' },
  { path: '/emailmarketing/', title: 'Email marketing automatizado con IA', about: 'Campañas y secuencias de email que se escriben y envían solas' },
  { path: '/formacion-y-educacion-ia/', title: 'IA para formación y educación', about: 'Academias y centros de formación: captación, matrícula y atención' },
  { path: '/gestion-de-redes-sociales/', title: 'Gestión de redes sociales con IA', about: 'Contenido y respuestas en redes con IA' },
  { path: '/partnership/', title: 'Programa de partners', about: 'Colaboradores que recomiendan BuffaloIA' },
  { path: '/llamadas-ia-inmobiliaria/', title: 'Agentes de IA para inmobiliarias', about: 'Leads, cualificación y visitas' },
  { path: '/llamadas-con-ia-en-seguros-y-servicios-financieros/', title: 'Agentes de IA para seguros', about: 'Renovaciones, recibos y atención' },
  { path: '/llamadas-con-ia-en-salud/', title: 'Agentes de IA para clínicas', about: 'Citas, recordatorios y atención al paciente' },
  { path: '/llamadas-ia-restauracion/', title: 'Agentes de IA para restaurantes', about: 'Reservas y cambios' },
  { path: '/llamadas-con-ia-en-formacion-y-educacion/', title: 'Agentes de IA para academias', about: 'Información de cursos y matrículas' },
  { path: '/llamadas-con-ia-en-gimnasios-y-centros-deportivos/', title: 'Agentes de IA para gimnasios', about: 'Altas, reservas de clase y socios' },
  { path: '/e-comerce/', title: 'IA para e-commerce', about: 'Atención y recuperación de carrito' },
  { path: '/presupuesto-y-facturacion/', title: 'Automatizar presupuestos y facturación', about: 'Presupuestos, facturas y cobros' },
  { path: '/reportes-automaticos/', title: 'Reportes automáticos', about: 'Informes que se hacen solos' },
  { path: '/gestion-inventario/', title: 'Gestión de inventario automatizada', about: 'Stock y pedidos' },
  { path: '/mantenimiento/', title: 'Mantenimiento de sistemas de IA', about: 'Soporte y evolución' },
  { path: '/sobre-nosotros/', title: 'Sobre nosotros', about: 'Equipo de BuffaloIA' },
]

/**
 * Combinaciones de modelos. «Económico» es el predeterminado: Sonnet escribe
 * (buena calidad a la mitad de precio que Opus) y Haiku hace lo mecánico
 * (investigar, revisar, corregir), unas 40 veces más barato.
 * Coste orientativo por artículo completo con 3 imágenes.
 */
export const MODEL_PRESETS = {
  economico: { label: 'Económico (recomendado) · ~0,30-0,50 $ por artículo', models: { research: 'anthropic/claude-haiku-5.5', writing: 'anthropic/claude-sonnet-5.5', webSearchResults: 4 }, image: 'google/gemini-3.1-flash-image' },
  equilibrado: { label: 'Equilibrado · ~0,60-0,90 $ por artículo', models: { research: 'anthropic/claude-sonnet-5.5', writing: 'anthropic/claude-sonnet-5.5', webSearchResults: 6 }, image: 'google/gemini-3.1-flash-image' },
  maximo: { label: 'Máxima calidad · ~1,50-2,50 $ por artículo', models: { research: 'anthropic/claude-sonnet-5.5', writing: 'anthropic/claude-opus-5.5', webSearchResults: 8 }, image: 'google/gemini-3-pro-image' },
} as const

export const DEFAULT_SETTINGS: BlogSettings = {
  enabled: false,
  publishing: { mode: 'revision', autoPublishAfterHours: 24 },
  schedule: {
    minPerWeek: 2,
    maxPerWeek: 3,
    weekdays: [1, 2, 3, 4, 5],
    windows: [
      { from: '08:30', to: '13:30' },
      { from: '16:00', to: '19:00' },
    ],
    timezone: 'Europe/Madrid',
    minGapHours: 36,
    planAheadWeeks: 3,
    newsEvery: 6,
    pauses: [{ from: '2026-12-21', to: '2027-01-03', label: 'Navidad' }],
    startDate: '2026-11-02',
  },
  leadTimes: { briefDaysBefore: 10, draftDaysBefore: 7 },
  topics: { source: 'calendario', proposalsPerSearch: 6 },
  models: { ...MODEL_PRESETS.economico.models, preset: 'economico' },
  images: {
    provider: 'openrouter',
    openaiModel: 'gpt-image-1',
    // Nano Banana Pro: el que mejor escribe texto dentro de la imagen (infografías)
    openrouterModel: MODEL_PRESETS.economico.image,
    size: '1536x1024',
  },
  seo: {
    keywordMaxWords: 3,
    keywordMinCount: 8,
    secondaryCount: 3,
    secondaryMinCount: 3,
    h1Max: 55,
    metaMax: 155,
    slugMax: 70,
    paragraphMaxLines: 4,
    charsPerLine: 95,
    internalLinks: 3,
    externalLinks: 3,
    wordsArticle: [1200, 1800],
    wordsPillar: [2500, 3500],
    maxRewrites: 3,
  },
  site: {
    domain: 'https://buffaloia.com',
    blogPath: '/blog/',
    authorName: 'Sergi Masoliver',
    authorRole: 'Cofundador de BuffaloIA',
  },
  // En CDMON la carpeta pública del dominio es /web
  publish: { method: 'ftp', remoteDir: '/web', secure: true },
  budget: { monthlyUsd: 30, perArticleUsd: 1 },
  customThemes: [],
}

/**
 * Regla fija (no se puede quitar desde Ajustes): BuffaloIA no tiene casos
 * publicables, así que el blog nunca cita proyectos, clientes ni resultados
 * propios. Inventarlos se nota y resta credibilidad.
 */
export const NO_CASES_RULE = `SIN CASOS PROPIOS (obligatorio)
- No cites proyectos, clientes, implantaciones ni resultados de BuffaloIA: ni reales, ni anónimos («un despacho con el que trabajamos»), ni inventados.
- No inventes empresas, nombres, citas de clientes, cifras de resultados ni testimonios.
- No enlaces a /casos-de-exito/.
- Para aterrizar las ideas usa situaciones típicas del sector planteadas como hipotéticas («pongamos una clínica que recibe 60 llamadas al día…»), cálculos sencillos que el lector pueda hacer, o datos externos con enlace a la fuente.
- Habla de cómo trabajamos (primero auditoría, empezar pequeño, medir) como método, no como historias de clientes.`

export const OWN_MATERIAL = `Material propio que SÍ se puede usar:
- Nuestro método: primero una auditoría de media hora sin coste; se revisa el proceso antes de automatizarlo; se empieza por una fase pequeña y medible; no todo debe automatizarse.
- Nuestra opinión: si automatizas un proceso roto, solo consigues que funcione mal más rápido. Sin volumen de consultas no compensa.
- Preguntas que suelen hacerse las empresas: «¿Qué pasa si dejo de pagar el mantenimiento?», «¿Molestará a mis clientes?», «¿Una mala implementación puede ser peor que como estábamos?». Plantéalas como dudas habituales, no como frases de clientes.
- Seguridad, solo esto: permisos mínimos; ningún agente mueve dinero ni borra información crítica; RGPD contemplado en los contratos. No afirmar país de servidores, cifrado en reposo ni otras medidas.

Nunca: casos, clientes o resultados propios (ver la regla fija); prometer sustituir equipos, ahorro garantizado o plazos cerrados; cifras externas sin enlace a la fuente primaria.`

export const DEFAULT_RULES: BlogRules = {
  voice: `Escribe Sergi, cofundador de BuffaloIA, hablando con un gerente o socio director de una empresa de servicios de 10-100 personas que no tiene tiempo. Frases cortas, ejemplos concretos, opinión clara. Nunca suena a marca corporativa ni a IA.

- Tuteo y español de España.
- Marca siempre «BuffaloIA», en una palabra.
- Hablar de «asistente virtual» y de «WhatsApp y llamadas», en ese orden, como en la web.
- Frases prudentes cuando toque: «depende del volumen de consultas», «antes de automatizar conviene revisar el proceso», «la primera fase suele ser más simple».
- Nuestra tesis: si automatizas un proceso roto, solo consigues que funcione mal más rápido. Primero se audita y se decide; la tecnología viene después. Y no todo debe automatizarse.
- Comparamos con lo que el lector haría si no nos llama: seguir a mano, contratar a otra persona o usar herramientas sueltas. No con otras agencias.
- Varía la longitud de las frases. Alguna muy corta. Ninguna frase de relleno que repita el título.
- Habla desde el criterio y la experiencia del sector, no desde proyectos concretos: BuffaloIA no cita casos, clientes ni resultados propios.`,

  structure: `1. H1 con la palabra clave principal, escrito como lo buscaría un gerente.
2. Respuesta directa en los dos primeros párrafos: el dolor real y la respuesta corta.
3. Qué problema resuelve, con una situación concreta del día a día.
4. Un ejemplo práctico: una situación típica del sector, planteada como hipotética («pongamos un despacho de 8 personas…»), nunca como un cliente nuestro.
5. Cuándo tiene sentido y cuándo no (siempre con la parte del «no»: volumen bajo, proceso sin definir, tareas de criterio).
6. Cómo sería una primera fase: pequeña, medible, sin prometer resultados.
7. Errores habituales.
8. Checklist o preguntas para que el lector se evalúe.
9. Preguntas frecuentes (3-5).
10. Un solo CTA al final, coherente con el tema.
Los artículos cortos (1.200-1.800 palabras) pueden saltarse los puntos 5 y 7. Las guías pilar (2.500-3.500) los amplían.`,

  seo: `Palabra clave principal
- Entre 1 y 3 palabras. Aparece al menos 8 veces.
- Obligatoriamente en: el H1, la meta-description, el slug, el primer párrafo y al menos un H2 o H3. El resto en el cuerpo hasta completar las apariciones.

Palabras clave secundarias
- 3 términos de 1 a 3 palabras cada uno. Cada uno aparece al menos 3 veces, de forma natural.

Título, descripción y URL
- H1: máximo 55 caracteres, con la palabra clave principal.
- Meta-description: máximo 155 caracteres, con la palabra clave principal.
- Slug: máximo 70 caracteres, con la palabra clave principal, en kebab-case.

Estructura y legibilidad
- H2 y H3 con jerarquía coherente. Párrafos de máximo 4 líneas. Listas cuando aporten claridad. Palabras clave integradas con naturalidad.

Enlaces internos
- Exactamente 3 URLs internas: un H2 completo enlazado, una frase enlazada y una sola palabra enlazada.

Enlaces externos
- Exactamente 3 URLs externas repartidas por el texto. Sin URLs desnudas. Formato <a href="URL">texto ancla</a>.

Elementos visuales
- Incluir los indicadores (imagen1) e (imagen2) en el cuerpo.
- Dar un prompt para la imagen destacada y otro para una infografía o diagrama.`,

  bannedPhrases: [
    'en el mundo actual', 'en la era digital', 'en el panorama actual', 'revolucionar', 'revoluciona', 'desbloquear',
    'desbloquea', 'potenciar', 'potencia tu', 'sin precedentes', 'sin lugar a dudas', 'cabe destacar',
    'es importante destacar', 'juega un papel crucial', 'juega un papel fundamental', 'sumérgete', 'descubre cómo',
    'lleva tu negocio al siguiente nivel', 'un antes y un después', 'en conclusión', 'en resumen,', 'en definitiva,',
    'no es solo', 'imagina que', 'transformar radicalmente', 'game changer', 'a día de hoy',
  ],

  neverSay: [
    '+10M de llamadas', '88 %', '80 % de ahorro', '98 % de éxito', 'ahorro garantizado', 'sustituir a tu equipo',
    'cuota mensual cerrada',
  ],

  ownMaterial: OWN_MATERIAL,

  trustedSources: [
    'boe.es', 'aepd.es', 'eur-lex.europa.eu', 'commission.europa.eu', 'digital-strategy.ec.europa.eu', 'fundae.es',
    'ine.es', 'ontsi.es', 'red.es', 'business.whatsapp.com', 'developers.facebook.com', 'abogacia.es', 'cgae.es',
  ],

  imageStyle: `Fotografía editorial realista y luminosa, estilo revista de negocios. Oficinas y despachos españoles, luz natural, tonos claros con algún acento verde (#00c896). Personas de espaldas o desenfocadas, sin caras reconocibles. Nada de robots, cerebros brillantes ni hologramas. Sin texto, rótulos, carteles, placas, logotipos ni nombres de empresas en ninguna parte de la imagen.`,
}

/** Categorías de serie más las creadas desde el panel. */
export const allThemes = (s: Pick<BlogSettings, 'customThemes'>): Theme[] => [...THEMES, ...(s.customThemes || [])]

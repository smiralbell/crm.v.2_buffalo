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
  { path: '/casos-de-exito/', title: 'Casos de éxito', about: 'Precualificación por WhatsApp, llamada al instante a leads, facturas centralizadas' },
  { path: '/contact/', title: 'Contacto', about: 'Reservar la auditoría gratuita' },
  { path: '/llamadas-con-ia-para-el-sector-legal/', title: 'Asistente virtual con IA para abogados', about: 'Landing de despachos: WhatsApp y llamadas' },
  { path: '/ia-para-despachos-de-abogados/', title: 'IA para despachos de abogados', about: 'Automatización legal' },
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
  models: {
    research: '~anthropic/claude-sonnet-latest',
    writing: '~anthropic/claude-opus-latest',
    webSearchResults: 8,
  },
  images: {
    provider: 'openai',
    openaiModel: 'gpt-image-1',
    openrouterModel: 'google/gemini-2.5-flash-image',
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
  publish: { method: 'paquete', sftpHost: '', sftpUser: '', sftpPath: '/web' },
  budget: { monthlyUsd: 60 },
}

export const DEFAULT_RULES: BlogRules = {
  voice: `Escribe Sergi, cofundador de BuffaloIA, hablando con un gerente o socio director de una empresa de servicios de 10-100 personas que no tiene tiempo. Frases cortas, ejemplos concretos, opinión clara. Nunca suena a marca corporativa ni a IA.

- Tuteo y español de España.
- Marca siempre «BuffaloIA», en una palabra.
- Hablar de «asistente virtual» y de «WhatsApp y llamadas», en ese orden, como en la web.
- Frases prudentes cuando toque: «depende del volumen de consultas», «antes de automatizar conviene revisar el proceso», «la primera fase suele ser más simple».
- Nuestra tesis: si automatizas un proceso roto, solo consigues que funcione mal más rápido. Primero se audita y se decide; la tecnología viene después. Y no todo debe automatizarse.
- Comparamos con lo que el lector haría si no nos llama: seguir a mano, contratar a otra persona o usar herramientas sueltas. No con otras agencias.
- Varía la longitud de las frases. Alguna muy corta. Ninguna frase de relleno que repita el título.
- Donde falte material propio, deja [SERGI: qué falta] en lugar de inventarlo.`,

  structure: `1. H1 con la palabra clave principal, escrito como lo buscaría un gerente.
2. Respuesta directa en los dos primeros párrafos: el dolor real y la respuesta corta.
3. Qué problema resuelve, con una situación concreta del día a día.
4. Ejemplos y material propio: un caso, una frase de cliente o un error nuestro.
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

  ownMaterial: `Material propio que se puede usar (sin nombres de cliente):
- Despacho de abogados: el agente telefónico agendó dos citas reales en sus primeros minutos funcionando.
- Otro despacho: sistema con voz, WhatsApp, Instagram, gestión documental y CRM. Contarlo como capacidad técnica, nunca con resultados numéricos.
- Equipo de comunicación de una figura política: miles de mensajes; atenderlos a mano puede costar unos 950 € al día.
- Proyecto terminado y bloqueado meses por las validaciones de Meta. Error propio: empezar a desarrollar antes de cerrar alcance, accesos y dependencias externas.
- Asesoría con 3-4 consultas cada 15 días: «no hay nada que filtrar». Sin volumen no hay proyecto.
- Volumen visto en reuniones: empresas con unos 3.000 formularios y 2.000 llamadas al mes; otras con 100-200 llamadas diarias.
- Los tres casos de Casos de éxito: precualificación por WhatsApp, llamada al instante a leads de Google Ads, facturas centralizadas e IVA trimestral.
- Rechazamos un proyecto rentable por no encajar con nuestros valores.
- Sergi y Santi son formadores externos de Learning Heroes.

Frases literales de clientes:
«Recibimos 50 o 60 consultas diarias por WhatsApp y tenemos que revisarlas una por una»; «De todos los formularios que entran, descartamos entre el 80 % y el 90 %»; «¿Qué pasa con el sistema si dejamos de pagar el mantenimiento?»; «Una mala implementación puede ser peor que como estábamos»; «No quiero que la IA moleste a los clientes»; «Necesito que filtre lo importante y avise al equipo, no otro sitio más que revisar».

Seguridad (solo esto hasta que Santi confirme más): permisos mínimos por proyecto; ningún agente mueve dinero ni borra información crítica; RGPD contemplado en contratos con revisión jurídica; no ha habido incidentes. No afirmar país de servidores, cifrado en reposo, aislamiento entre clientes ni medidas contra prompt injection.

Nunca: nombres de clientes sin permiso escrito; prometer sustituir equipos, ahorro garantizado o plazos cerrados; cifras externas sin enlace a la fuente primaria; inventar casos, citas o clientes.`,

  trustedSources: [
    'boe.es', 'aepd.es', 'eur-lex.europa.eu', 'commission.europa.eu', 'digital-strategy.ec.europa.eu', 'fundae.es',
    'ine.es', 'ontsi.es', 'red.es', 'business.whatsapp.com', 'developers.facebook.com', 'abogacia.es', 'cgae.es',
  ],

  imageStyle: `Fotografía editorial realista y luminosa, estilo revista de negocios. Oficinas y despachos españoles reales, luz natural, tonos claros con algún acento verde (#00c896). Personas de espaldas o desenfocadas, sin caras reconocibles. Nada de robots, cerebros brillantes, hologramas ni texto dentro de la imagen.`,
}

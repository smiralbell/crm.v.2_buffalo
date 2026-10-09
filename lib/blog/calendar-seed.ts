/**
 * Los 90 temas del calendario anual del brief de Sergi (nov 2026 - oct 2027).
 *
 * Se cargan en este orden en la cola de temas. Las fechas del brief NO
 * se usan: cada tema cae en el siguiente hueco del calendario aleatorio
 * (2-3 por semana). Las palabras clave son la hipótesis de partida; la
 * investigación de cada brief las valida o propone otra mejor.
 */
import type { PostKind, ThemeCode, Topic } from './types'

const L = '/llamadas-con-ia-para-el-sector-legal/'
const INM = '/llamadas-ia-inmobiliaria/'
const SEG = '/llamadas-con-ia-en-seguros-y-servicios-financieros/'
const SAL = '/llamadas-con-ia-en-salud/'
const AC = 'https://academy.buffaloia.com/'
const CALC = '/calculadora-ahorro/'

type Row = [string, string, ThemeCode, string, string, PostKind?, string?]

// [título, palabra clave, tema, destino, material propio, tipo, URL antigua]
const ROWS: Row[] = [
  ['Asistente virtual con IA para despachos de abogados: qué hace, qué no y cómo se implanta', 'asistente virtual para abogados', 'A', L, 'Agente telefónico que agendó dos citas en sus primeros minutos', 'pilar'],
  ['Cuánto cuesta un agente de IA para una empresa en 2026: setup, cuota y lo que nadie cuenta', 'cuánto cuesta un agente de IA', 'F', '/contact/', 'Qué encarece un proyecto: integraciones, canales, mantenimiento', 'pilar'],
  ['Qué automatizar primero en tu empresa (y qué no automatizar nunca)', 'qué procesos automatizar', 'B', '/auditoria/', 'Tesis: un proceso roto automatizado falla más rápido', 'pilar', '/blog/antes-de-automatizar/'],
  ['Cuánto le cuesta a un despacho una llamada que nadie contesta', 'llamadas perdidas despacho', 'A', L, 'La cuenta del ahorro de 6 números', 'articulo', '/blog/coste-real-llamada-perdida/'],
  ['Automatización de procesos internos con IA: cómo detectar el trabajo que se repite', 'automatización de procesos', 'D', '/automatizaciones-internas/', 'Caso de facturas centralizadas e IVA trimestral', 'pilar'],
  ['50 WhatsApp al día: cómo filtrar las consultas de un despacho sin revisarlas una a una', 'filtrar consultas WhatsApp', 'A', L, '«50 o 60 consultas diarias», «descartamos el 80-90 %»'],
  ['Contratar a otra persona o automatizar la atención: cómo hacer bien la cuenta', 'coste contratar recepcionista', 'F', '/contact/', 'Empresas que iban a contratar a jornada completa'],
  ['Agentes de voz y WhatsApp con IA: guía de implantación para empresas', 'agente de voz IA', 'C', '/agentes-ia-llamada/', 'Fases reales y pruebas masivas de llamadas', 'pilar'],
  ['IA en despachos de abogados: RGPD, secreto profesional y qué revisar antes de implantar', 'IA abogados RGPD', 'E', L, 'Permisos mínimos, revisión jurídica de contratos', 'pilar'],
  ['Verificación de WhatsApp Business API: plazos reales y por qué se bloquean los proyectos', 'WhatsApp Business API', 'C', '/agentes-de-texto-multicanal/', 'Proyecto parado meses por Meta'],
  ['Por qué el lead de Google Ads se enfría en minutos y cómo llamarlo al instante', 'leads Google Ads abogados', 'A', L, 'Caso voz + Google Ads'],
  ['Software a medida o herramienta estándar: cuándo merece la pena construir', 'software a medida', 'D', '/buffalo-core/', 'Cuándo decimos que no hace falta software', 'pilar'],
  ['AI Act artículo 50: avisar de que hablas con una IA. Qué cambia para chatbots y agentes de voz', 'AI Act chatbot', 'E', '/auditoria/', 'Cómo lo resolvemos en el saludo del agente. Comprobar estado de la norma'],
  ['7 errores al implantar IA en una empresa (uno es nuestro)', 'errores implantar IA', 'B', '/auditoria/', 'Empezar a desarrollar antes de cerrar alcance y accesos'],
  ['¿Molestará la IA a mis clientes? Cómo diseñar un asistente que no dañe la reputación del despacho', 'IA atención al cliente', 'A', L, 'Objeción literal de cliente; derivación a humano'],
  ['¿Suena humano un agente de voz? Lo que de verdad importa en una llamada', 'agente de voz humano', 'C', '/agentes-ia-llamada/', 'Transcripciones de pruebas, anonimizadas', 'articulo', '/blog/agente-voz-suena-humano/'],
  ['Cómo automatizar facturas y documentos con IA sin perder el control', 'automatizar facturas', 'D', '/automatizaciones-internas/', 'Caso de facturas centralizadas'],
  ['Cómo calcular el ahorro de automatizar un proceso (con tus números)', 'calcular ahorro automatización', 'B', CALC, 'La cuenta del ahorro'],
  ['Atención fuera de horario en un despacho: centralita, secretariado externo o IA', 'secretaria virtual abogados', 'A', L, 'Comparativa honesta con los servicios de secretariado'],
  ['ChatGPT no es un agente: qué cambia cuando la IA está conectada a tu CRM, agenda y teléfono', 'chatbot vs agente IA', 'C', '/agentes-de-texto-multicanal/', 'Lo que hacemos que ChatGPT no hace'],
  ['Formación en IA para empresas: cómo aplicarla por departamentos', 'formación IA empresas', 'G', AC, 'Formar con los procesos del cliente; Learning Heroes', 'pilar'],
  ['¿Qué pasa con el sistema si dejáis de pagar el mantenimiento?', 'mantenimiento sistema IA', 'F', '/contact/', 'Objeción literal de cliente'],
  ['IA para inmobiliarias: responder leads, cualificar y agendar visitas', 'IA para inmobiliarias', 'S', INM, 'Banco de ideas', 'pilar'],
  ['Estudio: cuánto tarda un despacho de Barcelona en responder', 'tiempo respuesta despachos', 'A', L, 'Datos propios de 100 despachos', 'estudio'],
  ['Cómo conectar formularios, CRM, correo y calendario sin teclear dos veces', 'integrar CRM formularios', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Grabar y transcribir llamadas con IA: qué dice la ley en España', 'grabar llamadas clientes', 'E', '/auditoria/', 'Cómo avisamos y dónde se guarda (valida Santi)'],
  ['Cuándo NO te compensa un agente de IA', 'cuándo no automatizar', 'B', '/auditoria/', 'Asesoría con 3-4 consultas cada 15 días'],
  ['Cómo automatizar el WhatsApp de una inmobiliaria sin perder leads de portales', 'WhatsApp inmobiliaria', 'S', INM, 'Banco de ideas', 'sector'],
  ['Cómo conectar un agente de IA a tu CRM, agenda y WhatsApp', 'integrar agente IA CRM', 'C', '/agentes-ia-llamada/', 'Integración con la API de un CRM propio'],
  ['Plataforma SaaS de agentes de voz o desarrollo a medida: cuándo conviene cada una', 'agente de voz a medida', 'F', '/contact/', 'Cuándo un SaaS te basta'],
  ['Qué preguntas debe hacer un asistente antes de agendar una primera consulta', 'primera consulta abogado', 'A', L, 'Guiones de agentes en producción'],
  ['Un panel para dirección: cómo reunir KPIs, conversaciones y procesos en un solo sitio', 'dashboard KPIs empresa', 'D', '/buffalo-core/', 'Buffalo Core'],
  ['12 preguntas que hacer a un proveedor de IA antes de firmar', 'elegir proveedor de IA', 'E', '/auditoria/', 'Preguntas que nos hacen en las reuniones'],
  ['Cómo cualificar leads inmobiliarios antes de llamar', 'cualificar leads inmobiliarios', 'S', INM, 'Banco de ideas', 'sector'],
  ['Formación en IA bonificada por FUNDAE: cómo funciona y qué cubre', 'formación IA FUNDAE', 'G', AC, 'Cifras Fundae verificadas: 20,5 % de empresas usa su crédito'],
  ['Auditoría de automatización: qué se revisa, cuánto dura y qué te llevas', 'auditoría de automatización', 'B', '/auditoria/', 'Cómo es nuestra auditoría'],
  ['Cómo se prueba un agente de voz antes de ponerlo en producción', 'probar agente de voz', 'C', '/agentes-ia-llamada/', 'Pruebas masivas de llamadas'],
  ['Cómo automatizar la recogida de documentos de clientes en un despacho', 'recogida documentación clientes', 'A', L, 'Banco de ideas'],
  ['Cómo automatizar presupuestos y seguimiento comercial', 'automatizar presupuestos', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Cuánto cuesta de verdad tener a alguien atendiendo el teléfono', 'coste atención telefónica', 'F', CALC, 'Coste/hora real: bruto + SS ÷ 1.750 h'],
  ['Recuperar leads inmobiliarios que no contestan: seguimiento por WhatsApp y llamada', 'seguimiento leads inmobiliaria', 'S', INM, 'Banco de ideas', 'sector'],
  ['Datos de clientes en un sistema de IA: qué se guarda, dónde y quién lo ve', 'IA protección de datos', 'E', '/auditoria/', 'Solo lo que Santi confirme por escrito'],
  ['Agente de voz para llamadas salientes: recordatorios, confirmaciones y reactivación', 'llamadas salientes IA', 'C', '/agentes-ia-llamada/', 'Banco de ideas'],
  ['No-code o desarrollo a medida: dónde está el límite de las automatizaciones', 'no-code vs desarrollo', 'D', '/buffalo-core/', 'Banco de ideas'],
  ['Cómo preparar tu empresa antes de implantar IA: procesos, datos y responsables', 'implantar IA empresa', 'B', '/auditoria/', 'Accesos y dependencias que retrasan proyectos'],
  ['Agente de IA para inmobiliarias conectado a portales y CRM', 'CRM inmobiliario IA', 'S', INM, 'Banco de ideas', 'sector'],
  ['IA para equipos administrativos: correos, documentos y hojas de cálculo', 'IA para administrativos', 'G', AC, 'Banco de ideas'],
  ['Cómo medir si un asistente de IA está funcionando bien en tu despacho', 'medir asistente virtual', 'A', L, 'Indicadores del panel'],
  ['IA para corredurías de seguros: renovaciones, recibos y primer nivel de atención', 'IA corredurías de seguros', 'S', SEG, 'Banco de ideas', 'pilar'],
  ['Automatización documental: leer, clasificar y archivar documentos con IA', 'automatización documental', 'D', '/automatizaciones-internas/', 'Cuándo compensa: volumen de documentos al mes'],
  ['WhatsApp, web e Instagram en un solo agente: cómo funciona la atención multicanal', 'atención multicanal IA', 'C', '/agentes-de-texto-multicanal/', 'Sistema multicanal de un despacho (sin cifras)'],
  ['Cuándo y cómo pasar a una persona: el diseño que separa un buen asistente de uno que molesta', 'derivación a humano', 'E', '/auditoria/', '«Que filtre lo importante y avise al equipo»'],
  ['Cómo comparar presupuestos de proyectos de IA (y qué preguntar si uno es mucho más barato)', 'presupuesto proyecto IA', 'F', '/contact/', 'Banco de ideas'],
  ['Recordatorios de pago y renovación con agentes de voz en una correduría', 'recordatorio renovación póliza', 'S', SEG, 'Banco de ideas', 'sector'],
  ['Cómo atender consultas fuera de horario sin dar asesoramiento jurídico', 'consultas jurídicas online', 'A', L, 'Límites del asistente en un despacho'],
  ['Automatizar un proceso roto: por qué falla y cómo detectarlo antes', 'errores automatizar procesos', 'B', '/auditoria/', 'Tesis de Sergi'],
  ['Cómo convertir un proceso manual en una aplicación interna', 'aplicación interna a medida', 'D', '/buffalo-core/', 'Banco de ideas'],
  ['IA para equipos comerciales: propuestas, reuniones y CRM', 'IA equipos comerciales', 'G', AC, 'Banco de ideas'],
  ['Verificar identidad y datos por teléfono con IA: qué es seguro y qué no', 'verificación de datos IA', 'S', SEG, 'Validar con Santi', 'sector'],
  ['Qué información necesita un agente de IA para responder bien y cómo se mantiene al día', 'base de conocimiento IA', 'C', '/agentes-de-texto-multicanal/', 'Bases de conocimiento de agentes en producción'],
  ['Cómo cualificar leads automáticamente antes de pasarlos al equipo', 'cualificar leads', 'A', '/agentes-de-texto-multicanal/', 'Caso de precualificación por WhatsApp'],
  ['IA y secreto profesional: 10 preguntas que se hace un socio director', 'IA secreto profesional', 'E', L, 'Preguntas de reuniones con despachos'],
  ['Informes automáticos: el informe del lunes hecho antes de que llegues', 'informes automáticos', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Proyecto de IA a medida: cuánto tarda de verdad y de qué depende', 'cuánto tarda implantar IA', 'F', '/contact/', 'Meta, accesos y dependencias externas'],
  ['Asesorías y gestorías: cuándo compensa automatizar la atención (y cuándo no)', 'IA para asesorías', 'S', SEG, 'La asesoría sin volumen; capas de IA sobre el software contable', 'sector'],
  ['Qué pasa en las primeras 4 semanas de un proyecto de automatización', 'proyecto de automatización', 'B', '/auditoria/', 'Cómo trabajamos'],
  ['La voz de un agente de IA: idiomas, acentos y cuándo hablar en catalán', 'agente de voz catalán', 'C', '/agentes-ia-llamada/', 'Clientes de Barcelona'],
  ['Cómo automatizar el alta de clientes y el papeleo inicial', 'automatizar alta clientes', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Seguimiento de consultas que no se convierten: cuándo y cómo insistir', 'seguimiento de leads', 'A', L, 'Banco de ideas'],
  ['Atención al cliente en seguros con IA: primer nivel sin colapsar al gestor', 'atención cliente seguros', 'S', SEG, 'Banco de ideas', 'sector'],
  ['Qué pasa cuando la IA se equivoca: errores, responsabilidades y cómo se corrigen', 'errores IA atención', 'E', '/auditoria/', 'Incidencias técnicas normales (webhooks, Meta), no «incidentes»'],
  ['Por qué un curso genérico de IA no cambia nada en una empresa', 'curso de IA empresas', 'G', AC, 'Formaciones de Learning Heroes'],
  ['Hacerlo en casa o con un proveedor: qué necesitas para construir tu propio agente', 'construir agente IA', 'F', '/contact/', 'Banco de ideas'],
  ['Mantenimiento de un agente de IA: qué se revisa cada mes y por qué se degrada', 'mantenimiento agente IA', 'C', '/agentes-ia-llamada/', 'Banco de ideas'],
  ['IA para clínicas: citas, recordatorios y atención al paciente', 'IA para clínicas', 'S', SAL, 'Banco de ideas', 'pilar'],
  ['Matriz para priorizar qué automatizar: volumen, repetición y criterio', 'priorizar procesos', 'B', '/auditoria/', 'Cualificadores de las 3 líneas'],
  ['Cómo eliminar el doble tecleo entre herramientas que no se hablan', 'integrar herramientas empresa', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Cómo reducir las citas perdidas con recordatorios por WhatsApp y llamada', 'reducir ausencias citas', 'S', SAL, 'Banco de ideas', 'sector'],
  ['Asistente virtual para despachos: las preguntas que nos hacen los socios directores', 'asistente virtual despacho', 'A', L, 'Preguntas literales de reuniones'],
  ['Agente de voz para clínicas: qué puede responder y qué debe derivar siempre', 'agente de voz clínica', 'S', SAL, 'Banco de ideas', 'sector'],
  ['Llamadas, WhatsApp y formularios en un mismo panel: cómo se ve la operación completa', 'panel atención multicanal', 'C', '/buffalo-core/', 'Panel de Buffalo Core'],
  ['Inventario y pedidos automatizados: avisos antes de la rotura de stock', 'automatizar inventario', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Datos de salud y IA: qué exige el RGPD a una clínica que automatiza la atención', 'RGPD clínicas IA', 'E', SAL, 'Revisión de abogado obligatoria'],
  ['IA para dirección: cómo decidir dónde aplicarla en tu empresa', 'IA para directivos', 'G', AC, 'Banco de ideas'],
  ['Recepción de una clínica con IA: quitar carga sin perder el trato', 'recepción clínica IA', 'S', SAL, 'Banco de ideas', 'sector'],
  ['Retorno de un agente de IA: cómo medirlo a los 3, 6 y 12 meses', 'ROI agente de IA', 'F', CALC, 'Métricas antes/después de casos (si ya existen)'],
  ['Cómo automatizar la facturación recurrente y los cobros', 'automatizar facturación', 'D', '/automatizaciones-internas/', 'Banco de ideas'],
  ['Clínicas dentales y estéticas: automatizar WhatsApp sin perder la venta del tratamiento', 'WhatsApp clínica dental', 'S', SAL, 'Banco de ideas', 'sector'],
  ['Lo que aprendimos automatizando: errores y aciertos de un año de proyectos', 'lecciones implantar IA', 'B', '/auditoria/', 'Proyectos del año'],
  ['Estudio 2027: cuánto tardan los despachos en responder, un año después', 'tiempo respuesta despachos', 'A', L, 'Repetición del estudio del artículo 24', 'estudio'],
]

export function calendarTopics(now = new Date().toISOString()): Topic[] {
  return ROWS.map(([title, keyword, theme, destination, ownMaterial, kind, oldUrl], i) => ({
    id: 'cal-' + String(i + 1).padStart(2, '0'),
    source: 'calendario',
    order: i + 1,
    title,
    keyword,
    theme,
    kind: kind || (theme === 'S' ? 'sector' : 'articulo'),
    destination,
    ownMaterial,
    oldUrl,
    status: 'pendiente',
    createdAt: now,
  }))
}

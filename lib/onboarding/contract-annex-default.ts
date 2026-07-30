import {
  BUFFALO_PARTY,
  formatContractDate,
  formatMoneyLine,
  type ContractClause,
  type ContractParty,
  type ContractServiceDoc,
} from '@/lib/onboarding/contract-annex-types'

type BuildInput = {
  client: ContractParty
  placeDate?: string
  /** Objeto del contrato (cláusula Primera, párrafo 1). */
  objectIntro?: string
  /** Alcance incluido (lista numerada de Primera). */
  scopeItems?: string[]
  /** Exclusiones (dash de Primera). */
  exclusions?: string[]
  /** Exponen II — interés del cliente. */
  exponenInterest?: string
  setupFeeEur?: number | null
  monthlyFeeEur?: number | null
  paymentSplit?: '50_50' | '100_upfront' | null
}

function p(html: string) {
  return { type: 'p' as const, html }
}
function amount(html: string) {
  return { type: 'amount' as const, html }
}
function numbered(items: string[]) {
  return { type: 'list' as const, style: 'numbered' as const, items }
}
function dash(items: string[]) {
  return { type: 'list' as const, style: 'dash' as const, items }
}
function sublabel(html: string) {
  return { type: 'sublabel' as const, html }
}
function ins(
  blocks: Array<
    | { type: 'p'; html: string }
    | { type: 'sublabel'; html: string }
    | { type: 'list'; style: 'numbered' | 'dash'; items: string[] }
  >
) {
  return { type: 'ins' as const, blocks }
}

const DEFAULT_OBJECT = `El presente contrato tiene por objeto la prestación por parte de Buffalo de servicios de diseño, desarrollo, configuración e implementación de un sistema de inteligencia artificial conforme a la definición del proyecto acordada con el Cliente.`

const DEFAULT_SCOPE = [
  'Diseño y configuración del sistema de inteligencia artificial contratado.',
  'Definición de flujos, lógica de decisión y comportamiento conforme a la información facilitada por el Cliente.',
  'Pruebas internas y ajustes dentro del alcance pactado.',
  'Puesta en producción del sistema una vez validado con el Cliente.',
]

const DEFAULT_EXCLUSIONS = [
  'desarrollos adicionales',
  'dashboards no contemplados',
  'automatizaciones internas complejas no incluidas',
  'CRM',
  'integraciones no contempladas inicialmente',
  'nuevas verticales',
  'agentes adicionales',
  'ampliaciones funcionales',
  'cualquier otro desarrollo distinto al aquí descrito',
]

const DEFAULT_EXPONEN_II = `Que el Cliente está interesado en implementar una solución de inteligencia artificial para mejorar su operativa, conforme a la definición del proyecto.`

/** Plantilla base del Contrato de prestación de servicios de IA. */
export function buildDefaultContractAnnex(input: BuildInput): ContractServiceDoc {
  const client = input.client
  const buffalo = BUFFALO_PARTY
  const objectIntro = (input.objectIntro || DEFAULT_OBJECT).trim()
  const scopeItems = input.scopeItems?.length ? input.scopeItems : DEFAULT_SCOPE
  const exclusions = input.exclusions?.length ? input.exclusions : DEFAULT_EXCLUSIONS
  const exponenII = (input.exponenInterest || DEFAULT_EXPONEN_II).trim()

  const setup = input.setupFeeEur != null && input.setupFeeEur > 0 ? input.setupFeeEur : null
  const monthly =
    input.monthlyFeeEur != null && input.monthlyFeeEur > 0 ? input.monthlyFeeEur : null

  const paymentItems =
    input.paymentSplit === '100_upfront'
      ? ['100 % al inicio del proyecto.']
      : ['50 % al inicio del proyecto.', '50 % a la finalización del desarrollo y antes de puesta en producción.']

  const clauses: ContractClause[] = [
    {
      id: 'primera',
      title: 'Primera — Objeto del Contrato',
      blocks: [
        p(objectIntro),
        p('En particular, el sistema podrá incluir, de forma enunciativa pero no limitativa:'),
        numbered(scopeItems),
        p(
          'Quedan expresamente excluidos del objeto del presente contrato, salvo acuerdo expreso por escrito o anexo adicional:'
        ),
        dash(exclusions.map((x) => (x.startsWith('—') ? x.replace(/^—\s*/, '') : x))),
      ],
    },
    {
      id: 'segunda',
      title: 'Segunda — Documentación funcional y definición del proyecto',
      blocks: [
        p(
          'Las partes reconocen la existencia de documentación funcional, materiales de trabajo, formularios, respuestas, ejemplos operativos y demás información facilitada por el Cliente durante la fase de análisis y definición del proyecto (en adelante, la <b>«Documentación Funcional»</b>).'
        ),
        p(
          'Dicha documentación tendrá carácter orientativo y servirá como base para la comprensión del negocio, definición de necesidades y configuración funcional del sistema, sin constituir por sí misma una obligación de entrega literal ni una definición cerrada del alcance técnico del proyecto.'
        ),
        p(
          'Las adaptaciones, modificaciones o ampliaciones que excedan del objeto descrito en el presente contrato podrán requerir validación adicional, presupuesto independiente o formalización mediante anexo.'
        ),
      ],
    },
    {
      id: 'tercera',
      title: 'Tercera — Fases del proyecto y plazos',
      blocks: [
        p('El desarrollo del sistema se estructurará, de forma orientativa, en las siguientes fases:'),
        dash([
          'Semana 1–2: diseño y desarrollo del sistema y lógica operativa.',
          'Semana 3: pruebas internas por parte de Buffalo.',
          'Semana 4: pruebas conjuntas con el Cliente, ajustes finales y preparación para puesta en producción.',
        ]),
        p(
          'Los plazos podrán ajustarse de mutuo acuerdo en función de la disponibilidad de información, feedback, validaciones o necesidades operativas del Cliente.'
        ),
      ],
    },
    {
      id: 'cuarta',
      title: 'Cuarta — Reuniones de seguimiento',
      blocks: [
        p('Durante el proyecto se prevé la realización de las siguientes reuniones:'),
        numbered([
          'Reunión inicial de definición, destinada a recopilación de requisitos, análisis funcional y casuísticas.',
          'Reunión de pruebas, para validación operativa del sistema.',
          'Reunión de puesta en producción, incluyendo, cuando proceda: configuración de API Keys, configuración de plataformas externas, configuración de métodos de pago y activación del entorno productivo.',
        ]),
      ],
    },
    {
      id: 'quinta',
      title: 'Quinta — Condiciones económicas',
      blocks: [
        p('El importe total del desarrollo e implementación asciende a:'),
        amount(setup != null ? formatMoneyLine(setup) : 'A DEFINIR + IVA'),
        ...(setup != null
          ? []
          : [p('El importe concreto se confirmará en presupuesto o factura emitida por Buffalo.')]),
        ...(monthly != null
          ? [
              p(
                'Asimismo, una vez el sistema entre en producción, se activará un servicio de mantenimiento por importe de:'
              ),
              amount(`${formatMoneyLine(monthly)} / mes`),
            ]
          : [
              p(
                'Asimismo, cuando proceda, podrá activarse un servicio de mantenimiento mensual según presupuesto facilitado por Buffalo.'
              ),
            ]),
        ins([
          sublabel('El servicio de mantenimiento mensual incluye expresamente:'),
          dash([
            'Copias de seguridad diarias de toda la configuración del agente (prompts, flujos, integraciones y datos de configuración), con retención mínima de 30 días.',
            'Soporte por correo electrónico con tiempo de respuesta máximo de 48–72 horas hábiles.',
            'Corrección de errores pequeños: ajustes de prompts, correcciones de lógica conversacional o pequeñas modificaciones de comportamiento que no impliquen nuevas funcionalidades.',
          ]),
          sublabel(
            'Quedan expresamente excluidos del mantenimiento, y requerirán presupuesto independiente:'
          ),
          dash([
            'Monitorización remota activa del agente.',
            'Revisión mensual del estado del sistema.',
            'Informes de rendimiento.',
            'Optimización de modelos de lenguaje.',
            'Soporte prioritario con respuesta en menos de 48 horas hábiles.',
            'Recuperación ante fallos graves de infraestructura (restore).',
            'Gestión de infraestructura cloud.',
            'Garantía de disponibilidad (SLA 99,5 % o similar).',
            'Nuevos flujos, integraciones, agentes o cualquier desarrollo adicional no contemplado en el contrato original.',
          ]),
        ]),
        p(
          'Las condiciones y alcance del mantenimiento se regirán por el presupuesto facilitado por Buffalo al Cliente, formando parte integrante del presente contrato.'
        ),
      ],
    },
    {
      id: 'sexta',
      title: 'Sexta — Forma de pago',
      blocks: [
        p('El pago del desarrollo se realizará mediante transferencia bancaria:'),
        dash(paymentItems),
        p('Los datos bancarios serán indicados en las correspondientes facturas emitidas por Buffalo.'),
      ],
    },
    {
      id: 'septima',
      title: 'Séptima — Propiedad intelectual',
      blocks: [
        p(
          'La solución y desarrollos específicamente realizados para el Cliente serán de su titularidad una vez abonado íntegramente el precio del contrato.'
        ),
        p(
          'No obstante, Buffalo conservará en todo momento la titularidad exclusiva sobre: arquitectura base, lógica reutilizable, prompts, agentes, metodologías, componentes genéricos, flujos reutilizables, tecnología propia, know-how, herramientas y sistemas preexistentes.'
        ),
        p(
          'El Cliente adquiere derecho de uso sobre la solución desarrollada para su operativa interna. En ningún caso dicho uso permitirá: comercializar la solución como producto propio, sublicenciarla, revenderla, reutilizarla para prestar servicios a terceros, ni transferirla fuera de su organización.'
        ),
        p(
          'Buffalo podrá reutilizar conocimientos, metodologías y estructuras genéricas derivadas del proyecto, respetando siempre la confidencialidad y sin replicar la solución concreta del Cliente.'
        ),
      ],
    },
    {
      id: 'octava',
      title: 'Octava — Confidencialidad y protección de datos',
      blocks: [
        p(
          'Las partes se comprometen a mantener absoluta confidencialidad sobre toda información, documentación, configuraciones, materiales, datos, procedimientos o información estratégica conocida durante la ejecución del proyecto. La obligación permanecerá vigente durante la duración del contrato y durante cinco (5) años posteriores a su terminación.'
        ),
        p(
          'Asimismo, ambas partes se obligan al cumplimiento del RGPD, LOPDGDD y normativa aplicable en protección de datos.'
        ),
      ],
    },
    {
      id: 'novena',
      title: 'Novena — Responsabilidad',
      blocks: [
        p(
          'Buffalo no será responsable por interrupciones de servicios externos, fallos de plataformas de terceros, proveedores IA, APIs, telefonía, cloud, servicios externos de voz, acciones u omisiones del Cliente, daños indirectos, pérdida de oportunidad ni lucro cesante.'
        ),
        p(
          'Buffalo utiliza plataformas tecnológicas y proveedores externos para la prestación del servicio, no pudiendo garantizar el funcionamiento ininterrumpido de dichos servicios ni responder por incumplimientos imputables a terceros. La responsabilidad total de Buffalo quedará limitada, en cualquier caso, al importe efectivamente abonado por el Cliente.'
        ),
        ins([
          p(
            'No obstante, la limitación de responsabilidad establecida en la presente cláusula no será de aplicación de forma automática en los siguientes supuestos, en los que Buffalo responderá conforme a la legislación vigente, siempre que el daño sea directo, acreditado y resulte imputable de forma directa y exclusiva a Buffalo:'
          ),
          dash([
            'Actuación dolosa o con negligencia grave imputable a Buffalo.',
            'Incumplimiento de las obligaciones de confidencialidad establecidas en el presente contrato.',
            'Infracción de la normativa de protección de datos personales imputable a Buffalo.',
            'Vulneración de derechos de propiedad intelectual o industrial de terceros imputable a Buffalo.',
            'Incumplimiento esencial del objeto del contrato imputable exclusivamente a Buffalo.',
          ]),
          p(
            'En todo caso, incluso en los supuestos anteriores, la responsabilidad total máxima de Buffalo quedará limitada al importe efectivamente abonado por el Cliente en virtud del presente contrato, sin que Buffalo responda por daños indirectos, pérdida de oportunidad, lucro cesante, pérdida de negocio, pérdida de datos imputable a terceros, interrupciones de servicios externos o cualesquiera daños derivados de plataformas, proveedores, APIs, servicios de telefonía, servicios cloud o sistemas ajenos a Buffalo.'
          ),
        ]),
      ],
    },
    {
      id: 'decima',
      title: 'Décima — Validación y aceptación',
      blocks: [
        ins([
          p(
            'El Cliente dispondrá de quince (15) días hábiles desde la puesta a disposición del sistema o entregables para comunicar por escrito incidencias relevantes o desviaciones respecto del alcance acordado. Transcurrido dicho plazo sin observaciones por escrito, el entregable se entenderá aceptado.'
          ),
          p(
            'La aceptación del sistema no impedirá al Cliente solicitar la corrección de errores técnicos, defectos ocultos, fallos recurrentes o desviaciones funcionales detectadas con posterioridad durante el uso ordinario del sistema, siempre que dichos errores sean objetivamente imputables al desarrollo realizado por Buffalo y no deriven de cambios solicitados por el Cliente, modificaciones en plataformas externas, APIs, servicios de telefonía, proveedores de inteligencia artificial, infraestructura cloud, integraciones de terceros o usos distintos al alcance pactado.'
          ),
          p(
            'En ningún caso dicha corrección incluirá nuevas funcionalidades, ampliaciones del alcance, nuevos flujos, nuevas integraciones, cambios de criterio de negocio, rediseños funcionales o desarrollos adicionales, que deberán presupuestarse de forma independiente.'
          ),
        ]),
      ],
    },
    {
      id: 'undecima',
      title: 'Undécima — Comunicaciones',
      blocks: [
        p(
          'Las comunicaciones y notificaciones relacionadas con la ejecución del presente contrato podrán realizarse por correo electrónico a las direcciones facilitadas por las partes, produciendo efectos desde su envío.'
        ),
      ],
    },
    {
      id: 'duodecima',
      title: 'Duodécima — Duración y resolución',
      blocks: [
        p(
          'El presente contrato entrará en vigor desde su firma y desde la realización del primer pago. El mantenimiento tendrá carácter mensual y continuará vigente hasta que cualquiera de las partes comunique su resolución con un preaviso mínimo de quince (15) días naturales.'
        ),
      ],
    },
    {
      id: 'decimotercera',
      title: 'Decimotercera — Servicios futuros',
      blocks: [
        p(
          'Toda ampliación del proyecto, nuevos agentes, automatizaciones, dashboards, integraciones adicionales o nuevos desarrollos requerirá presupuesto independiente o anexo específico.'
        ),
      ],
    },
    {
      id: 'decimocuarta',
      title: 'Decimocuarta — Ley aplicable y jurisdicción',
      blocks: [
        p(
          'El presente contrato se regirá por la legislación española y europea aplicable. Para cualquier controversia derivada de su interpretación o ejecución, las partes se someten expresamente a los Juzgados y Tribunales de Barcelona, con renuncia expresa a cualquier otro fuero.'
        ),
      ],
    },
  ]

  return {
    version: 1,
    doc_type: 'service_contract',
    title: 'Contrato de prestación de servicios de inteligencia artificial',
    place_date: `En Barcelona, a ${input.placeDate || formatContractDate()}.`,
    client,
    buffalo,
    reunidos_closing:
      'Ambas partes, reconociéndose mutuamente la capacidad legal necesaria para contratar y obligarse, acuerdan suscribir el presente contrato de prestación de servicios (en adelante, el <b>«Contrato»</b>), que se regirá por las siguientes:',
    exponen: [
      {
        label: 'I.',
        html: 'Que Buffalo es una sociedad especializada en el desarrollo de soluciones de inteligencia artificial, automatización de procesos y sistemas de atención al cliente mediante agentes conversacionales.',
      },
      { label: 'II.', html: exponenII },
      {
        label: 'III.',
        html: 'Que ambas partes desean regular la prestación de dichos servicios mediante el presente Contrato.',
      },
    ],
    exponen_closing: 'En virtud de lo anterior, las partes acuerdan las siguientes:',
    clauses,
    signatures: {
      client_name: client.representative.replace(/^D\.\s*/i, '').trim() || client.legal_name,
      client_role: `Representante legal — ${client.legal_name}`,
      client_cif: client.cif,
    },
    conformity_note:
      'Este contrato ha sido suscrito en dos ejemplares originales, quedando uno en poder de cada parte. La firma del presente documento implica la aceptación íntegra de su contenido.',
  }
}

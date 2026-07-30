// contract.jsx — Contrato Buffalo IA ↔ M7 Consulting (agente de voz IA)
// Con inserciones en ROJO (amendments) marcadas con className="ins".
const { useState, useEffect } = React;

const CONTRACT_DEFAULTS = /*EDITMODE-BEGIN*/{
  "watermark": "single",
  "bodyFont": "plex",
  "density": "regular",
  "showHeader": false
}/*EDITMODE-END*/;

function Watermark({ style }) {
  if (style === "none") return null;
  if (style === "single") {
    return <div className="wm"><div className="wm-single"><span>BUFFALO</span></div></div>;
  }
  if (style === "diagonal") {
    const cells = [];
    for (let i = 0; i < 15; i++) cells.push(<span key={i}>BUFFALO</span>);
    return <div className="wm"><div className="wm-diag">{cells}</div></div>;
  }
  if (style === "tile") {
    const cells = [];
    for (let i = 0; i < 60; i++) cells.push(<span key={i}>BUFFALO</span>);
    return <div className="wm"><div className="wm-tile">{cells}</div></div>;
  }
  if (style === "stamp") {
    return (
      <div className="wm" style={{ opacity: 0.08 }}>
        <div className="wm-stamp"><span>BUFFALO</span></div>
      </div>
    );
  }
  if (style === "perimeter") {
    return (
      <div className="wm" style={{ opacity: 0.06 }}>
        <div className="wm-perimeter"><div className="center">BUFFALO</div></div>
      </div>
    );
  }
  return null;
}

function Page({ children, n, total, label, watermark, showHeader }) {
  return (
    <div className="page" data-screen-label={`${String(n).padStart(2, "0")} ${label}`}>
      <Watermark style={watermark} />
      <div className="page-inner">
        {showHeader && (
          <div className="doc-head">
            <span><b>BUFFALO</b> · Contrato de prestación de servicios de IA</span>
            <span>M7 Consulting SLU</span>
          </div>
        )}
        {children}
        <div className="doc-foot">
          <span>agenciabuffalo.es</span>
          <span><b>{label}</b></span>
          <span>Pág. {String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}

// ─── 01 · Título · Reunidos · Exponen ────────────────────────────────────────
function PageReunidos({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Reunidos · Exponen" watermark={watermark} showHeader={showHeader}>
      <h1 className="doc-title" style={{ textAlign: "center" }}>Contrato de prestación de servicios de inteligencia artificial</h1>
      <p className="doc-date" style={{ textAlign: "center" }}>En Barcelona, a 15 de junio de 2026.</p>
      <hr className="rule" />

      <h2 className="section">Reunidos</h2>
      <p className="body">De una parte,</p>
      <p className="body">
        <b>Buffalo IA Global Digital Solutions, S.L.</b>, con domicilio social en Calle Provença,
        Pta. 2 Esc. B — 08025 (Barcelona), y número de identificación fiscal B22944599, representada
        por D. Santiago Miralbell Costa y D. Sergi Masoliver López, en calidad de administradores
        (en adelante, <b>«Buffalo»</b>).
      </p>
      <p className="body">Y de otra parte,</p>
      <p className="body">
        <b>M7 Consulting SLU</b>, con CIF B75923664 y domicilio social en C/ Italia 1-3, 2º 8ª,
        08320 El Masnou (Barcelona), representada por D. Alex Melero García (en adelante,
        el <b>«Cliente»</b>).
      </p>
      <p className="body">
        Ambas partes, reconociéndose mutuamente la capacidad legal necesaria para contratar y
        obligarse, acuerdan suscribir el presente contrato de prestación de servicios (en adelante,
        el <b>«Contrato»</b>), que se regirá por las siguientes:
      </p>

      <h2 className="section" style={{ marginTop: "8mm" }}>Exponen</h2>
      <p className="body">
        <b>I.</b> Que Buffalo es una sociedad especializada en el desarrollo de soluciones de
        inteligencia artificial, automatización de procesos y sistemas de atención al cliente
        mediante agentes conversacionales.
      </p>
      <p className="body">
        <b>II.</b> Que el Cliente está interesado en implementar un sistema de agente de voz con
        inteligencia artificial para la gestión, filtrado y cualificación de llamadas entrantes
        dentro de su operativa.
      </p>
      <p className="body">
        <b>III.</b> Que ambas partes desean regular la prestación de dichos servicios mediante el
        presente Contrato.
      </p>
      <p className="body">En virtud de lo anterior, las partes acuerdan las siguientes:</p>
    </Page>
  );
}

// ─── 02 · Cláusula Primera (Objeto) ──────────────────────────────────────────
function PagePrimera({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Cláusulas" watermark={watermark} showHeader={showHeader}>
      <h2 className="section">Cláusulas</h2>

      <h3 className="clause">Primera — Objeto del Contrato</h3>
      <p className="body">
        El presente contrato tiene por objeto la prestación por parte de Buffalo de servicios de
        diseño, desarrollo, configuración e implementación de un sistema de agente de voz basado en
        inteligencia artificial para la gestión de llamadas entrantes del Cliente.
      </p>
      <p className="body">
        En particular, el sistema podrá incluir, de forma enunciativa pero no limitativa:
      </p>
      <ol className="list">
        <li>Atención automatizada de llamadas mediante agente de voz con inteligencia artificial.</li>
        <li>Identificación y clasificación de interlocutores conforme a los criterios definidos por el Cliente.</li>
        <li>Filtrado de llamadas no cualificadas según reglas de negocio y criterios operativos definidos durante la fase de configuración.</li>
        <li>Derivación automática de llamadas hacia números o responsables designados por el Cliente.</li>
        <li>Gestión de llamadas no derivadas mediante recogida de información relevante y generación de avisos o resúmenes.</li>
        <li>Configuración del flujo conversacional, lógica de decisión y comportamiento general del sistema conforme a la información facilitada por el Cliente.</li>
      </ol>
      <p className="body">
        Quedan expresamente excluidos del objeto del presente contrato, salvo acuerdo expreso por
        escrito o anexo adicional:
      </p>
      <ul className="dash">
        <li>— desarrollos adicionales</li>
        <li>— dashboards</li>
        <li>— automatizaciones internas complejas</li>
        <li>— CRM</li>
        <li>— integraciones no contempladas inicialmente</li>
        <li>— nuevas verticales</li>
        <li>— agentes adicionales</li>
        <li>— ampliaciones funcionales</li>
        <li>— cualquier otro desarrollo distinto al aquí descrito</li>
      </ul>
    </Page>
  );
}

// ─── 03 · Segunda · Tercera · Cuarta ─────────────────────────────────────────
function PageSegunda({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Cláusulas" watermark={watermark} showHeader={showHeader}>
      <h3 className="clause" style={{ marginTop: 0 }}>Segunda — Documentación funcional y definición del proyecto</h3>
      <p className="body">
        Las partes reconocen la existencia de documentación funcional, materiales de trabajo,
        formularios, respuestas, ejemplos operativos y demás información facilitada por el Cliente
        durante la fase de análisis y definición del proyecto (en adelante, la
        <b> «Documentación Funcional»</b>).
      </p>
      <p className="body">
        Dicha documentación tendrá carácter orientativo y servirá como base para la comprensión del
        negocio, definición de necesidades y configuración funcional del sistema, sin constituir por
        sí misma una obligación de entrega literal ni una definición cerrada del alcance técnico del
        proyecto.
      </p>
      <p className="body">
        Las adaptaciones, modificaciones o ampliaciones que excedan del objeto descrito en el
        presente contrato podrán requerir validación adicional, presupuesto independiente o
        formalización mediante anexo.
      </p>

      <h3 className="clause">Tercera — Fases del proyecto y plazos</h3>
      <p className="body">
        El desarrollo del sistema se estructurará, de forma orientativa, en las siguientes fases:
      </p>
      <ul className="dash">
        <li>— Semana 1–2: diseño y desarrollo del agente de voz y lógica operativa.</li>
        <li>— Semana 3: pruebas internas por parte de Buffalo.</li>
        <li>— Semana 4: pruebas conjuntas con el Cliente, ajustes finales y preparación para puesta en producción.</li>
      </ul>
      <p className="body">
        Los plazos podrán ajustarse de mutuo acuerdo en función de la disponibilidad de información,
        feedback, validaciones o necesidades operativas del Cliente.
      </p>

      <h3 className="clause">Cuarta — Reuniones de seguimiento</h3>
      <p className="body">Durante el proyecto se prevé la realización de las siguientes reuniones:</p>
      <ol className="list">
        <li>Reunión inicial de definición, destinada a recopilación de requisitos, análisis funcional y casuísticas.</li>
        <li>Reunión de pruebas, para validación operativa del sistema.</li>
        <li>Reunión de puesta en producción, incluyendo, cuando proceda: configuración de API Keys, configuración de plataformas externas, configuración de métodos de pago y activación del entorno productivo.</li>
      </ol>
    </Page>
  );
}

// ─── 04 · Quinta (Económicas) + Mantenimiento [ROJO] ─────────────────────────
function PageQuinta({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Cláusulas" watermark={watermark} showHeader={showHeader}>
      <h3 className="clause" style={{ marginTop: 0 }}>Quinta — Condiciones económicas</h3>
      <p className="body">El importe total del desarrollo e implementación asciende a:</p>
      <p className="body" style={{ fontWeight: 600, fontSize: "12pt" }}>DOS MIL DOSCIENTOS EUROS (2.200 €) + IVA</p>
      <p className="body">
        Asimismo, una vez el sistema entre en producción, se activará un servicio de mantenimiento
        por importe de:
      </p>
      <p className="body" style={{ fontWeight: 600, fontSize: "12pt" }}>NOVENTA EUROS (90 €) + IVA / mes</p>

      {/* ── INSERCIÓN EN ROJO ── */}
      <div className="ins">
        <p className="sublabel">El servicio de mantenimiento mensual incluye expresamente:</p>
        <ul className="dash">
          <li>— Copias de seguridad diarias de toda la configuración del agente (prompts, flujos, integraciones y datos de configuración), con retención mínima de 30 días.</li>
          <li>— Soporte por correo electrónico con tiempo de respuesta máximo de 48–72 horas hábiles.</li>
          <li>— Corrección de errores pequeños: ajustes de prompts, correcciones de lógica conversacional o pequeñas modificaciones de comportamiento que no impliquen nuevas funcionalidades.</li>
        </ul>
        <p className="sublabel">Quedan expresamente excluidos del mantenimiento, y requerirán presupuesto independiente:</p>
        <ul className="dash">
          <li>— Monitorización remota activa del agente.</li>
          <li>— Revisión mensual del estado del sistema.</li>
          <li>— Informes de rendimiento.</li>
          <li>— Optimización de modelos de lenguaje.</li>
          <li>— Soporte prioritario con respuesta en menos de 48 horas hábiles.</li>
          <li>— Recuperación ante fallos graves de infraestructura (restore).</li>
          <li>— Gestión de infraestructura cloud.</li>
          <li>— Garantía de disponibilidad (SLA 99,5 % o similar).</li>
          <li>— Nuevos flujos, integraciones, agentes o cualquier desarrollo adicional no contemplado en el contrato original.</li>
        </ul>
      </div>

      <p className="body">
        Las condiciones y alcance del mantenimiento se regirán por el presupuesto facilitado por
        Buffalo al Cliente, formando parte integrante del presente contrato.
      </p>
    </Page>
  );
}

// ─── 05 · Sexta + Séptima (Propiedad) + Kontactalia [ROJO] ───────────────────
function PageSeptima({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Cláusulas" watermark={watermark} showHeader={showHeader}>
      <h3 className="clause" style={{ marginTop: 0 }}>Sexta — Forma de pago</h3>
      <p className="body">El pago del desarrollo se realizará mediante transferencia bancaria:</p>
      <ul className="dash">
        <li>— 50 % al inicio del proyecto.</li>
        <li>— 50 % a la finalización del desarrollo y antes de puesta en producción.</li>
      </ul>
      <p className="body">
        Los datos bancarios serán indicados en las correspondientes facturas emitidas por Buffalo.
      </p>

      <h3 className="clause">Séptima — Propiedad intelectual</h3>
      <p className="body">
        La solución y desarrollos específicamente realizados para el Cliente serán de su titularidad
        una vez abonado íntegramente el precio del contrato.
      </p>
      <p className="body">
        No obstante, Buffalo conservará en todo momento la titularidad exclusiva sobre: arquitectura
        base, lógica reutilizable, prompts, agentes, metodologías, componentes genéricos, flujos
        reutilizables, tecnología propia, know-how, herramientas y sistemas preexistentes.
      </p>
      <p className="body">
        El Cliente adquiere derecho de uso sobre la solución desarrollada para su operativa interna.
        En ningún caso dicho uso permitirá: comercializar la solución como producto propio,
        sublicenciarla, revenderla, reutilizarla para prestar servicios a terceros, ni transferirla
        fuera de su organización.
      </p>

      {/* ── INSERCIÓN EN ROJO ── */}
      <div className="ins">
        <p className="body">
          No obstante lo anterior, el Cliente podrá utilizar la solución en su propia operativa y en
          la de sociedades vinculadas, participadas, filiales, marcas comerciales, webs o proyectos
          empresariales relacionados con el grupo Kontactalia, siempre que dichas entidades estén
          controladas directa o indirectamente por D. Alejandro Melero García, sin que dicho uso se
          considere sublicencia, cesión, reventa o explotación por terceros.
        </p>
      </div>

      <p className="body">
        Buffalo podrá reutilizar conocimientos, metodologías y estructuras genéricas derivadas del
        proyecto, respetando siempre la confidencialidad y sin replicar la solución concreta del
        Cliente.
      </p>
    </Page>
  );
}

// ─── 06 · Octava + Novena (Responsabilidad) + excepciones [ROJO] ─────────────
function PageNovena({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Cláusulas" watermark={watermark} showHeader={showHeader}>
      <h3 className="clause" style={{ marginTop: 0 }}>Octava — Confidencialidad y protección de datos</h3>
      <p className="body">
        Las partes se comprometen a mantener absoluta confidencialidad sobre toda información,
        documentación, configuraciones, materiales, datos, procedimientos o información estratégica
        conocida durante la ejecución del proyecto. La obligación permanecerá vigente durante la
        duración del contrato y durante cinco (5) años posteriores a su terminación.
      </p>
      <p className="body">
        Asimismo, ambas partes se obligan al cumplimiento del RGPD, LOPDGDD y normativa aplicable en
        protección de datos.
      </p>

      <h3 className="clause">Novena — Responsabilidad</h3>
      <p className="body">
        Buffalo no será responsable por interrupciones de servicios externos, fallos de plataformas
        de terceros, proveedores IA, APIs, telefonía, cloud, servicios externos de voz, acciones u
        omisiones del Cliente, daños indirectos, pérdida de oportunidad ni lucro cesante.
      </p>
      <p className="body">
        Buffalo utiliza plataformas tecnológicas y proveedores externos para la prestación del
        servicio, no pudiendo garantizar el funcionamiento ininterrumpido de dichos servicios ni
        responder por incumplimientos imputables a terceros. La responsabilidad total de Buffalo
        quedará limitada, en cualquier caso, al importe efectivamente abonado por el Cliente.
      </p>

      {/* ── INSERCIÓN EN ROJO ── */}
      <div className="ins">
        <p className="body">
          No obstante, la limitación de responsabilidad establecida en la presente cláusula no será
          de aplicación de forma automática en los siguientes supuestos, en los que Buffalo
          responderá conforme a la legislación vigente, siempre que el daño sea directo, acreditado y
          resulte imputable de forma directa y exclusiva a Buffalo:
        </p>
        <ul className="dash">
          <li>— Actuación dolosa o con negligencia grave imputable a Buffalo.</li>
          <li>— Incumplimiento de las obligaciones de confidencialidad establecidas en el presente contrato.</li>
          <li>— Infracción de la normativa de protección de datos personales imputable a Buffalo.</li>
          <li>— Vulneración de derechos de propiedad intelectual o industrial de terceros imputable a Buffalo.</li>
          <li>— Incumplimiento esencial del objeto del contrato imputable exclusivamente a Buffalo.</li>
        </ul>
        <p className="body">
          En todo caso, incluso en los supuestos anteriores, la responsabilidad total máxima de
          Buffalo quedará limitada al importe efectivamente abonado por el Cliente en virtud del
          presente contrato, sin que Buffalo responda por daños indirectos, pérdida de oportunidad,
          lucro cesante, pérdida de negocio, pérdida de datos imputable a terceros, interrupciones de
          servicios externos o cualesquiera daños derivados de plataformas, proveedores, APIs,
          servicios de telefonía, servicios cloud o sistemas ajenos a Buffalo.
        </p>
      </div>
    </Page>
  );
}

// ─── 07 · Décima [ROJO] + Undécima → Decimocuarta ────────────────────────────
function PageDecima({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Cláusulas" watermark={watermark} showHeader={showHeader}>
      <h3 className="clause" style={{ marginTop: 0 }}>Décima — Validación y aceptación</h3>

      {/* ── INSERCIÓN EN ROJO (sustituye el plazo anterior de 5 días) ── */}
      <div className="ins">
        <p className="body">
          El Cliente dispondrá de quince (15) días hábiles desde la puesta a disposición del sistema
          o entregables para comunicar por escrito incidencias relevantes o desviaciones respecto del
          alcance acordado. Transcurrido dicho plazo sin observaciones por escrito, el entregable se
          entenderá aceptado.
        </p>
        <p className="body">
          La aceptación del sistema no impedirá al Cliente solicitar la corrección de errores
          técnicos, defectos ocultos, fallos recurrentes o desviaciones funcionales detectadas con
          posterioridad durante el uso ordinario del sistema, siempre que dichos errores sean
          objetivamente imputables al desarrollo realizado por Buffalo y no deriven de cambios
          solicitados por el Cliente, modificaciones en plataformas externas, APIs, servicios de
          telefonía, proveedores de inteligencia artificial, infraestructura cloud, integraciones de
          terceros o usos distintos al alcance pactado.
        </p>
        <p className="body">
          En ningún caso dicha corrección incluirá nuevas funcionalidades, ampliaciones del alcance,
          nuevos flujos, nuevas integraciones, cambios de criterio de negocio, rediseños funcionales
          o desarrollos adicionales, que deberán presupuestarse de forma independiente.
        </p>
      </div>

      <h3 className="clause">Undécima — Comunicaciones</h3>
      <p className="body">
        Las comunicaciones y notificaciones relacionadas con la ejecución del presente contrato
        podrán realizarse por correo electrónico a las direcciones facilitadas por las partes,
        produciendo efectos desde su envío.
      </p>

      <h3 className="clause">Duodécima — Duración y resolución</h3>
      <p className="body">
        El presente contrato entrará en vigor desde su firma y desde la realización del primer pago.
        El mantenimiento tendrá carácter mensual y continuará vigente hasta que cualquiera de las
        partes comunique su resolución con un preaviso mínimo de quince (15) días naturales.
      </p>

      <h3 className="clause">Decimotercera — Servicios futuros</h3>
      <p className="body">
        Toda ampliación del proyecto, nuevos agentes, automatizaciones, dashboards, integraciones
        adicionales o nuevos desarrollos requerirá presupuesto independiente o anexo específico.
      </p>
    </Page>
  );
}

// ─── 08 · Conformidad y firmas ───────────────────────────────────────────────
function PageFirmas({ n, total, watermark, showHeader }) {
  return (
    <Page n={n} total={total} label="Firmas" watermark={watermark} showHeader={showHeader}>
      <h3 className="clause" style={{ marginTop: 0 }}>Decimocuarta — Ley aplicable y jurisdicción</h3>
      <p className="body">
        El presente contrato se regirá por la legislación española y europea aplicable. Para
        cualquier controversia derivada de su interpretación o ejecución, las partes se someten
        expresamente a los Juzgados y Tribunales de Barcelona, con renuncia expresa a cualquier otro
        fuero.
      </p>

      <h2 className="section" style={{ marginTop: "9mm" }}>Conformidad y firmas</h2>
      <p className="body">
        Y en prueba de conformidad con todo lo anterior, ambas partes suscriben el presente Contrato
        por duplicado y a un solo efecto en el lugar y fecha indicados en la primera página.
      </p>

      <div className="role" style={{ marginTop: "10mm" }}>Por Buffalo IA Global Digital Solutions, S.L.</div>
      <div className="signatures" style={{ marginTop: "1mm" }}>
        <div className="sig">
          <div className="sig-line">
            <div className="who">Santiago Miralbell Costa</div>
            <div className="role">Administrador</div>
            <div className="dni">CIF · B22944599</div>
          </div>
        </div>
        <div className="sig">
          <div className="sig-line">
            <div className="who">Sergi Masoliver López</div>
            <div className="role">Administrador</div>
            <div className="dni">CIF · B22944599</div>
          </div>
        </div>
      </div>

      <div className="role" style={{ marginTop: "10mm" }}>Por el Cliente</div>
      <div className="signatures" style={{ marginTop: "1mm" }}>
        <div className="sig">
          <div className="sig-line">
            <div className="who">Alex Melero García</div>
            <div className="role">Representante legal — M7 Consulting SLU</div>
            <div className="dni">CIF · B75923664</div>
          </div>
        </div>
        <div></div>
      </div>

      <p className="body" style={{ marginTop: "10mm", fontSize: "9.5pt", color: "var(--muted)" }}>
        Este contrato ha sido suscrito en dos ejemplares originales, quedando uno en poder de cada
        parte. La firma del presente documento implica la aceptación íntegra de su contenido.
      </p>
    </Page>
  );
}

function App() {
  const [t, setTweak] = useTweaks(CONTRACT_DEFAULTS);

  useEffect(() => {
    document.body.dataset.body = t.bodyFont;
    document.body.dataset.density = t.density;
  }, [t.bodyFont, t.density]);

  const total = 8;

  return (
    <>
      <div className="workspace">
        <div className="workspace-top" data-print-hide>
          <div className="ws-meta">Contrato · Buffalo IA ↔ M7 Consulting</div>
          <div className="ws-title">Contrato de prestación de servicios de IA</div>
          <div className="ws-pages">{total} páginas · A4</div>
        </div>

        <PageReunidos n={1} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PagePrimera  n={2} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PageSegunda  n={3} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PageQuinta   n={4} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PageSeptima  n={5} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PageNovena   n={6} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PageDecima   n={7} total={total} watermark={t.watermark} showHeader={t.showHeader} />
        <PageFirmas   n={8} total={total} watermark={t.watermark} showHeader={t.showHeader} />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Marca de agua" />
        <TweakSelect
          label="Estilo"
          value={t.watermark}
          options={["single", "diagonal", "tile", "stamp", "perimeter", "none"]}
          onChange={(v) => setTweak("watermark", v)}
        />

        <TweakSection label="Tipografía" />
        <TweakSelect
          label="Cuerpo"
          value={t.bodyFont}
          options={["plex", "inter", "manrope", "system"]}
          onChange={(v) => setTweak("bodyFont", v)}
        />
        <TweakRadio
          label="Densidad"
          value={t.density}
          options={["tight", "regular", "airy"]}
          onChange={(v) => setTweak("density", v)}
        />

        <TweakSection label="Composición" />
        <TweakToggle
          label="Cabecera en páginas"
          value={t.showHeader}
          onChange={(v) => setTweak("showHeader", v)}
        />

        <TweakSection label="Exportar" />
        <TweakButton label="Imprimir / PDF" onClick={() => window.print()} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

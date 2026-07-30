// annex.jsx — Anexo I · Encargo de Tratamiento de Datos Personales (DPA)
// Misma plantilla que el contrato. Cláusulas como bloques + reparto compacto.
const { useState, useEffect } = React;

const ANNEX_DEFAULTS = /*EDITMODE-BEGIN*/{
  "watermark": "single",
  "bodyFont": "plex",
  "density": "regular",
  "showHeader": false
}/*EDITMODE-END*/;

function Watermark({ style }) {
  if (style === "none") return null;
  if (style === "single") return <div className="wm"><div className="wm-single"><span>BUFFALO</span></div></div>;
  if (style === "diagonal") {
    const c = []; for (let i = 0; i < 15; i++) c.push(<span key={i}>BUFFALO</span>);
    return <div className="wm"><div className="wm-diag">{c}</div></div>;
  }
  if (style === "tile") {
    const c = []; for (let i = 0; i < 60; i++) c.push(<span key={i}>BUFFALO</span>);
    return <div className="wm"><div className="wm-tile">{c}</div></div>;
  }
  if (style === "stamp") return <div className="wm" style={{ opacity: 0.08 }}><div className="wm-stamp"><span>BUFFALO</span></div></div>;
  if (style === "perimeter") return <div className="wm" style={{ opacity: 0.06 }}><div className="wm-perimeter"><div className="center">BUFFALO</div></div></div>;
  return null;
}

function Page({ children, n, total, label, watermark, showHeader }) {
  return (
    <div className="page" data-screen-label={`${String(n).padStart(2, "0")} ${label}`}>
      <Watermark style={watermark} />
      <div className="page-inner">
        {showHeader && (
          <div className="doc-head">
            <span><b>BUFFALO</b> · Anexo I — Encargo de tratamiento de datos</span>
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

function P({ children }) { return <p className="body">{children}</p>; }
function Alpha({ items }) {
  return <ol className="alpha">{items.map((t, i) => <li key={i}>{t}</li>)}</ol>;
}
// Clause block. `first` removes the top margin when it opens a page.
function C({ title, first, children }) {
  return (
    <React.Fragment>
      <h3 className="clause" style={first ? { marginTop: 0 } : null}>{title}</h3>
      {children}
    </React.Fragment>
  );
}

// ─── Cláusulas (bloques) ─────────────────────────────────────────────────────
const Clauses = {
  reunidos: () => (
    <React.Fragment>
      <h1 className="doc-title" style={{ textAlign: "center" }}>Anexo I — Encargo de tratamiento de datos personales</h1>
      <p className="doc-date" style={{ textAlign: "center" }}>En Barcelona, a 15 de junio de 2026.</p>
      <hr className="rule" />
      <h2 className="section">Reunidos</h2>
      <P>De una parte,</P>
      <P>
        <b>M7 Consulting SLU</b>, con CIF B75923664 y domicilio social en C/ Italia 1-3, 2º 8ª,
        08320 El Masnou (Barcelona), representada por D. Alex Melero García, en adelante, el
        <b> «Cliente»</b> o el <b>«Responsable del Tratamiento»</b>.
      </P>
      <P>Y de otra parte,</P>
      <P>
        <b>Buffalo IA Global Digital Solutions, S.L.</b>, con CIF B22944599 y domicilio social en
        Calle Provença, Pta. 2 Esc. B — 08025 (Barcelona), representada por D. Santiago Miralbell
        Costa y D. Sergi Masoliver López, en adelante, <b>«Buffalo»</b> o el
        <b> «Encargado del Tratamiento»</b>.
      </P>
      <P>
        Ambas partes, reconociéndose mutuamente la capacidad legal necesaria, acuerdan incorporar el
        presente Anexo al contrato de prestación de servicios de inteligencia artificial suscrito
        entre ellas, formando parte integrante del mismo.
      </P>
      <h2 className="section" style={{ marginTop: "8mm" }}>Cláusulas</h2>
    </React.Fragment>
  ),

  primera: (first) => (
    <C first={first} title="Primera — Objeto del Anexo">
      <P>
        El presente Anexo regula el acceso y tratamiento de datos personales que Buffalo pueda
        realizar por cuenta del Cliente como consecuencia del diseño, desarrollo, configuración,
        implementación, soporte y mantenimiento de un sistema de agente de voz con inteligencia
        artificial destinado a la gestión, filtrado y cualificación de llamadas entrantes.
      </P>
      <P>
        Buffalo tratará los datos personales únicamente para la prestación del servicio contratado,
        siguiendo las instrucciones documentadas del Cliente y sin utilizarlos para finalidades
        propias distintas de la correcta ejecución del contrato principal.
      </P>
    </C>
  ),

  segunda: (first) => (
    <C first={first} title="Segunda — Posición de las partes">
      <P>
        El Cliente actuará como <b>Responsable del Tratamiento</b>, al determinar las finalidades,
        medios esenciales, criterios de uso, base jurídica, destinatarios y condiciones del
        tratamiento de los datos personales tratados mediante el sistema.
      </P>
      <P>
        Buffalo actuará como <b>Encargado del Tratamiento</b>, al tratar datos personales por cuenta
        del Cliente y únicamente en el marco de la prestación de los servicios contratados.
      </P>
    </C>
  ),

  tercera: (first) => (
    <C first={first} title="Tercera — Finalidad del tratamiento">
      <P>Los datos personales podrán ser tratados con las siguientes finalidades:</P>
      <Alpha items={[
        "Atender llamadas entrantes mediante un agente de voz con inteligencia artificial.",
        "Identificar, clasificar y cualificar interlocutores conforme a los criterios definidos por el Cliente.",
        "Recoger información relevante facilitada durante la llamada.",
        "Generar avisos, registros, resúmenes, transcripciones o clasificaciones operativas, cuando la configuración del sistema lo requiera.",
        "Derivar llamadas o información a los números, responsables, canales o sistemas designados por el Cliente.",
        "Revisar incidencias técnicas, corregir errores, ajustar prompts, flujos o lógica conversacional dentro del alcance contratado.",
        "Mantener el correcto funcionamiento técnico del sistema durante la vigencia del contrato principal y, en su caso, del servicio de mantenimiento contratado.",
      ]} />
    </C>
  ),

  cuarta: (first) => (
    <C first={first} title="Cuarta — Categorías de datos tratados">
      <P>
        En función del uso efectivo del sistema y de la información facilitada por las personas que
        contacten telefónicamente con el Cliente, podrán tratarse las siguientes categorías de datos:
      </P>
      <Alpha items={[
        "Datos identificativos: nombre, apellidos, empresa, cargo o representación.",
        "Datos de contacto: teléfono, correo electrónico u otros datos de comunicación.",
        "Información facilitada voluntariamente durante la llamada.",
        "Datos de voz, en caso de que el sistema procese audio para la prestación del servicio.",
        "Grabaciones de llamadas, si el sistema se configura para generarlas, procesarlas o conservarlas.",
        "Transcripciones, resúmenes, etiquetas, clasificaciones o notas operativas derivadas de las llamadas.",
        "Datos técnicos necesarios para el funcionamiento del sistema, como fecha, hora, duración de llamada, identificadores técnicos, registros de actividad, logs o información técnica asociada al servicio.",
      ]} />
      <P>
        No se prevé el tratamiento intencionado de categorías especiales de datos personales. En caso
        de que durante una llamada un interlocutor facilite voluntariamente información de este tipo,
        Buffalo la tratará únicamente de forma incidental, siguiendo las instrucciones del Cliente y
        sin utilizarla para finalidades propias.
      </P>
    </C>
  ),

  quinta: (first) => (
    <C first={first} title="Quinta — Categorías de interesados">
      <P>Los datos personales tratados podrán corresponder a:</P>
      <Alpha items={[
        "Clientes actuales del Cliente.",
        "Potenciales clientes, leads o contactos comerciales.",
        "Usuarios que llamen a números gestionados por el Cliente.",
        "Representantes, empleados, colaboradores o interlocutores de empresas que contacten con el Cliente.",
        "Personas físicas que intervengan en comunicaciones relacionadas con la operativa del Cliente.",
      ]} />
    </C>
  ),

  sexta: (first) => (
    <C first={first} title="Sexta — Duración del tratamiento">
      <P>
        El tratamiento tendrá la misma duración que el contrato principal y, en su caso, que el
        servicio de mantenimiento contratado.
      </P>
      <P>
        Finalizada la relación contractual, Buffalo deberá suprimir o devolver los datos personales
        tratados por cuenta del Cliente, según las instrucciones razonables de este, salvo que exista
        una obligación legal de conservación o resulte necesaria su conservación durante el tiempo
        imprescindible para atender posibles responsabilidades derivadas de la prestación del
        servicio.
      </P>
    </C>
  ),

  septima: (first) => (
    <C first={first} title="Séptima — Instrucciones del Cliente">
      <P>Buffalo tratará los datos personales únicamente conforme a las instrucciones documentadas del Cliente.</P>
      <P>
        Tendrán la consideración de instrucciones documentadas el contrato principal, el presente
        Anexo, las indicaciones facilitadas por escrito por el Cliente, la documentación funcional
        del proyecto y las configuraciones acordadas para el funcionamiento del sistema.
      </P>
      <P>
        Si Buffalo considerase que alguna instrucción del Cliente pudiera ser contraria a la
        normativa aplicable en materia de protección de datos, lo comunicará al Cliente para que este
        pueda valorarlo y, en su caso, modificar la instrucción correspondiente.
      </P>
    </C>
  ),

  octava: (first) => (
    <C first={first} title="Octava — Obligaciones de Buffalo">
      <P>Buffalo se compromete a:</P>
      <Alpha items={[
        "Tratar los datos personales únicamente conforme a las instrucciones documentadas del Cliente.",
        "No utilizar los datos personales para finalidades propias, comerciales, publicitarias o ajenas a la prestación del servicio contratado.",
        "No comunicar los datos personales a terceros salvo cuando sea necesario para la prestación del servicio, conforme a lo previsto en este Anexo o por obligación legal.",
        "Garantizar que las personas autorizadas para tratar datos personales se comprometan a respetar la confidencialidad.",
        "Aplicar medidas técnicas y organizativas razonables para proteger los datos personales tratados.",
        "Ayudar razonablemente al Cliente, en la medida de sus posibilidades técnicas, a atender solicitudes de ejercicio de derechos de los interesados.",
        "Comunicar al Cliente, sin dilación indebida, cualquier violación de seguridad de datos personales de la que tenga conocimiento y que afecte a datos tratados por cuenta del Cliente.",
        "Colaborar razonablemente con el Cliente para acreditar el cumplimiento de las obligaciones previstas en este Anexo.",
        "Suprimir o devolver los datos personales al finalizar la prestación del servicio, conforme a las instrucciones razonables del Cliente.",
      ]} />
    </C>
  ),

  novena: (first) => (
    <C first={first} title="Novena — Obligaciones del Cliente">
      <P>El Cliente será responsable de:</P>
      <Alpha items={[
        "Determinar la finalidad y base jurídica del tratamiento de los datos personales.",
        "Informar adecuadamente a los interesados sobre el tratamiento de sus datos personales.",
        "Obtener los consentimientos, autorizaciones o habilitaciones legales que sean necesarios, cuando proceda.",
        "Determinar si procede informar sobre la grabación, transcripción, análisis automatizado o tratamiento mediante sistemas de inteligencia artificial.",
        "Facilitar a Buffalo instrucciones claras, lícitas y documentadas sobre el tratamiento de los datos.",
        "Garantizar que los datos personales facilitados o tratados mediante el sistema pueden ser tratados conforme a la normativa aplicable.",
        "Revisar y aprobar, cuando proceda, los textos legales, locuciones informativas, políticas de privacidad, cláusulas informativas o avisos necesarios para el uso del sistema.",
        "Valorar si el tratamiento requiere evaluaciones, análisis de riesgos, registros internos o cualquier otra obligación propia del Responsable del Tratamiento.",
      ]} />
    </C>
  ),

  decima: (first) => (
    <C first={first} title="Décima — Proveedores externos y subencargados">
      <P>
        El Cliente autoriza de forma general a Buffalo a utilizar proveedores tecnológicos externos
        cuando sean necesarios para la prestación del servicio contratado.
      </P>
      <P>
        Dichos proveedores podrán incluir, de forma enunciativa pero no limitativa, herramientas de
        inteligencia artificial, servicios de voz, servicios de telefonía, plataformas de
        automatización, hosting, cloud, bases de datos, almacenamiento, correo electrónico, analítica,
        monitorización técnica o infraestructura necesaria para el funcionamiento del sistema.
      </P>
      <P>
        Buffalo procurará utilizar proveedores que ofrezcan garantías razonables de seguridad y
        cumplimiento normativo, teniendo en cuenta la naturaleza del servicio contratado.
      </P>
      <P>
        En caso de incorporación o sustitución de un proveedor que implique un cambio relevante en el
        tratamiento de datos personales, Buffalo informará al Cliente cuando sea razonablemente
        necesario, otorgándole la posibilidad de formular observaciones por motivos fundados
        relacionados con la protección de datos.
      </P>
      <P>
        Cuando Buffalo recurra a subencargados que traten datos personales por cuenta del Cliente,
        procurará que dichos subencargados asuman obligaciones de protección de datos sustancialmente
        equivalentes a las previstas en el presente Anexo.
      </P>
    </C>
  ),

  undecima: (first) => (
    <C first={first} title="Undécima — Grabaciones, transcripciones y resúmenes">
      <P>
        En caso de que el sistema genere, procese o conserve grabaciones, transcripciones, resúmenes,
        clasificaciones o registros derivados de las llamadas, el Cliente será responsable de informar
        a los interlocutores y de contar con la base jurídica necesaria para dicho tratamiento.
      </P>
      <P>
        Buffalo tratará dichas grabaciones, transcripciones, resúmenes o registros únicamente para
        prestar el servicio contratado, realizar ajustes técnicos, resolver incidencias, mantener el
        sistema o ejecutar instrucciones del Cliente.
      </P>
      <P>
        Salvo instrucción distinta del Cliente o necesidad técnica justificada para la prestación del
        servicio, Buffalo no utilizará las grabaciones, transcripciones, resúmenes o datos de llamadas
        para fines propios, comerciales, publicitarios o de entrenamiento de modelos propios.
      </P>
    </C>
  ),

  duodecima: (first) => (
    <C first={first} title="Duodécima — Conservación de los datos">
      <P>
        Los datos personales tratados mediante el sistema se conservarán durante el tiempo necesario
        para la prestación del servicio, la resolución de incidencias, el mantenimiento técnico o el
        cumplimiento de instrucciones del Cliente.
      </P>
      <P>
        El Cliente podrá solicitar por escrito la eliminación o devolución de los datos personales
        tratados por Buffalo, siempre que dicha eliminación sea técnicamente posible y no exista
        obligación legal o necesidad legítima de conservación para atender responsabilidades derivadas
        del servicio.
      </P>
      <P>
        En relación con grabaciones, transcripciones, resúmenes o registros operativos, las partes
        podrán acordar plazos concretos de conservación en función de la configuración técnica del
        sistema, las necesidades operativas del Cliente y la normativa aplicable.
      </P>
    </C>
  ),

  decimotercera: (first) => (
    <C first={first} title="Decimotercera — Medidas de seguridad">
      <P>
        Buffalo aplicará medidas técnicas y organizativas razonables, adecuadas a la naturaleza del
        servicio, al estado de la técnica y al riesgo del tratamiento, incluyendo, cuando proceda:
      </P>
      <Alpha items={[
        "Acceso restringido a las herramientas y sistemas utilizados para prestar el servicio.",
        "Uso de credenciales, permisos y controles de acceso.",
        "Deber de confidencialidad para las personas que intervengan en la prestación del servicio.",
        "Uso de proveedores tecnológicos con medidas de seguridad adecuadas.",
        "Copias de seguridad de la configuración del sistema cuando formen parte del mantenimiento contratado.",
        "Revisión y corrección de incidencias técnicas dentro del alcance contratado.",
        "Medidas razonables para evitar accesos no autorizados, pérdida, alteración o comunicación indebida de datos personales.",
        "Limitación del acceso a los datos personales a aquellas personas o proveedores que lo necesiten para prestar el servicio.",
        "Gestión razonable de incidencias técnicas o de seguridad detectadas durante la prestación del servicio.",
      ]} />
      <P>
        Estas medidas no implican una garantía absoluta de seguridad ni una obligación de
        disponibilidad continua del sistema, especialmente cuando intervengan proveedores, plataformas,
        APIs, servicios cloud, servicios de telefonía, servicios de inteligencia artificial o sistemas
        ajenos a Buffalo.
      </P>
    </C>
  ),

  decimocuarta: (first) => (
    <C first={first} title="Decimocuarta — Ejercicio de derechos">
      <P>
        Si Buffalo recibiera directamente una solicitud de acceso, rectificación, supresión,
        oposición, limitación, portabilidad o cualquier otro derecho en materia de protección de datos
        relacionado con datos tratados por cuenta del Cliente, lo comunicará al Cliente sin dilación
        indebida, salvo que esté legalmente obligado a responder directamente.
      </P>
      <P>
        Buffalo colaborará razonablemente con el Cliente, en la medida de sus posibilidades técnicas,
        para atender dichas solicitudes.
      </P>
      <P>El Cliente será responsable de responder a los interesados y de valorar la procedencia legal de cada solicitud.</P>
    </C>
  ),

  decimoquinta: (first) => (
    <C first={first} title="Decimoquinta — Violaciones de seguridad">
      <P>
        Buffalo notificará al Cliente, sin dilación indebida, cualquier violación de seguridad de
        datos personales de la que tenga conocimiento y que afecte a datos tratados por cuenta del
        Cliente.
      </P>
      <P>
        La comunicación incluirá, en la medida en que sea posible, la información disponible sobre la
        naturaleza de la incidencia, los datos afectados, las posibles consecuencias y las medidas
        adoptadas o propuestas para mitigar sus efectos.
      </P>
      <P>
        El Cliente será responsable de valorar si procede realizar comunicaciones a la autoridad de
        control o a los interesados afectados, sin perjuicio de la colaboración razonable que pueda
        prestar Buffalo.
      </P>
    </C>
  ),

  decimosexta: (first) => (
    <C first={first} title="Decimosexta — Transferencias internacionales">
      <P>
        En caso de que la prestación del servicio implique el uso de proveedores ubicados fuera del
        Espacio Económico Europeo o el acceso a datos desde terceros países, Buffalo procurará que
        dicho tratamiento se realice conforme a las garantías previstas en la normativa aplicable.
      </P>
      <P>
        El Cliente reconoce que determinados proveedores tecnológicos, especialmente de inteligencia
        artificial, cloud, voz, telefonía o automatización, pueden operar con infraestructuras
        internacionales, por lo que autoriza su uso siempre que resulte necesario para la prestación
        del servicio y se apliquen garantías razonables conforme a la normativa aplicable.
      </P>
    </C>
  ),

  decimoseptima: (first) => (
    <C first={first} title="Decimoséptima — Auditoría y colaboración">
      <P>
        Buffalo pondrá a disposición del Cliente la información razonablemente necesaria para acreditar
        el cumplimiento de las obligaciones establecidas en este Anexo, siempre que dicha solicitud sea
        proporcionada, esté justificada y no comprometa secretos empresariales, información
        confidencial, seguridad de sistemas, derechos de terceros o documentación interna no
        relacionada directamente con el tratamiento objeto del encargo.
      </P>
      <P>
        Cualquier actuación de revisión, auditoría o comprobación deberá acordarse previamente entre
        las partes y realizarse de forma que no afecte de manera desproporcionada a la actividad
        ordinaria de Buffalo.
      </P>
    </C>
  ),

  decimoctava: (first) => (
    <C first={first} title="Decimoctava — Confidencialidad">
      <P>
        Buffalo mantendrá la confidencialidad sobre los datos personales e información a los que tenga
        acceso con motivo de la prestación del servicio, incluso después de finalizada la relación
        contractual.
      </P>
      <P>Esta obligación se entiende sin perjuicio de las obligaciones de confidencialidad ya previstas en el contrato principal.</P>
    </C>
  ),

  decimonovena: (first) => (
    <C first={first} title="Decimonovena — Responsabilidad">
      <P>
        Buffalo responderá únicamente por los daños directos, acreditados e imputables de forma directa
        y exclusiva a Buffalo que deriven del incumplimiento de las obligaciones que le correspondan
        como Encargado del Tratamiento, conforme a la normativa aplicable y al contrato principal.
      </P>
      <P>
        Buffalo no será responsable de tratamientos realizados por instrucciones del Cliente, de la
        ausencia o insuficiencia de base jurídica del tratamiento, de la falta de información a los
        interesados, de textos legales o locuciones no facilitadas o no aprobadas por el Cliente, ni de
        decisiones sobre finalidades, medios esenciales o conservación de datos determinadas por el
        Cliente.
      </P>
      <P>
        Tampoco será responsable de incumplimientos imputables a proveedores externos, plataformas,
        APIs, servicios cloud, servicios de telefonía, servicios de inteligencia artificial o sistemas
        ajenos a Buffalo, salvo que el daño sea consecuencia directa de una actuación dolosa o
        negligencia grave imputable exclusivamente a Buffalo.
      </P>
    </C>
  ),

  vigesima: (first) => (
    <C first={first} title="Vigésima — Prevalencia">
      <P>
        En caso de contradicción entre el presente Anexo y el contrato principal, prevalecerá lo
        dispuesto en este Anexo únicamente en materia de protección de datos personales.
      </P>
      <P>En todo lo no previsto expresamente en este Anexo, será de aplicación lo establecido en el contrato principal.</P>
      <P>Y en prueba de conformidad, ambas partes firman el presente Anexo en la fecha indicada.</P>
    </C>
  ),
};

function Firmas() {
  return (
    <React.Fragment>
      <h2 className="section">Firmas</h2>
      <div className="role" style={{ marginTop: "8mm" }}>Por Buffalo IA Global Digital Solutions, S.L.</div>
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
    </React.Fragment>
  );
}

// ─── Reparto compacto de páginas ─────────────────────────────────────────────
// Cada página lista las cláusulas que contiene (la primera de cada página
// recibe first=true para quitar el margen superior).
const PAGES = [
  { label: "Reunidos",  blocks: ["reunidos", "primera"] },
  { label: "Cláusulas", blocks: ["segunda", "tercera"] },
  { label: "Cláusulas", blocks: ["cuarta", "quinta"] },
  { label: "Cláusulas", blocks: ["sexta", "septima"] },
  { label: "Cláusulas", blocks: ["octava"] },
  { label: "Cláusulas", blocks: ["novena", "decima"] },
  { label: "Cláusulas", blocks: ["undecima", "duodecima"] },
  { label: "Cláusulas", blocks: ["decimotercera", "decimocuarta"] },
  { label: "Cláusulas", blocks: ["decimoquinta", "decimosexta", "decimoseptima"] },
  { label: "Cláusulas", blocks: ["decimoctava", "decimonovena"] },
  { label: "Firmas",    blocks: ["vigesima", "__firmas"] },
];

function App() {
  const [t, setTweak] = useTweaks(ANNEX_DEFAULTS);
  useEffect(() => {
    document.body.dataset.body = t.bodyFont;
    document.body.dataset.density = t.density;
  }, [t.bodyFont, t.density]);

  const total = PAGES.length;

  return (
    <>
      <div className="workspace">
        <div className="workspace-top" data-print-hide>
          <div className="ws-meta">Anexo I · Encargo de tratamiento de datos</div>
          <div className="ws-title">Buffalo IA ↔ M7 Consulting · DPA</div>
          <div className="ws-pages">{total} páginas · A4</div>
        </div>

        {PAGES.map((pg, pi) => (
          <Page key={pi} n={pi + 1} total={total} label={pg.label} watermark={t.watermark} showHeader={t.showHeader}>
            {pg.blocks.map((key, bi) => {
              if (key === "__firmas") return <Firmas key={bi} />;
              if (key === "reunidos") return <React.Fragment key={bi}>{Clauses.reunidos()}</React.Fragment>;
              const isFirstClauseOnPage = bi === 0 || (bi === 1 && pg.blocks[0] === "reunidos");
              return <React.Fragment key={bi}>{Clauses[key](isFirstClauseOnPage)}</React.Fragment>;
            })}
          </Page>
        ))}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Marca de agua" />
        <TweakSelect label="Estilo" value={t.watermark}
          options={["single", "diagonal", "tile", "stamp", "perimeter", "none"]}
          onChange={(v) => setTweak("watermark", v)} />
        <TweakSection label="Tipografía" />
        <TweakSelect label="Cuerpo" value={t.bodyFont}
          options={["plex", "inter", "manrope", "system"]}
          onChange={(v) => setTweak("bodyFont", v)} />
        <TweakRadio label="Densidad" value={t.density}
          options={["tight", "regular", "airy"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Composición" />
        <TweakToggle label="Cabecera en páginas" value={t.showHeader}
          onChange={(v) => setTweak("showHeader", v)} />
        <TweakSection label="Exportar" />
        <TweakButton label="Imprimir / PDF" onClick={() => window.print()} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

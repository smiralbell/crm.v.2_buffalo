/**
 * Estilos de la plantilla de informe Buffalo, como string inyectable en un <style>.
 * (Next.js no permite importar CSS global desde componentes; por eso va como string.)
 * Colores vía variables --bf-* definidas en el contenedor raíz (ver buffaloTheme.ts).
 *
 * v2: la portada ocupa una página; el contenido es un FLUJO CONTINUO (.bf-flow) sin
 * alturas fijas ni saltos de página por sección. El PDF lo trocea por bloques.
 */
export const BUFFALO_REPORT_CSS = `
.buffalo-doc {
  --bf-page-w: 8.5in;
  --bf-page-h: 11in;
  --bf-pad-x: 0.85in;
  background: transparent;
  color: var(--bf-text);
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.buffalo-doc * { box-sizing: border-box; }

/* --- Portada: una página completa, bloque centrado --- */
.buffalo-cover {
  width: var(--bf-page-w);
  height: var(--bf-page-h);
  background: var(--bf-bg);
  color: var(--bf-text);
  padding: 0.85in;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  overflow: hidden;
  box-sizing: border-box;
}
.buffalo-heading { font-family: 'Space Grotesk','Inter',sans-serif; color: var(--bf-heading); }

.bf-cover-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 6.3in;
}

.bf-eyebrow {
  font-size: 12.5px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bf-accent); margin: 0 0 18px;
}
.bf-cover-logo { height: 26px; width: auto; object-fit: contain; margin-bottom: 40px; }
.bf-h1 {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 36px; font-weight: 700;
  line-height: 1.15; letter-spacing: -0.02em; color: var(--bf-heading); margin: 0;
}
.bf-rule { width: 56px; height: 4px; background: var(--bf-accent); border-radius: 2px; margin: 22px auto; }
.bf-subtitle {
  font-size: 15px; color: var(--bf-cover-muted); line-height: 1.45; margin: 0;
  max-width: 4.9in; text-wrap: pretty; font-weight: 450;
}
.bf-subtitle p { margin: 0 0 8px; font-size: inherit; line-height: inherit; color: inherit; }
.bf-subtitle p:last-child { margin-bottom: 0; }
.buffalo-doc[data-kind="proposal"] .bf-subtitle {
  font-size: 14.5px;
  max-width: 4.6in;
  letter-spacing: 0.01em;
}
.bf-meta-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 32px;
  border-top: 1px solid var(--bf-border); padding-top: 20px; margin-top: 50px;
  width: 100%;
}

/* Portada de propuesta (meta 2×2, logo grande) */
.buffalo-doc[data-kind="proposal"] .bf-cover-logo { height: 72px; margin-bottom: 28px; }
.buffalo-doc[data-kind="proposal"] .bf-h1 { font-size: 32px; max-width: 6.2in; }
.buffalo-doc[data-kind="proposal"] .bf-meta-grid {
  grid-template-columns: repeat(2, 1fr);
  gap: 28px 40px;
  max-width: 6.2in;
}

/* Preview en pantalla: hojas más redondeadas (el PDF las imprime cuadradas) */
.buffalo-doc.proposal-preview-soft .buffalo-cover,
.buffalo-doc.proposal-preview-soft .bf-page {
  border-radius: 22px;
  overflow: hidden;
}

/* Propuestas: página A4 en preview (mismo ratio que el PDF) */
.buffalo-doc[data-kind="proposal"] {
  --bf-page-w: 210mm;
  --bf-page-h: 297mm;
}

.bf-meta-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--bf-cover-muted); text-align: center; margin: 0 0 6px;
}
.bf-meta-value {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 13px; font-weight: 600;
  color: var(--bf-heading); text-align: center; margin: 0;
}

/* --- Flujo continuo (informes) --- */
.bf-flow {
  width: var(--bf-page-w);
  min-height: var(--bf-page-h);
  background: var(--bf-bg);
  color: var(--bf-text);
  padding: 0.7in var(--bf-pad-x);
  box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* --- Hojas de contenido (propuestas / plantilla docs) --- */
.bf-page {
  width: var(--bf-page-w);
  min-height: var(--bf-page-h);
  background: var(--bf-bg);
  color: var(--bf-text);
  padding: 0.55in var(--bf-pad-x) 0.45in;
  box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  break-after: page;
  page-break-after: always;
  position: relative;
}
/* Propuesta: hoja A4 (mínimo) con header arriba y footer abajo — siempre visibles */
.buffalo-doc[data-kind="proposal"] .bf-page {
  min-height: var(--bf-page-h);
}
.bf-page-body {
  flex: 1 1 auto;
  min-height: 0;
}
.bf-page-body > .bf-h2:first-child { margin-top: 0; }

/* Encabezado y pie de página (plantilla) */
.bf-flow-header {
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  border-bottom: 1px solid var(--bf-border); padding-bottom: 10px; margin-bottom: 20px;
  flex: none;
}
.bf-header-logo { height: 18px; width: auto; object-fit: contain; }
.bf-header-title {
  font-size: 10.5px; color: var(--bf-header-text); letter-spacing: 0.02em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 4.5in;
}
.bf-flow-footer {
  margin-top: auto;
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  border-top: 1px solid var(--bf-border); padding-top: 10px;
  font-size: 9.5px; color: var(--bf-header-text); letter-spacing: 0.03em;
  flex: none;
}

/* Cada bloque de primer nivel no se parte al paginar */
.bf-flow > *:not(.bf-flow-header):not(.bf-flow-footer),
.bf-page-body > * { break-inside: avoid; page-break-inside: avoid; }

.bf-h2 {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 16px; font-weight: 700;
  color: var(--bf-heading); display: flex; align-items: center; gap: 12px; margin: 26px 0 12px;
}
.bf-h2:first-child { margin-top: 0; }
.bf-numbadge {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 10px; font-weight: 700;
  color: var(--bf-accent-contrast); background: var(--bf-accent);
  border-radius: 3px; padding: 3px 7px; line-height: 1;
}

.bf-flow h3, .bf-page h3 {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 11.5px; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--bf-accent); margin: 16px 0 8px;
}
.bf-flow p, .bf-page p { font-size: 12.5px; color: var(--bf-text); margin: 0 0 12px; line-height: 1.55; }
.bf-flow strong, .bf-page strong { font-weight: 700; color: var(--bf-heading); }
.bf-flow a, .bf-page a { color: var(--bf-accent); text-decoration: underline; text-underline-offset: 2px; }

.bf-flow ul, .bf-page ul { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.bf-flow ul > li, .bf-page ul > li { position: relative; padding-left: 16px; font-size: 12.5px; line-height: 1.55; color: var(--bf-text); }
.bf-flow ul > li::before, .bf-page ul > li::before {
  content: ''; position: absolute; left: 0; top: 7px; width: 4px; height: 4px;
  border-radius: 50%; background: var(--bf-accent);
}

.bf-flow ol, .bf-page ol {
  list-style: none; counter-reset: bf-step; margin: 0 0 12px; padding: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.bf-flow ol > li, .bf-page ol > li {
  counter-increment: bf-step; position: relative; padding: 0 0 8px 32px;
  font-size: 12.5px; line-height: 1.55; color: var(--bf-text); border-bottom: 1px solid var(--bf-border);
}
.bf-flow ol > li:last-child, .bf-page ol > li:last-child { border-bottom: none; padding-bottom: 0; }
.bf-flow ol > li::before, .bf-page ol > li::before {
  content: counter(bf-step); position: absolute; left: 0; top: 0; width: 20px; height: 20px;
  border-radius: 50%; border: 1.5px solid var(--bf-accent); color: var(--bf-accent);
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

/* Gráficos SVG */
.bf-chart {
  margin: 12px 0; padding: 12px 16px; background: var(--bf-surface);
  border: 1px solid var(--bf-border); border-radius: 6px; break-inside: avoid; page-break-inside: avoid;
}
.bf-chart-title {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 11.5px; font-weight: 700;
  letter-spacing: 0.03em; color: var(--bf-accent); margin: 0 0 8px;
}
.bf-chart svg { max-width: 100%; height: auto; }
.bf-chart-donut { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.bf-chart-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; }
.bf-chart-legend-col { flex-direction: column; gap: 5px; flex: 1; min-width: 140px; }
.bf-chart-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--bf-text); }
.bf-chart-swatch { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; }
.bf-chart-empty { font-size: 11px; color: var(--bf-muted); margin: 0; }
.bf-chart table { width: 100%; border-collapse: collapse; font-size: 11px; }
.bf-chart th { text-align: left; color: var(--bf-muted); font-size: 10px; text-transform: uppercase; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--bf-border); }
.bf-chart td { padding: 4px 8px 4px 0; border-bottom: 1px solid var(--bf-border); color: var(--bf-text); }

/* Tablas (GFM + :::table) */
.bf-table-wrap {
  margin: 0 0 16px; border: 1px solid var(--bf-border); border-radius: 12px;
  overflow: hidden; background: var(--bf-bg); break-inside: avoid; page-break-inside: avoid;
}
.bf-table-wrap table { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: fixed; margin: 0; }
.bf-table-wrap thead th {
  text-align: left; font-weight: 700; color: var(--bf-heading); font-size: 10px;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: var(--bf-surface); border-bottom: 1px solid var(--bf-border);
  padding: 11px 14px;
}
.bf-table-wrap tbody td {
  color: var(--bf-text); padding: 11px 14px; border-bottom: 1px solid var(--bf-border);
  vertical-align: top; line-height: 1.45;
}
.bf-table-wrap tbody tr:last-child td { border-bottom: none; }
.bf-table-wrap tbody tr { break-inside: avoid; }
.bf-table-wrap.striped tbody tr:nth-child(even) { background: var(--bf-surface); }
.bf-table-wrap.compare thead th {
  background: var(--bf-accent); color: var(--bf-accent-contrast); border-bottom: none;
}
.bf-table-wrap.compare tbody td:first-child { font-weight: 650; color: var(--bf-heading); width: 28%; }
.bf-table-wrap.pricing thead th { text-align: center; }
.bf-table-wrap.pricing tbody td { text-align: center; }
.bf-table-wrap.pricing tbody td:first-child { text-align: left; font-weight: 650; color: var(--bf-heading); }
.bf-table-wrap.cards { border: none; background: transparent; border-radius: 0; }
.bf-table-wrap.cards table { border-collapse: separate; border-spacing: 0 8px; }
.bf-table-wrap.cards thead { display: none; }
.bf-table-wrap.cards tbody td {
  background: var(--bf-surface); border: 1px solid var(--bf-border);
  border-left: none; border-right: none; padding: 14px 16px;
}
.bf-table-wrap.cards tbody td:first-child {
  border-left: 1px solid var(--bf-border); border-radius: 10px 0 0 10px;
  font-weight: 700; color: var(--bf-heading);
}
.bf-table-wrap.cards tbody td:last-child {
  border-right: 1px solid var(--bf-border); border-radius: 0 10px 10px 0;
}

/* Fallback si hay tabla GFM sin wrap (informes legacy) */
.bf-flow > table, .bf-page-body > table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 0 0 14px; }
.bf-flow > table thead th, .bf-page-body > table thead th {
  text-align: left; font-weight: 600; color: var(--bf-muted); font-size: 10px;
  letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid var(--bf-border);
  padding: 0 12px 9px 0;
}
.bf-flow > table tbody td, .bf-page-body > table tbody td { color: var(--bf-text); padding: 9px 12px 9px 0; border-bottom: 1px solid var(--bf-border); vertical-align: top; }

/* Burbujas */
.bf-bubble {
  margin: 0 0 14px; padding: 16px 20px 16px 22px; border-radius: 18px 18px 18px 6px;
  background: var(--bf-surface); border: 1px solid var(--bf-border);
  border-left: 4px solid var(--bf-accent); break-inside: avoid; page-break-inside: avoid;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
}
.bf-bubble.soft, .bf-bubble.muted {
  background: var(--bf-surface2); border-left-color: var(--bf-muted); border-radius: 16px;
}
.bf-bubble.warn {
  background: var(--bf-warn-surface); border-left-color: var(--bf-warn);
}
.bf-bubble-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--bf-accent); margin: 0 0 6px;
}
.bf-bubble.warn .bf-bubble-title { color: var(--bf-warn); }
.bf-bubble-body { font-size: 12.5px; line-height: 1.5; color: var(--bf-text); }
.bf-bubble-body p { margin: 0 0 6px; font-size: inherit; }
.bf-bubble-body p:last-child { margin-bottom: 0; }

/* Cards / burbujas en grid */
.bf-cards {
  display: grid; gap: 12px; margin: 0 0 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  break-inside: avoid; page-break-inside: avoid;
}
.bf-cards.cols-1 { grid-template-columns: 1fr; }
.bf-cards.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.bf-cards.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.bf-card {
  background: var(--bf-surface); border: 1px solid var(--bf-border);
  border-radius: 14px; padding: 16px 18px; break-inside: avoid;
  display: flex; flex-direction: column; gap: 8px;
}
.bf-card.accent { border-color: var(--bf-accent); box-shadow: inset 0 0 0 1px var(--bf-accent); }
.bf-card.warn { background: var(--bf-warn-surface); border-color: var(--bf-warn); }
.bf-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.bf-card-title {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 13.5px; font-weight: 700;
  color: var(--bf-heading); margin: 0; line-height: 1.3;
}
.bf-card-badge {
  flex: 0 0 auto; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--bf-accent-contrast); background: var(--bf-accent);
  border-radius: 999px; padding: 3px 8px; line-height: 1.2;
}
.bf-card-body { font-size: 12px; line-height: 1.5; color: var(--bf-text); }
.bf-card-body p { margin: 0 0 6px; font-size: inherit; }
.bf-card-body p:last-child { margin-bottom: 0; }
.bf-card-body ul { margin: 0; }

/* Firmas / aceptación */
.bf-signatures { margin: 8px 0 0; break-inside: avoid; }
.bf-sig-parties {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 0 0 28px;
}
.bf-sig-card {
  background: var(--bf-surface); border: 1px solid var(--bf-border);
  border-radius: 10px; padding: 16px 18px;
}
.bf-sig-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--bf-accent); margin: 0 0 8px;
}
.bf-sig-name {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 14px; font-weight: 650;
  color: var(--bf-heading); margin: 0 0 6px; line-height: 1.3;
}
.bf-sig-meta { font-size: 11.5px; color: var(--bf-muted); margin: 0 0 3px; line-height: 1.4; }
.bf-sig-lines {
  display: grid; grid-template-columns: 1fr 1fr; gap: 28px 36px; margin-top: 8px;
}
.bf-sig-block { min-height: 1.4in; }
.bf-sig-row {
  display: flex; align-items: flex-end; gap: 12px; margin-top: 22px;
  font-size: 12px; color: var(--bf-muted);
}
.bf-sig-row.tall { margin-top: 36px; min-height: 48px; }
.bf-sig-row > span:first-child { flex: 0 0 auto; min-width: 42px; }
.bf-sig-line {
  flex: 1; border-bottom: 1px solid var(--bf-border); min-height: 1px;
  display: block;
}
.bf-sig-row.tall .bf-sig-line { min-height: 40px; }

@media print {
  .bf-sig-card { background: transparent; }
  .bf-sig-parties, .bf-sig-lines { break-inside: avoid; }
}

/* KPIs */
.bf-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); gap: 14px; margin: 0 0 14px; }
.bf-kpi { background: var(--bf-surface); border: 1px solid var(--bf-border); border-radius: 6px; padding: 14px 16px; break-inside: avoid; }
.bf-kpi-value { font-family: 'Space Grotesk','Inter',sans-serif; font-size: 22px; font-weight: 700; color: var(--bf-heading); line-height: 1.1; }
.bf-kpi-value.pending { color: var(--bf-muted); font-size: 16px; }
.bf-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bf-muted); margin-top: 4px; }
.bf-kpi-delta { font-size: 11px; font-weight: 600; margin-top: 6px; }
.bf-kpi-delta.up { color: var(--bf-accent); }
.bf-kpi-delta.down { color: var(--bf-down); }
.bf-kpi-delta.flat { color: var(--bf-muted); }
.bf-kpi-hint { font-size: 10px; color: var(--bf-muted); margin-top: 4px; }

/* Callout */
.bf-callout {
  display: flex; gap: 14px; background: var(--bf-surface); border-radius: 4px;
  padding: 14px 16px; margin: 0 0 14px; border-left: 3px solid var(--bf-accent); break-inside: avoid;
}
.bf-callout.warn { background: var(--bf-warn-surface); border-left-color: var(--bf-warn); }
.bf-callout.down { border-left-color: var(--bf-down); }
.bf-callout-label { text-transform: uppercase; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; color: var(--bf-accent); margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.bf-callout.warn .bf-callout-label { color: var(--bf-warn); }
.bf-callout.down .bf-callout-label { color: var(--bf-down); }
.bf-callout-body { font-size: 12px; line-height: 1.5; color: var(--bf-text); flex: 1; }
.bf-callout-body p { margin: 0 0 6px; font-size: 12px; }
.bf-callout-body p:last-child { margin-bottom: 0; }

/* Píldora de semáforo */
.bf-semaforo {
  display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 10px;
  font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.02em;
}
.bf-semaforo.ok { background: var(--bf-ok); }
.bf-semaforo.amber { background: var(--bf-amber); }
.bf-semaforo.red { background: var(--bf-red); }

/* Highlight */
.bf-highlight { background: var(--bf-accent); border-radius: 6px; padding: 18px 22px; margin: 0 0 14px; break-inside: avoid; }
.bf-highlight, .bf-highlight p, .bf-highlight strong {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 15px; font-weight: 600;
  color: var(--bf-accent-contrast); line-height: 1.4;
}
.bf-highlight p { margin: 0; }

/* Checklist */
.bf-checklist { background: var(--bf-surface2); border: 1px solid var(--bf-border); border-radius: 6px; padding: 16px 20px; margin: 0 0 14px; list-style: none; display: flex; flex-direction: column; }
.bf-checklist-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--bf-border); font-size: 12px; line-height: 1.45; color: var(--bf-text); break-inside: avoid; }
.bf-checklist-item:first-child { padding-top: 0; }
.bf-checklist-item:last-child { border-bottom: none; padding-bottom: 0; }
.bf-checklist-item p { margin: 0; font-size: 12px; }
.bf-check { flex: 0 0 auto; width: 15px; height: 15px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; line-height: 1; margin-top: 1px; }
.bf-check.on { background: var(--bf-accent); color: var(--bf-accent-contrast); }
.bf-check.off { background: transparent; border: 1.5px solid var(--bf-border); color: transparent; }

/* ROI */
.bf-roi { display: grid; grid-template-columns: repeat(5,1fr); gap: 12px; margin: 0 0 14px; padding: 16px; background: var(--bf-surface2); border: 1px solid var(--bf-border); border-radius: 8px; break-inside: avoid; }
.bf-roi .bf-kpi { background: var(--bf-bg); }

@media (max-width: 900px) {
  .buffalo-cover, .bf-flow, .bf-page { width: 100%; }
  .buffalo-cover { height: auto; min-height: 70vh; }
  .bf-page { min-height: auto; }
  .bf-h1 { font-size: 28px; }
  .bf-meta-grid { grid-template-columns: repeat(2,1fr); gap: 20px; }
  .bf-roi { grid-template-columns: repeat(2,1fr); }
}
`

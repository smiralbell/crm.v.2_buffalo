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

/* --- Portada: una página completa, centrada --- */
.buffalo-cover {
  width: var(--bf-page-w);
  height: var(--bf-page-h);
  background: var(--bf-bg);
  color: var(--bf-text);
  padding: 0.85in;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  overflow: hidden;
}
.buffalo-heading { font-family: 'Space Grotesk','Inter',sans-serif; color: var(--bf-heading); }

.bf-eyebrow {
  font-size: 12.5px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bf-accent); margin: 0 0 18px;
}
.bf-cover-logo { height: 26px; width: auto; object-fit: contain; margin-bottom: 40px; }
.bf-h1 {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 36px; font-weight: 700;
  line-height: 1.15; letter-spacing: -0.02em; color: var(--bf-heading); margin: 0;
}
.bf-rule { width: 56px; height: 4px; background: var(--bf-accent); border-radius: 2px; margin: 22px 0; }
.bf-subtitle { font-size: 14.5px; color: var(--bf-cover-muted); line-height: 1.6; margin: 0; max-width: 80%; }
.bf-meta-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 32px;
  border-top: 1px solid var(--bf-border); padding-top: 20px; margin-top: auto;
}
.bf-meta-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--bf-cover-muted); text-align: center; margin: 0 0 6px;
}
.bf-meta-value {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 13px; font-weight: 600;
  color: var(--bf-heading); text-align: center; margin: 0;
}

/* --- Flujo de contenido: sin altura fija --- */
.bf-flow {
  width: var(--bf-page-w);
  background: var(--bf-bg);
  color: var(--bf-text);
  padding: 0.5in var(--bf-pad-x);
  box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  font-family: 'Inter', sans-serif;
}

/* Barra de marca superior (solo pantalla / primera página del flujo) */
.bf-flow-header {
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--bf-border); padding-bottom: 10px; margin-bottom: 18px;
}
.bf-header-logo { height: 18px; width: auto; object-fit: contain; }
.bf-header-title { font-size: 10px; color: var(--bf-muted); letter-spacing: 0.02em; }

/* Cada bloque de primer nivel no se parte al paginar */
.bf-flow > * { break-inside: avoid; page-break-inside: avoid; }

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

.bf-flow h3 {
  font-family: 'Space Grotesk','Inter',sans-serif; font-size: 11.5px; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--bf-accent); margin: 16px 0 8px;
}
.bf-flow p { font-size: 12.5px; color: var(--bf-text); margin: 0 0 12px; line-height: 1.55; }
.bf-flow strong { font-weight: 700; color: var(--bf-heading); }
.bf-flow a { color: var(--bf-accent); text-decoration: underline; text-underline-offset: 2px; }

.bf-flow ul { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.bf-flow ul > li { position: relative; padding-left: 16px; font-size: 12.5px; line-height: 1.55; color: var(--bf-text); }
.bf-flow ul > li::before {
  content: ''; position: absolute; left: 0; top: 7px; width: 4px; height: 4px;
  border-radius: 50%; background: var(--bf-accent);
}

.bf-flow ol {
  list-style: none; counter-reset: bf-step; margin: 0 0 12px; padding: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.bf-flow ol > li {
  counter-increment: bf-step; position: relative; padding: 0 0 8px 32px;
  font-size: 12.5px; line-height: 1.55; color: var(--bf-text); border-bottom: 1px solid var(--bf-border);
}
.bf-flow ol > li:last-child { border-bottom: none; padding-bottom: 0; }
.bf-flow ol > li::before {
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

.bf-flow table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: auto; margin: 0 0 14px; }
.bf-flow thead th {
  text-align: left; font-weight: 600; color: var(--bf-muted); font-size: 10px;
  letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid var(--bf-border);
  padding: 0 12px 9px 0;
}
.bf-flow tbody td { color: var(--bf-text); padding: 9px 12px 9px 0; border-bottom: 1px solid var(--bf-border); vertical-align: top; }
.bf-flow tbody tr { break-inside: avoid; }

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
  .buffalo-cover, .bf-flow { width: 100%; }
  .buffalo-cover { height: auto; min-height: 60vh; }
  .bf-h1 { font-size: 28px; }
  .bf-meta-grid { grid-template-columns: repeat(2,1fr); gap: 20px; }
  .bf-roi { grid-template-columns: repeat(2,1fr); }
}
`

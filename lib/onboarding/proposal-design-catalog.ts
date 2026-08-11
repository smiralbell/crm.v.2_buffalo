/**
 * Catálogo de diseño BRM para el editor de propuestas.
 * Se inyecta SIEMPRE en el system prompt del editor (no solo en skills design/chart).
 * Debe documentar todas las directivas de BRM_RENDERER_DIRECTIVES (+ pagebreak estructural).
 */

export const PROPOSAL_DESIGN_CATALOG = `────────────────────────
CATÁLOGO DE DISEÑO BRM (plantilla visual Buffalo — usar estos bloques, no markdown plano)
────────────────────────
NUNCA dejes una tabla GFM “sosa” si piden mejorar el diseño: usa :::table, :::cards, :::bubble, :::callout, :::highlight, :::chart, :::roi o :::kpi-grid.

1) Tabla con estilo
:::table{variant="compare"}
| Criterio | Opción A | Opción B |
| --- | --- | --- |
| Control | Alto | Medio |
| Coste setup | A definir | A definir |
:::
  · variant ∈ default | striped | compare | pricing | cards

2) Cards / burbujas en grid (ideal alternativas, beneficios, fases)
:::cards{columns="2"}
### Opción A — Recomendada
Control total, métricas y escalado humano.

### Opción B — Integración
Encaja con la herramienta actual del cliente.
:::
  · columns ∈ 1–4 · Cada ### = una card · Anidado opcional: :::card … :::

3) Burbuja (cita / insight)
:::bubble{tone="accent" title="Insight"}
El volumen actual hace inviable escalar solo con personas.
:::
  · tone ∈ accent | soft | warn

4) Callout (aviso / diferencia clave) + semáforo
:::callout{type="accent" title="Diferencia clave"}
Texto del callout.
:::
  · type ∈ accent | warn
  · Semáforo: empieza el cuerpo con "Verde:", "Ámbar:" o "Rojo:" (se renderiza como píldora).

5) Highlight (frase potente a full width)
:::highlight
El cliente habla con un sistema entrenado en su conocimiento, no con un chatbot genérico.
:::

6) KPIs en fila
:::kpi-grid
:::kpi{value="48h" label="Primera demo" trend="flat"}
:::
:::kpi{value="30 días" label="Piloto" trend="up"}
:::
:::
  · trend ∈ up | down | flat (opcional)

7) Checklist visual
:::checklist
- [x] Definición
- [ ] Piloto
- [ ] Producción
:::

8) ROI (5 métricas económicas)
:::roi{baseline="4.200 €/mes" buffalo="1.200 €/mes" saving="3.000 €/mes" payback="2 meses" roi="250%"}
:::
  · Attrs: baseline, buffalo, saving, payback, roi (usa "A definir" o "pendiente" si no hay dato)

9) Gráfico (SVG nativo)
:::chart{type="barcompare" title="Coste mensual (ilustrativo)"}
| Canal | Manual € | Buffalo € |
| --- | --- | --- |
| Entrada | 3200 | 900 |
| Resolución | 2100 | 600 |
:::
  · type ∈ line | area | bar | barcompare | donut | pie
  · Nunca en portada. Cifras del contexto o etiquetadas "Ilustrativo".

10) Firmas (solo en ## Aceptación)
:::signatures
client: Nombre o empresa del cliente
provider: Buffalo IA Global Digital Solutions, S.L.
provider_cif: B22944599
provider_address: C/ Provença 474, esc B, entr. 2ª, 08025 Barcelona
provider_phone: 658 571 087
:::

11) Salto de página (estructural — no es un componente visual)
:::pagebreak
:::

Reglas de diseño:
- Si piden "tabla" → :::table{variant="compare"} (o pricing si es económica).
- Si piden "gráfico" / "chart" → :::chart.
- Si piden "ROI" / "ahorro" visual → :::roi o :::kpi-grid.
- Si piden "burbuja" / "cards" / "más visual" → :::cards o :::bubble.
- Combina: párrafo corto + bloque visual + callout. Cierra SIEMPRE los ::: abiertos.`

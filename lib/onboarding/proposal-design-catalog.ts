/**
 * Catálogo de diseño BRM para la skill de diseño del editor de propuestas.
 * La IA debe preferir estos bloques frente a tablas/markdown planos.
 */

export const PROPOSAL_DESIGN_CATALOG = `────────────────────────
CATÁLOGO DE DISEÑO BRM (usar cuando pidan tablas bonitas, burbujas, cards, más visual…)
────────────────────────
NUNCA dejes una tabla GFM “sosa” si piden mejorar el diseño: usa :::table, :::cards, :::bubble, :::callout, :::highlight o :::chart.

1) Tabla con estilo
:::table{variant="compare"}
| Criterio | Opción A | Opción B |
| --- | --- | --- |
| Control | Alto | Medio |
| Coste setup | A definir | A definir |
:::
  · variant ∈ default | striped | compare | pricing | cards
  · compare = cabecera con acento (ideal comparativas)
  · pricing = columnas centradas (precios / planes)
  · cards = filas como tarjetas

2) Cards / burbujas en grid (ideal alternativas, beneficios, fases)
:::cards{columns="2"}
### Opción A — Recomendada
Control total, métricas y escalado humano.

### Opción B — Integración
Encaja con la herramienta actual del cliente.
:::
  · columns ∈ 1–4
  · Cada ### = una card con título
  · Para destacar una: añade en el cuerpo "**Recomendada.**" o usa callout encima

3) Burbuja (cita / insight / mensaje destacado suave)
:::bubble{tone="accent" title="Insight"}
El volumen actual hace inviable escalar solo con personas.
:::
  · tone ∈ accent | soft | warn

4) Callout (aviso / diferencia clave)
:::callout{type="accent" title="Diferencia clave"}
No es un bot genérico: es software a medida Buffalo.
:::

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

7) Checklist visual
:::checklist
- [x] Definición
- [ ] Piloto
- [ ] Producción
:::

8) Gráfico (SVG nativo de la plantilla)
:::chart{type="barcompare" title="Coste mensual (ilustrativo)"}
| Canal | Manual € | Buffalo € |
| --- | --- | --- |
| Entrada | 3200 | 900 |
| Resolución | 2100 | 600 |
:::
  · type ∈ line | area | bar | barcompare | donut | pie
  · Tabla GFM dentro: col1 = categoría; resto = series numéricas (mismas columnas en todas las filas).
  · Evolución en el tiempo → line / area
  · Comparar escenarios o categorías → bar / barcompare
  · Mix / porcentajes → donut / pie
  · Nunca en portada. Si las cifras no están en el contexto, márcalas como "Ilustrativo" (no como reales).

Reglas de diseño:
- Si piden "tabla" → :::table{variant="compare"} (o pricing si es económica).
- Si piden "gráfico" / "chart" / "evolución visual" → :::chart (no una tabla sosa).
- Si piden "burbuja" / "tarjeta" / "cards" / "más visual" / "bonito" → :::cards o :::bubble.
- Si piden "mejorar el diseño" de un bloque existente → sustituye el markdown plano por estos bloques (replace_section o replace_text), sin reescribir el resto del documento.
- Combina: párrafo corto + cards/table/chart + callout. No satures con 5 bloques seguidos.
- Cierra SIEMPRE los ::: abiertos.`

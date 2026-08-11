> **SUPERSEDED** — Sustituido por el prompt «Convertir el editor de propuestas en un agente tipo Claude Design» (FASE 0+). De este v2 solo se aplicó la FASE A (`proposal-verify.ts`). No ejecutar el resto.

# Prompt para Cursor — Upgrade del sistema de propuestas (v2)

> Sustituye a `docs/proposal-system-upgrade-prompt.md`. De aquel documento **solo
> se aplicó la Fase 1** (commit `9e139f5`, cableado de `:::chart` al prompt y una
> skill `chart`). Todo lo demás sigue pendiente, y además el uso real ha revelado
> fallos que aquel prompt no cubría.
>
> Ejecuta **una fase por tarea/commit**. Empieza con "Ejecuta solo la FASE A".

---

## Rol

Eres un ingeniero senior en el CRM de Buffalo AI (Next.js + Prisma + Postgres).
Vas a arreglar y potenciar el editor conversacional de **propuestas comerciales**
(documento BRM = markdown + directivas `:::algo{...}`).

Archivos clave:

- `lib/onboarding/project-context-ai.ts` — `generateProposalFromContext` (generación
  inicial) y `reviseProposalWithChat` (el chat editor: atajos locales → IA → patches).
- `lib/onboarding/proposal-patches.ts` — tipo `ProposalPatch` y `applyProposalPatches`
  (motor determinista), `tryLocalPatches` (atajos sin IA).
- `lib/onboarding/proposal-skills.ts` — `PROPOSAL_SKILLS`, `classifyProposalSkill`
  (devuelve UNA sola skill), `formatSkillForPrompt`.
- `lib/onboarding/proposal-prompt.ts` — `PROPOSAL_BRM_SYNTAX`, `PROPOSAL_ACCI_STRUCTURE`,
  `PROPOSAL_GENERATE_SYSTEM`, `PROPOSAL_EDIT_SYSTEM`, `buildProposalEditSystem`.
- `lib/onboarding/proposal-brm.ts` — parseo/composición, paginado, polish.
- `lib/onboarding/proposal-design-catalog.ts` — catálogo de bloques visuales.
- `lib/openrouter.ts` — `openRouterChatCompletion` (sin function-calling),
  `parseJsonFromModelOutput`.
- `pages/api/onboarding/projects/[leadId]/proposal-chat.ts` — endpoint del chat.
- `components/onboarding/OnboardingProposalWorkspace.tsx` — UI del workspace.
- `components/retencion/report/charts/BuffaloChart.tsx` — gráficos SVG
  (line/area/bar/barcompare/donut/pie).
- Tests: `lib/onboarding/proposal-patches.test.ts`, `proposal-skills.test.ts` (vitest).

## Invariantes — NO rompas esto

1. El documento sigue siendo markdown + directivas BRM. Nunca HTML crudo.
2. La edición sigue siendo por **parches deterministas**, no "la IA reescribe todo"
   (salvo regenerar/traducir explícitos).
3. Puedes **añadir** campos al JSON de respuesta del editor; no rompas el parseo
   existente ni el frontend.
4. Compatibilidad con drafts ya guardados en `lead.configuracion` (sin migración).
5. No toques el editor de **contratos** (`contract-patches.ts`) salvo indicación.
6. Cada fase compila, pasa `npm run test`, y se prueba a mano en
   `/onboarding/propuesta` con un lead real (generar + chat + Descargar PDF).

---

## CONVERSACIÓN REAL QUE DEBE FUNCIONAR (criterio de aceptación)

Esta es una sesión real de un comercial. Hoy los últimos pasos fallan. **Al terminar
todas las fases, esta conversación completa debe funcionar.** Úsala como guía de
qué construir y como checklist de pruebas manuales.

```
1.  "quiero que entre punto y punto haya un salto de pagina"        ✅ ya funciona
2.  "extiende mucho mas el punto 4 y pon algun parrafo"             ⚠️ dice que sí, apenas cambia
3.  "cambia todo el documento a catalan"                            ✅ ya funciona
4.  "ahora extiende mucho mas cada punto y quita los saltos"        ❌ dos intenciones, solo aplica una
5.  "cada punto tiene un parrafo y son muy cortos, quiero mas
     tablas, mas desgloses, mas puntos y mas contenido"             ❌ dice que sí, sigue corto
6.  "quita entre punto y punto los saltos de pagina"                ✅ ya funciona
7.  "añademe un punto de ROI con buffalo vs sin buffalo"            ✅ ya funciona
8.  "pero en vez de una tabla quiero que sea un grafico"            ⚠️ dice que sí, no siempre cambia
9.  "quiero un grafico temporal en vez de barras"                   ⚠️ igual
10. "que el grafico tenga sentido, como iria la empresa sin
     buffalo y con buffalo, que se note un gran crecimiento"        ❌ datos planos / sin sentido
11. "lo veo igual"                                                  ❌ "No pude aplicar el cambio"
```

---

## FASE A — Notas honestas + verificación de intención

**El fallo más grave del sistema: miente.** En los pasos 2, 5, 8 y 9 responde
"Ampliado el contenido de cada punto con más párrafos, tablas y desgloses" cuando
en realidad cambió una frase. Causa: la `note` la **escribe el modelo** y el único
control de calidad en `reviseProposalWithChat` → `finish()` es
`draft.trim() !== before` — es decir, "¿cambió algo?", no "¿hizo lo que le pedí?".

**Tareas:**

1. Crea `lib/onboarding/proposal-verify.ts` con funciones puras:
   - `diffProposalStats(before: string, after: string)` → devuelve métricas reales
     del cambio: `charsDelta`, `wordsDelta`, `sectionsBefore/After`,
     `chartsBefore/After`, `tablesBefore/After`, `sectionsTouched: string[]`
     (títulos de las `##` cuyo cuerpo cambió), `pagebreaksDelta`.
   - `describeChange(stats): string` → una frase en español **derivada de los datos
     reales**, no del modelo. Ej: `"Ampliado el punto 4 (+340 palabras)."`,
     `"Sustituida la tabla por un gráfico en «Retorno de la inversión»."`,
     `"3 secciones ampliadas (+1.200 palabras en total)."`.
   - `verifyIntent(instruction, stats)` → `{ satisfied: boolean; reason?: string }`.
     Heurísticas deterministas mínimas:
     * instrucción de ampliar (`amplia|extiende|mas contenido|mas largo|desarrolla|
       llena|mas parrafos|mas desglose`) → exige `wordsDelta` significativo
       (p. ej. ≥ +80 palabras si es una sección, ≥ +400 si es "todos los puntos");
       si no, `satisfied: false`.
     * instrucción de acortar → exige `wordsDelta` negativo.
     * instrucción de gráfico (`grafico|grafica|chart`) → exige `chartsAfter > chartsBefore`
       **o** que el `type=` de algún `:::chart` haya cambiado.
     * "en vez de una tabla, un gráfico" → exige `tablesAfter < tablesBefore` **y**
       `chartsAfter > chartsBefore`.
2. En `reviseProposalWithChat` (`project-context-ai.ts`), dentro de `finish()`:
   - Calcula `stats` con `diffProposalStats(before, after)`.
   - Si `verifyIntent(...).satisfied === false`, **no devuelvas la note optimista
     del modelo**. Devuelve el documento nuevo (si cambió algo, no lo tires) pero
     con una note honesta: `"Solo he podido ampliarlo un poco (+40 palabras). Dime
     qué punto concreto quieres desarrollar y con qué contenido."`
   - Si `satisfied === true`, prefiere `describeChange(stats)` sobre la note del
     modelo, o combínalas (`note del modelo` + ` (+340 palabras)`), pero **la parte
     cuantitativa siempre sale de los datos reales**.
3. Devuelve `stats` en la respuesta del endpoint (`proposal-chat.ts`) como campo
   opcional nuevo, para poder mostrarlo en la UI (Fase G).
4. Tests: un `before`/`after` donde solo cambia una palabra + instrucción "amplía
   mucho el punto 4" → `verifyIntent` debe dar `satisfied: false`.

---

## FASE B — Memoria de turno: que "lo veo igual" funcione

**Paso 11 de la conversación.** El chat pasa `history` (últimos 6 mensajes) al
modelo, pero **no sabe qué modificó en el turno anterior**: ni qué ops aplicó, ni
sobre qué sección, ni qué resultado dio. Así que "lo veo igual", "no me gusta",
"otra vez", "más", "no es eso" no tienen ancla y acaban en el mensaje de fallo.

**Tareas:**

1. Define un tipo `ProposalTurnMemory` (en `proposal-verify.ts` o un
   `proposal-memory.ts` nuevo):
   ```ts
   type ProposalTurnMemory = {
     instruction: string        // qué pidió el usuario
     ops: string[]              // ops realmente aplicadas
     sections: string[]         // títulos de secciones tocadas
     stats: ProposalDiffStats   // el diff real
     satisfied: boolean         // resultado de verifyIntent
   }
   ```
2. Persístela junto al draft en `lead.configuracion` (campo nuevo
   `proposal_last_turn`, vía `mergeLeadConfig` — es JSON, no hace falta migración).
   Guarda **solo el último turno**, no un historial (evita inflar el JSON).
3. En `proposal-chat.ts`, léela y pásala a `reviseProposalWithChat` como
   `lastTurn?: ProposalTurnMemory`.
4. En `reviseProposalWithChat`:
   - Detecta **instrucciones de feedback** (sin contenido propio) con un helper
     `isFeedbackOnly(instruction)`: `lo veo igual|no ha cambiado|sigue igual|no me
     gusta|otra vez|repite|no es eso|mas de lo mismo|no funciona|igual que antes`.
   - Si es feedback-only **y** hay `lastTurn`: no lo trates como instrucción nueva.
     Reconstruye la petición como *"El usuario dice «lo veo igual» sobre este cambio
     anterior: {lastTurn.instruction} → aplicaste {lastTurn.ops} sobre
     {lastTurn.sections} con resultado {lastTurn.stats}. El cambio fue insuficiente.
     Aplícalo AHORA de forma mucho más agresiva y evidente."* e inyéctala como
     instrucción efectiva, reusando la skill del turno anterior.
   - Si es feedback-only y **no** hay `lastTurn`, responde pidiendo concreción (el
     mensaje honesto actual está bien para ese caso).
5. Añade al `PROPOSAL_EDIT_SYSTEM` un bloque `CONTEXTO DEL TURNO ANTERIOR` que se
   inyecte solo cuando exista `lastTurn`.
6. Tests: `isFeedbackOnly` con las frases de arriba; y que con `lastTurn` presente
   una instrucción "lo veo igual" produzca patches (no el mensaje de fallo).

---

## FASE C — Ejecutor masivo (fan-out): "amplía TODOS los puntos"

**Pasos 4 y 5.** Pedir "extiende mucho más cada punto" sobre 13 secciones es
**físicamente imposible** en una sola respuesta JSON con `maxTokens: 6000`: no caben
13 secciones desarrolladas. El modelo hace lo que puede (toca 1-2) y la note dice
que las hizo todas. No es un problema de prompt, es un techo de tokens.

**Tareas:**

1. Detecta instrucciones **masivas** con un helper `detectBulkScope(instruction)` →
   `{ bulk: true, scope: 'all_sections', action: 'expand'|'condense'|'enrich' } | null`.
   Señales: `cada punto|todos los puntos|todo el documento|cada seccion|todas las
   secciones|llena todo|mas contenido en todo`.
2. Si `bulk`, **no** hagas una sola llamada. Implementa un ejecutor fan-out en
   `project-context-ai.ts`:
   - Lista las secciones con `listProposalSections`.
   - Para cada sección, una llamada IA **independiente y pequeña** que recibe solo
     esa sección + el contexto del cliente + el objetivo (`expand` con objetivo de
     palabras, `enrich` = añadir tablas/desgloses/subapartados) y devuelve el
     **cuerpo nuevo de esa sección** en BRM.
   - Concurrencia limitada (lotes de 3-4 con `Promise.all`, nunca 13 a la vez:
     cuidado con rate limits de OpenRouter).
   - Ensambla el resultado aplicando un `replace_section` por sección.
   - Si una sección falla, conserva la original y sigue con el resto (degradación
     elegante); reporta en la note cuántas se ampliaron de verdad.
3. Objetivos de densidad configurables por acción, p. ej. `expand` → apuntar a
   350-600 palabras por sección; `enrich` → exigir al menos un bloque visual
   (`:::table`, `:::cards`, `:::callout` o `:::chart`) y 2+ subapartados `###`.
   Verifica el resultado con `verifyIntent` (Fase A) por sección.
4. La note final la genera `describeChange` con datos reales:
   `"11 de 13 puntos ampliados (+4.800 palabras, 6 tablas nuevas)."`
5. **Streaming/UX:** una operación masiva tarda. Si es fácil en la arquitectura
   actual, devuelve progreso; si no, al menos asegura que el endpoint no exceda el
   timeout de Vercel (`vercel.json`) — considera subir `maxDuration` para esta ruta
   y muestra un estado de "trabajando…" en la UI.
6. Tests: `detectBulkScope` con las frases reales de la conversación; y un test del
   ensamblador con IA mockeada (no llames a OpenRouter en tests).

---

## FASE D — Gráficos con sentido: modo "proyección ilustrativa"

**Pasos 8-10.** El usuario pide *"un gráfico de cómo iría la empresa sin Buffalo y
con Buffalo, que se note un gran crecimiento"*. Eso **es por definición una
proyección inventada**. Pero el prompt actual (`proposal-skills.ts`, skill `chart`)
dice literalmente *"Cifras SOLO del contexto... NUNCA los presentes como reales"* y
`PROPOSAL_BRM_SYNTAX` dice *"No inventes cifras"*. El modelo queda atrapado entre
dos órdenes contradictorias y emite datos planos o no cambia nada.

**Tareas:**

1. Introduce el concepto explícito de **escenario / proyección ilustrativa** como
   algo *permitido y bien etiquetado*, distinto de "inventar datos reales":
   - En `PROPOSAL_BRM_SYNTAX` y en la skill `chart`, añade: los gráficos de
     proyección (con/sin Buffalo, evolución esperada, escenarios) **SÍ** pueden
     usar valores modelados, **siempre que** el `title` del chart lo indique
     ("Proyección ilustrativa") y haya una nota al pie bajo el gráfico explicando
     las hipótesis (p. ej. "Escenario basado en una mejora del 25% en conversión;
     a validar con los datos reales del cliente").
   - Sigue PROHIBIDO presentar cifras inventadas como históricas o reales, y
     seguir inventando precios/compromisos.
2. Añade a `lib/onboarding/proposal-data-tools.ts` (créalo si no existe) funciones
   **deterministas** que generen las series, para que el LLM no haga aritmética:
   - `buildScenarioSeries(input: { periods: number; periodLabel: 'mes'|'trimestre'|'año'; baseline: number; baselineGrowthPct: number; upliftPct: number; startLabel?: string })`
     → `{ columns: ['Periodo', 'Sin Buffalo', 'Con Buffalo'], rows: [...] }` con
     crecimiento compuesto y divergencia visible entre las dos series.
   - `buildChartBlock({ type, title, columns, rows, note? })` → el texto
     `:::chart{...}` con la tabla GFM bien formada (valida que todas las filas
     tengan tantas columnas como la cabecera; escapa `|`).
3. Nuevo op en `ProposalPatch` + `applyProposalPatches`:
   `{ op: 'insert_scenario_chart'; section: number|string; chartType: 'line'|'area'|'bar'|'barcompare'; title?: string; periods?: number; periodLabel?: ...; baseline?: number; baselineGrowthPct?: number; upliftPct?: number; note?: string; replaceExisting?: boolean }`
   - Genera las series con `buildScenarioSeries` (el modelo aporta las hipótesis,
     **no los números uno a uno**).
   - Si `replaceExisting`, sustituye el `:::chart` o `:::table` que ya haya en esa
     sección en vez de añadir otro — esto arregla el paso 8 ("en vez de una tabla
     quiero un gráfico").
4. Nuevo op `{ op: 'set_chart_type'; section: number|string; chartType: ... }` que
   cambia solo el `type=` de un `:::chart` existente — arregla el paso 9 ("quiero
   un gráfico temporal en vez de barras") de forma determinista y garantizada, sin
   depender de que el modelo reescriba bien la sección entera.
5. Documenta ambos ops en `PROPOSAL_EDIT_SYSTEM` y en la skill `chart`.
6. Tests: `buildScenarioSeries` (crecimiento compuesto correcto, divergencia
   creciente), `buildChartBlock` (validación de forma), `set_chart_type` (cambia
   `type` sin tocar los datos), `insert_scenario_chart` con `replaceExisting`.

---

## FASE E — Router multi-skill (varias intenciones en un mensaje)

**Paso 4:** *"extiende mucho mas cada punto **y** quita los saltos de pagina"* son
dos intenciones. Hoy `classifyProposalSkill` hace `return` en el primer match y
solo inyecta una skill. **Paso 5:** la palabra "tablas" lo manda a `design` y pierde
la intención real, que es densificar todo el documento.

**Tareas:**

1. Cambia a `classifyProposalSkills(instruction): ProposalSkillId[]` que **acumula**
   todos los matches en un `Set` (quita los `return` tempranos), preservando el
   orden de prioridad actual: regenerate > language > cover > acceptance > chart >
   design > layout > section_edit > general. Vacío → `['general']`.
2. `formatSkillsForPrompt(ids: ProposalSkillId[])` concatena los bloques, inyectando
   `PROPOSAL_DESIGN_CATALOG` **una sola vez** aunque estén `design` y `chart`.
3. Igual con `tryLocalPatches`: hoy devuelve al primer match. Debe poder devolver
   **varios** parches de intenciones distintas (p. ej. quitar saltos + ampliar), o
   delegar a la IA la parte que no sabe resolver localmente en vez de tragarse el
   mensaje entero.
4. Actualiza `reviseProposalWithChat` y busca con grep todos los usos de las
   funciones en singular para migrarlos o dejar wrappers compatibles.
5. Tests: la frase exacta del paso 4 debe devolver `['layout', 'section_edit']`
   (o equivalente) y aplicar **ambas** cosas.

---

## FASE F — Validador: nunca guardar un documento roto

Hoy "éxito" = "el texto cambió". No se valida que el BRM resultante sea válido.
Con los ops nuevos de gráficos esto pasa a ser crítico.

**Tareas:**

1. `validateProposalDraft(draft): { ok: boolean; issues: string[] }` en
   `proposal-brm.ts`:
   - Balance de aperturas/cierres `:::` teniendo en cuenta anidación
     (`:::cards` con `:::card` dentro).
   - Sección "Aceptación"/"Acceptance" debe contener `:::signatures`.
   - Todo `:::chart` con tabla de ≥1 fila y columnas consistentes con la cabecera.
   - Sin placeholders sin resolver (`{{...}}`, `TODO`, `XXX`).
2. Engánchalo en `reviseProposalWithChat` tras `applyProposalPatches`: si falla,
   intenta autocorregir lo trivial (`:::` sin cerrar al final); si no se puede,
   **no persistas** — devuelve el draft anterior con note honesta.
3. Igual al final de `generateProposalFromContext`: si falla, **un** reintento
   antes de devolver error.
4. Tests: `:::callout` sin cerrar, `:::chart` con filas desiguales, Aceptación sin
   `:::signatures`.

---

## FASE G — UI: que el comercial vea qué pasó y qué puede pedir

**Tareas:**

1. En `OnboardingProposalWorkspace.tsx`, muestra bajo cada respuesta del chat las
   métricas reales del turno (`stats` de la Fase A): `+340 palabras · 2 tablas ·
   1 gráfico · 3 secciones`. Esto hace **visible** si el cambio fue real y mata la
   sensación de "dice que sí pero no cambia nada".
2. Chips de acción rápida sobre el input del chat que rellenan instrucciones
   predefinidas (sin cambios de backend): "Ampliar todo", "Añadir gráfico de
   proyección", "Más tablas y desgloses", "Calcular ROI", "Traducir a catalán",
   "Regenerar". Discretos, respetando el estilo del workspace.
3. Estado de "trabajando…" con indicación de progreso para las operaciones masivas
   de la Fase C (pueden tardar bastante).

---

## FASE H — Generación inicial en dos fases (arquitecto + redactor)

`generateProposalFromContext` es una sola llamada de ~12k tokens pidiendo 13
secciones. Es la causa de que el documento nazca ya con "un párrafo por punto" y de
que el comercial tenga que pedir "amplía todo" en el paso 5.

**Tareas:**

1. `planProposalOutline(input)` → una llamada IA que devuelve JSON: para cada una de
   las 13 secciones ACCIÓ, 2-4 bullets de qué cubrir **con los datos concretos del
   contexto del cliente**, y si conviene un `:::chart`/`:::table` y con qué datos.
2. `writeProposalSection(plan, shared)` → una llamada por sección que expande el
   plan a BRM completo, con objetivo de densidad (350-600 palabras + al menos un
   bloque visual donde el plan lo indique).
3. Ejecuta en lotes de 3-4 con `Promise.all`, ensambla en orden, pasa por
   `polishProposalDraft` y `validateProposalDraft`.
4. **Fallback obligatorio:** si el plan falla o es inválido, cae al
   `generateProposalFromContext` de una sola llamada actual. Loguea el fallback.
5. Reutiliza el mismo ejecutor de la Fase C si la arquitectura lo permite (son el
   mismo patrón: fan-out por sección con objetivo de densidad).

---

## FASE I — Modelo por dificultad

1. Añade `OPENROUTER_MODEL_HEAVY` (modelo con más razonamiento) manteniendo
   `OPENROUTER_MODEL` para los parches rápidos.
2. Úsalo en: `generateProposalFromContext`, `planProposalOutline`,
   `writeProposalSection`, el ejecutor masivo de la Fase C, y el camino
   `wantsFullDoc` (`language`/`regenerate`). El resto sigue con el rápido.
3. Documenta las env vars nuevas en `.env.example`.

---

## Orden de ejecución

**A → B → C → D** son las que arreglan los fallos que el comercial está sufriendo
ahora mismo; hazlas primero y en ese orden (A da las herramientas de medición que
usan B, C y D).

Luego **E → F**, y por último **G, H, I** (pueden ir en paralelo, son
independientes entre sí).

Tras cada fase: `npm run test`, y reproduce a mano la conversación de arriba en
`/onboarding/propuesta` con un lead real, comprobando que cada paso hace lo que
dice y que "Descargar PDF" sigue exportando bien.

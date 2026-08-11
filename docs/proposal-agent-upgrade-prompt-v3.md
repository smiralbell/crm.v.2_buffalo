# Prompt para Cursor — Convertir el editor de propuestas en un agente tipo "Claude Design"

> **Sustituye a `docs/proposal-system-upgrade-prompt.md` y `docs/proposal-system-upgrade-prompt-v2.md`.**
> De v2 **solo se aplicó la FASE A** (existe `lib/onboarding/proposal-verify.ts`). He verificado
> que NO existen en el código: `proposal_last_turn`, `detectBulkScope`, `proposal-data-tools`,
> `validateProposalDraft`, `OPENROUTER_MODEL_HEAVY`, `classifyProposalSkills`, `set_chart_type`,
> `insert_scenario_chart`, `isFeedbackOnly`. Todo eso sigue pendiente y está reordenado aquí.
>
> **Ejecuta UNA FASE POR TAREA Y POR COMMIT.** No adelantes fases.
> Al terminar cada fase: `npm run test`, `npm run build`, y prueba manual.

---

## ⚠️ ESTADO ACTUAL — LEE ESTO ANTES DE EMPEZAR

**La FASE 0 está COMPLETADA y verificada** (commit `b3880fd` + remates posteriores).
No la repitas. Verificado con llamadas reales a OpenRouter:

- `~anthropic/claude-sonnet-latest` → sirve `anthropic/claude-sonnet-5`. Funciona.
- `response_format: json_object` **sí** funciona con Claude vía OpenRouter (no hay regresión
  en traducir/regenerar).
- El context pack funciona: en una prueba con 7 datos concretos de auditoría (volúmenes,
  % de llamadas perdidas, herramienta de agenda), el editor **usó los 7**.
- Enrutado de modelo por skill: `section_edit`/`design`/`chart`/`language`/`general` → heavy;
  `layout`/`cover`/`acceptance` → fast.
- 61 tests en verde, `npm run build` OK.

**EMPIEZA POR LA FASE 1.**

### Los 3 problemas que el comercial reporta HOY (prioridad real)

Esto reordena el plan. Son citas literales del usuario:

1. **«no puede hacer más de una cosa a la vez»**
   → `classifyProposalSkill` hace `return` en el primer match y `tryLocalPatches` se traga
   el mensaje entero al primer acierto. Es la **FASE 1.5**, y deja de ser opcional:
   hazla dentro de la Fase 1, no después.

2. **«la interfaz a veces me dice actualizando y no sé si es un bug porque tarda demasiado»**
   → Medido: **20,6 s para ampliar UNA sección** con Sonnet. El documento entero o una
   operación masiva se va a minutos. Ya se ha paliado con un cronómetro real y textos de
   espera honestos en `OnboardingProposalWorkspace.tsx` (`waitingHint`), pero eso es una
   tirita. **El streaming real (antigua FASE 6.1) sube a FASE 2.** Sin él, la Fase 3
   (fan-out, 13 llamadas encadenadas) es inusable.

3. **«necesito que pueda cambiar cualquier cosa que ahora mismo no podamos prevenir»**
   → Este es el requisito de fondo y **es la razón de ser de la FASE 1**. Hoy el sistema
   solo sabe hacer lo que hay en la lista cerrada de `ProposalPatch`; cualquier petición
   fuera de esa lista muere en *"No pude aplicar el cambio"*. Un agente con herramientas de
   lectura + escritura y capacidad de reintento puede componer soluciones a peticiones que
   nadie anticipó. **Cuando diseñes las herramientas, optimiza para lo imprevisible:**
   prefiere pocas herramientas generales y componibles (leer / buscar / reemplazar /
   insertar bloque) a muchas herramientas específicas.

### Orden nuevo

```
FASE 1  (agente + multi-intención)  →  FASE 2  (streaming)  →  FASE 3  (fan-out masivo)
     →  FASE 4  (gráficos)  →  FASE 5  (validador)  →  FASE 6  (generación en 2 fases)
     →  FASE 7  (editor manual + contratos)
```

Las fases mantienen el contenido descrito abajo; solo cambia el orden y el número:
antigua 2→3, antigua 3→4, antigua 4→5, antigua 5→6, antigua 6.1→2, antigua 6.2/6.3→7.

---

## 0. Rol

Eres un ingeniero senior trabajando en el CRM de Buffalo AI (Next.js 14 *pages router* +
Prisma + Postgres + TypeScript estricto + Tailwind, tests con Vitest).

Tu misión: transformar el editor conversacional de **propuestas comerciales** de lo que
es hoy — *un adivinador de parches JSON de un solo tiro* — en lo que debe ser: **un agente
de edición de documentos con herramientas, contexto completo del cliente y bucle de
verificación**, al estilo de Claude/Cursor editando código, pero especializado en la
plantilla visual Buffalo (BRM).

---

## 1. Mapa de archivos (léelos TODOS antes de escribir una línea)

**Backend / lógica**
- `lib/onboarding/project-context-ai.ts` — `generateProposalFromContext` (generación inicial),
  `reviseProposalWithChat` (el chat editor), `buildCrmContextSources` (auditoría + Fireflies).
- `lib/onboarding/proposal-patches.ts` — `ProposalPatch`, `applyProposalPatches` (motor
  determinista), `tryLocalPatches` (atajos sin IA), `fuzzyReplaceOnce`, `resolveSection`.
- `lib/onboarding/proposal-prompt.ts` — `PROPOSAL_BRM_SYNTAX`, `PROPOSAL_ACCI_STRUCTURE`,
  `PROPOSAL_GENERATE_SYSTEM`, `PROPOSAL_EDIT_SYSTEM`, `buildProposalEditSystem`.
- `lib/onboarding/proposal-skills.ts` — `PROPOSAL_SKILLS`, `classifyProposalSkill`, `formatSkillForPrompt`.
- `lib/onboarding/proposal-design-catalog.ts` — `PROPOSAL_DESIGN_CATALOG`.
- `lib/onboarding/proposal-brm.ts` — parseo/composición, paginado, `polishProposalDraft`,
  `listProposalSections`, `formatSectionMapForEditor`.
- `lib/onboarding/proposal-verify.ts` — `diffProposalStats`, `describeChange`, `verifyIntent`,
  `resolveEditorNote` (**ya existe, reutilízalo, no lo dupliques**).
- `lib/openrouter.ts` — `openRouterChatCompletion` (hoy SIN function-calling),
  `parseJsonFromModelOutput`.
- `lib/engranaje5/types.ts` — `ConfiguradorConfig` (campos `project_context`, `description`,
  `proposal_draft`, `proposal_status`…).

**API**
- `pages/api/onboarding/projects/[leadId]/proposal-chat.ts` — endpoint del chat.
- `pages/api/onboarding/projects/[leadId]/document.ts` — generación / guardado.

**Frontend / render**
- `components/onboarding/OnboardingProposalWorkspace.tsx` — el workspace (preview + chat).
- `components/retencion/report/BuffaloReport.tsx` — la plantilla visual.
- `components/retencion/report/remarkBuffaloDirectives.ts` — **la lista REAL de directivas
  BRM soportadas**: `kpi-grid`, `kpi`, `callout`, `highlight`, `roi`, `checklist`, `chart`,
  `table`, `cards`, `card`, `bubble`, `signatures`, `pagebreak`.
- `components/retencion/report/charts/BuffaloChart.tsx` — gráficos SVG.

**Tests existentes**: `lib/onboarding/proposal-patches.test.ts`, `proposal-skills.test.ts`,
`proposal-verify.test.ts`.

---

## 2. Invariantes — NO rompas esto

1. El documento sigue siendo **markdown + directivas BRM** (`:::algo{...}`). Nunca HTML crudo.
2. Las mutaciones siguen siendo **deterministas en TypeScript**. El LLM decide *qué* cambiar
   y escribe *contenido*; **nunca** manipula el documento entero salvo regenerar/traducir.
3. Compatibilidad con drafts ya guardados en `lead.configuracion` (base64 JSON, sin migración).
4. No toques el editor de **contratos** (`contract-patches.ts`, `contract-annex-ai.ts`) hasta
   la FASE 7.
5. TypeScript estricto: cero `any` nuevos, cero `@ts-ignore`. `npm run build` debe pasar
   (EasyPanel hace typecheck en el build).
6. Cada fase: compila, `npm run test` en verde, y prueba manual en `/onboarding/propuesta`
   con un lead real (generar + chat + Descargar PDF + HTML).

---

## 3. Criterio de aceptación

Esta conversación real de un comercial debe funcionar **entera** al acabar todas las fases.
Úsala como checklist de pruebas manuales después de cada fase.

```
1.  "quiero que entre punto y punto haya un salto de pagina"          ✅ ya funciona
2.  "extiende mucho mas el punto 4 y pon algun parrafo"               ❌ dice que sí, apenas cambia
3.  "cambia todo el documento a catalan"                              ✅ ya funciona
4.  "ahora extiende mucho mas cada punto y quita los saltos"          ❌ dos intenciones, aplica una
5.  "cada punto tiene un parrafo y son muy cortos, quiero mas tablas,
     mas desgloses, mas puntos y mas contenido"                       ❌ dice que sí, sigue corto
6.  "quita entre punto y punto los saltos de pagina"                  ✅ ya funciona
7.  "añademe un punto de ROI con buffalo vs sin buffalo"              ✅ ya funciona
8.  "pero en vez de una tabla quiero que sea un grafico"              ❌ no siempre cambia
9.  "quiero un grafico temporal en vez de barras"                     ❌ igual
10. "que el grafico tenga sentido, como iria la empresa sin buffalo
     y con buffalo, que se note un gran crecimiento"                  ❌ datos planos / sin sentido
11. "lo veo igual"                                                    ❌ "No pude aplicar el cambio"
```

Añade estos casos nuevos al checklist:

```
12. "en el punto de mantenimiento mete lo que dijimos en la reunion del dia X"
13. "el punto 3 no refleja lo que pone la auditoria, corrigelo"
14. "hazlo mas visual: cards en alternativas y un callout en RGPD"
15. "que todo el documento tenga el doble de contenido"
16. "quita el punto 6 y renumera"
```

---

# FASE 0 — ✅ COMPLETADA (no la repitas)

**Se deja documentada para saber qué existe ya.** Todo lo de abajo está implementado y
verificado. Si vas a tocar algo aquí, es solo para no romperlo.

## 0.1 · El bug más grave: el chat editor es CIEGO al contexto del cliente

`reviseProposalWithChat` (`project-context-ai.ts`) declara en su input `context` y
`definition`, el endpoint `proposal-chat.ts` se los pasa correctamente… **y luego nunca se
usan al construir los mensajes**. El bloque `meta` solo lleva proyecto, cliente, setup y
mensualidad.

Esto explica el síntoma nº1: cuando el comercial dice *"amplía el punto 4"*, el modelo **no
tiene material con el que ampliarlo** (ni auditoría, ni transcripciones de reuniones, ni
definición), y como el prompt le prohíbe inventar, se queda corto y miente en la `note`.

**Tarea:** crea `lib/onboarding/proposal-context-pack.ts`:

```ts
export type ProposalContextPack = {
  /** Texto listo para inyectar en el prompt. */
  block: string
  /** Métricas para logs/UI. */
  chars: number
  sources: string[] // ['definicion', 'auditoria', 'reuniones', 'precios']
}

export function buildProposalContextPack(input: {
  definition?: string | null
  context?: string | null      // ya contiene auditoría + Fireflies (buildCrmContextSources)
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  /** Presupuesto de caracteres; recorta por prioridad si se pasa. */
  maxChars?: number            // default 24000
}): ProposalContextPack
```

Reglas:
- Prioridad al recortar: metadatos > definición > auditoría > reuniones. Nunca trunques a
  mitad de frase; corta por párrafos.
- Formato del bloque, con cabeceras claras:
  `## Cliente y economía`, `## Definición del proyecto`, `## Contexto CRM (auditoría y reuniones)`.
- Añade al final una línea explícita:
  `Usa SIEMPRE estos datos como fuente. Si un dato no está aquí, escribe "A definir con el cliente" — no lo inventes.`

**Engánchalo** en `reviseProposalWithChat`, dentro del mensaje `user`, **antes** del mapa de
secciones. Añade también un test de que el pack respeta `maxChars` y conserva los metadatos.

## 0.2 · Modelo por dificultad

Hoy todo va con `OPENROUTER_MODEL=openai/gpt-4o-mini` (`.env`, y default en
`lib/openrouter.ts`). Un modelo mini no puede escribir una propuesta de 4.000 palabras con
sintaxis propia NI emitir parches JSON con matches exactos.

**Tareas:**
1. Nueva env var `OPENROUTER_MODEL_HEAVY`. Valor por defecto en código:
   `'~anthropic/claude-sonnet-latest'` (es el mismo string que ya usa y funciona en
   `lib/demos/chat.ts`). Documéntala en `.env.example` **y** en
   `lib/help/articles/api-integraciones.ts`, que es el artículo de ayuda donde hoy se
   explica `OPENROUTER_MODEL` a los usuarios del CRM.
2. Usa el modelo HEAVY en: `generateProposalFromContext`, la rama `wantsFullDoc`
   (`language` / `regenerate`) de `reviseProposalWithChat`, y — cuando existan — el
   planificador, el redactor por sección y el ejecutor masivo.
   El modelo rápido (`OPENROUTER_MODEL`) se queda para parches triviales y clasificación.
3. Añade helper `resolveModel(tier: 'fast' | 'heavy'): string` en `lib/openrouter.ts` y úsalo
   en vez de leer `process.env` disperso.

## 0.3 · JSON garantizado + techo de tokens

1. `openRouterChatCompletion` acepta una opción nueva `json?: boolean`. Si es `true`, añade
   `response_format: { type: 'json_object' }` al body. Úsala en TODAS las llamadas que hoy
   pasan por `parseJsonFromModelOutput`.
2. Sube `maxTokens` de la llamada de edición de 6.000 a 16.000 (y 32.000 en `wantsFullDoc`).
   Con 6.000 tokens es **físicamente imposible** devolver 13 secciones ampliadas — por eso
   los pasos 4 y 5 del criterio de aceptación fallan siempre.

## 0.4 · Que el modelo conozca TODA la plantilla

`PROPOSAL_BRM_SYNTAX` (lo único que se inyecta siempre) documenta 8 bloques, pero el
renderer soporta más: **`:::roi`, `:::kpi-grid`/`:::kpi`, `:::checklist`** y el atributo de
semáforo (`data-semaforo`) no están documentados en ningún prompt. El catálogo completo
(`PROPOSAL_DESIGN_CATALOG`) solo se inyecta si la skill es `design` o `chart`
(`formatSkillForPrompt`), así que el resto del tiempo el modelo ni sabe que existen.

**Tareas:**
1. Abre `remarkBuffaloDirectives.ts` y `brmComponents.tsx` y **haz un inventario exacto** de
   directivas + atributos soportados.
2. Completa `PROPOSAL_DESIGN_CATALOG` con las que faltan (`roi`, `kpi-grid`, `checklist`,
   semáforo), con un ejemplo mínimo válido de cada una.
3. Inyecta el catálogo **siempre** en el system prompt del editor, no solo en dos skills.
4. Añade un test que compare la lista de directivas del renderer con las mencionadas en el
   catálogo y falle si el renderer soporta alguna que el prompt no documenta. *(Este test es
   el que evita que la plantilla y el prompt vuelvan a divergir.)*

## 0.5 · La UI ya recibe métricas y las tira a la basura

`proposal-chat.ts` ya devuelve `stats` e `intentSatisfied`, y
`OnboardingProposalWorkspace.tsx` **no los usa**. Por eso el comercial no puede distinguir
"ha cambiado algo" de "me está mintiendo".

**Tareas:**
1. Bajo cada respuesta del asistente, muestra una línea discreta de métricas reales:
   `+340 palabras · 2 tablas · 1 gráfico · 3 secciones`.
2. Si `intentSatisfied === false`, marca visualmente la burbuja (borde ámbar) — no la
   escondas. La honestidad es la feature.
3. Chips de acción rápida sobre el textarea que rellenan el input (sin backend nuevo):
   *Ampliar todo · Más tablas y desgloses · Gráfico de proyección · Traducir a catalán ·
   Regenerar*.

**Hecho cuando:** los pasos 2 y 5 del criterio de aceptación producen un cambio visible y
medible, y la UI lo demuestra con números.

---

# FASE 1 — El bucle agéntico (esto es lo que lo convierte en "Claude Design")

**Diferencia arquitectónica:**

```
HOY:      instrucción → 1 llamada → JSON de parches → aplicar → fin
OBJETIVO: instrucción → agente con herramientas → leer → editar → verificar
                      → si falla, corregir → repetir → fin
```

Hoy el modelo tiene **un solo disparo y sin mirilla**: no puede leer una sección antes de
reescribirla, no sabe si su `replace_text` acertó, y si falla el turno muere con
*"No pude aplicar el cambio"*.

## 1.1 · Soporte de tool calling en OpenRouter

`openRouterChatCompletion` no acepta `tools`. Añade en `lib/openrouter.ts`:

```ts
export type ORTool = {
  name: string
  description: string
  parameters: Record<string, unknown>   // JSON Schema
}

export type ORToolCall = { id: string; name: string; arguments: unknown }

export async function openRouterToolTurn(
  messages: ORMessage[],
  tools: ORTool[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<{ text: string; toolCalls: ORToolCall[] }>
```

- Formato OpenAI-compatible: `tools: [{ type:'function', function:{ name, description, parameters } }]`,
  y `tool_choice: 'auto'`.
- Los resultados vuelven como mensajes `{ role:'tool', tool_call_id, content }`.
- Parsea `arguments` con `JSON.parse` protegido: si el modelo manda JSON inválido, devuelve
  al agente un resultado de herramienta `{ ok:false, error:'JSON inválido: …' }` en lugar de
  reventar el turno. **Un fallo de herramienta nunca debe matar el turno.**
- Los `arguments` de cada tool se validan con **Zod** antes de ejecutar; el error de Zod se
  devuelve al modelo como texto para que se corrija solo.

## 1.2 · La caja de herramientas del editor

Crea `lib/onboarding/proposal-tools.ts`. Cada herramienta = `{ spec: ORTool, run(args, state) }`,
donde `state` lleva el draft actual, los metadatos del cliente y el context pack.

**Herramientas de LECTURA** (esto es lo que hoy no existe y es crítico):
- `list_sections()` → `[{ index, title, words, hasChart, hasTable }]`
- `read_section({ section })` → título + cuerpo BRM **literal** de esa sección
- `search_document({ query, limit? })` → fragmentos con la sección donde están
- `get_client_context({ query })` → busca en el context pack (definición/auditoría/reuniones)
  y devuelve los pasajes relevantes. **Esta es la herramienta que permite responder
  "mete lo que dijimos en la reunión" y "corrígelo según la auditoría".**

**Herramientas de ESCRITURA** (envuelven `applyProposalPatches`, no dupliques lógica):
- `replace_section`, `append_to_section`, `insert_section`, `delete_section`
- `replace_text({ match, with })`
- `set_title`, `set_subtitle`, `shorten_cover`
- `ensure_signatures`
- `set_page_mode`, `ensure_section_pagebreaks`, `remove_pagebreaks`, `add_pagebreak`, `compact_blank_lines`
- `set_theme`
- `insert_block({ section, position: 'start'|'end'|'after_paragraph', brm })` — inserta un
  bloque BRM validado (`:::cards`, `:::callout`, `:::roi`…)
- `expand_sections({ sections, target_words, must_include? })` → **fan-out interno**, ver FASE 3
- `set_chart_type({ section, type })` — ver FASE 4
- `insert_scenario_chart({ ... })` — ver FASE 4

**Regla de oro: toda herramienta de escritura devuelve un resultado observable:**

```ts
{ ok: true, wordsDelta: 312, charsDelta: 1840, sectionsTouched: ['Mantenimiento…'],
  preview: '…primeros 200 chars del resultado…' }
// o
{ ok: false, error: 'No encontré el texto a sustituir', hint: 'Usa read_section(4) primero' }
```

Eso es exactamente lo que hoy falta: **el modelo nunca ve el efecto de su acción**. Con esto,
si `replace_text` falla, el agente lee la sección y lo reintenta solo, sin molestar al usuario.

## 1.3 · El bucle

Reescribe `reviseProposalWithChat` como agente en `lib/onboarding/proposal-agent.ts`:

```
1. Atajos locales (tryLocalPatches) → si resuelven al 100%, ejecuta y sal. Ahorra latencia.
2. Monta: system (BRM + catálogo completo + ops) + context pack + mapa de secciones
   + memoria del turno anterior + historial (últimos 8) + instrucción.
3. BUCLE, máximo 14 llamadas a herramienta o 180 s:
   - llama a openRouterToolTurn
   - ejecuta cada tool call sobre un draft EN MEMORIA (snapshot, nunca sobre BD)
   - devuelve el resultado observable al modelo
   - si el modelo responde sin tool calls → propone terminar
4. VERIFICACIÓN: diffProposalStats(before, after) + verifyIntent(instruction, stats).
   - Si satisfied === false y quedan reintentos (máx. 2): inyecta un mensaje
     `role:'user'` con el motivo real ("pediste ampliar todos los puntos y solo hay
     +40 palabras; hazlo de verdad, sección por sección") y VUELVE AL BUCLE.
   - Si satisfied === true → valida BRM (FASE 5) y persiste.
5. La `note` final la genera SIEMPRE describeChange(stats) — datos reales, no el modelo.
   (resolveEditorNote ya hace esto: reutilízalo.)
```

**Reglas duras del bucle:**
- Presupuesto por turno: **máx. 14 tool calls y 3 llamadas al modelo HEAVY**. Corta y responde
  con lo conseguido más una nota honesta si se agota.
- Rollback: si al final el BRM no valida y no se puede autocorregir, **devuelve el draft
  anterior**. Nunca persistas un documento roto.
- Loguea (`console.info`) por turno: instrucción, tools usadas, iteraciones, `wordsDelta`,
  `satisfied`. Lo vas a necesitar para depurar.

## 1.4 · El system prompt del agente

Reescribe `PROPOSAL_EDIT_SYSTEM` con mentalidad de agente, no de generador de JSON:

- *"Eres el editor de propuestas de Buffalo. Tienes herramientas. **Antes de reescribir una
  sección, LÉELA** con `read_section`. Antes de afirmar un dato del cliente, búscalo con
  `get_client_context`. Después de editar, comprueba el resultado que te devuelve la
  herramienta."*
- *"Si una herramienta falla, no te rindas ni se lo cuentes al usuario: prueba otra vía."*
- *"No anuncies lo que vas a hacer: hazlo. El usuario solo verá el resultado final."*
- *"Nunca digas que has ampliado algo si el `wordsDelta` que te devolvió la herramienta es
  pequeño. Miente el sistema, no tú."*
- Mantén el bloque de polaridad de saltos de página (poner ≠ quitar) — ese ya funciona bien.

## 1.5 · Router multi-intención

`classifyProposalSkill` hace `return` en el primer match, así que *"amplía cada punto **y**
quita los saltos"* pierde una intención. Y *"más tablas"* secuestra el mensaje hacia `design`
cuando lo que se pide es densificar.

**Tareas:**
1. `classifyProposalSkills(instruction): ProposalSkillId[]` — acumula en un `Set`, sin
   `return` tempranos, respetando el orden de prioridad actual.
2. `formatSkillsForPrompt(ids)` — concatena bloques e inyecta el catálogo **una sola vez**.
3. `tryLocalPatches` debe poder devolver parches de **varias** intenciones, o delegar al
   agente la parte que no resuelve — hoy se traga el mensaje entero al primer match.
4. Deja wrappers compatibles con los nombres en singular y migra los usos.
5. Test: la frase del paso 4 devuelve `['layout','section_edit']` y **aplica las dos cosas**.

## 1.6 · Memoria del turno anterior

Para que *"lo veo igual"*, *"no es eso"*, *"otra vez"* funcionen.

1. Tipo `ProposalTurnMemory { instruction, tools: string[], sections: string[], stats, satisfied }`.
2. Persiste **solo el último turno** en `lead.configuracion` → campo nuevo `proposal_last_turn`
   (es JSON base64, no hace falta migración; añade el campo a `ConfiguradorConfig`).
3. Helper `isFeedbackOnly(instruction)`:
   `lo veo igual|no ha cambiado|sigue igual|no me gusta|otra vez|repite|no es eso|mas de lo mismo|igual que antes|no funciona`.
4. Si es feedback-only **y** hay `lastTurn`: no lo trates como instrucción nueva. Reinyecta
   la anterior con *"el cambio fue insuficiente, hazlo AHORA de forma mucho más agresiva y
   evidente"* y sube el objetivo de densidad. Si no hay `lastTurn`, pide concreción.

## 1.7 · Red de seguridad para lo imprevisible

> Requisito literal del comercial: *«necesito que pueda cambiar cualquier cosa que ahora
> mismo no podamos prevenir»*.

Hoy el sistema solo sabe hacer lo que hay en la lista cerrada de `ProposalPatch`. Cualquier
petición fuera de esa lista muere en *"No pude aplicar el cambio"*. Eso **no se arregla
añadiendo más ops** — siempre habrá una petición que no anticipaste. Se arregla con una vía
de escape genérica.

**Tareas:**

1. Herramienta `rewrite_section_freeform({ section, instruction })`: cuando ninguna
   herramienta específica encaja, el agente le pasa la sección y la instrucción en crudo a
   una sub-llamada (modelo heavy) que devuelve el cuerpo BRM nuevo completo de esa sección.
   Es el comodín: cubre peticiones de forma/estilo/estructura que nadie modeló.
2. **Prohibido rendirse en seco.** El agente NUNCA responde "no puedo" sin antes haber
   intentado, en este orden: (a) la herramienta específica, (b) `read_section` +
   `replace_section`, (c) `rewrite_section_freeform`. Solo si las tres fallan responde —
   y entonces debe decir **qué** intentó y **qué necesita** del usuario para lograrlo.
3. Cuando la petición sea de algo que la plantilla BRM **realmente no soporta** (p. ej.
   "mueve el logo", "cambia la tipografía", "pon dos columnas"), el agente debe decirlo
   explícitamente y ofrecer la alternativa más cercana que sí existe, en vez de fingir que
   lo ha hecho o dar un error genérico. Añade al system prompt la lista de lo que se
   controla desde el documento (contenido, bloques BRM, saltos, tema) frente a lo que vive
   en la plantilla visual (tipografías, logo, márgenes, colores exactos).
4. Loguea las instrucciones que acaban en `rewrite_section_freeform` o en fallo total:
   **esa lista es el backlog de las próximas herramientas.**

**Hecho cuando:** los pasos 8, 9 y 11 funcionan, el agente se auto-corrige cuando un
`replace_text` falla en vez de contestar "no pude", y una petición inventada que no esté en
ninguna skill (*"ponme el punto 3 en forma de preguntas y respuestas"*) se aplica igualmente.

---

# FASE 2 — Streaming: que el usuario vea qué está pasando

> **Esto sube de prioridad por queja directa del comercial:** *«la interfaz a veces me dice
> actualizando y no sé si es un bug o qué porque tarda demasiado»*.
> Medido: **20,6 s para ampliar UNA sección**. La Fase 3 (13 llamadas encadenadas) es
> inusable sin esto. Ya hay una tirita en la UI (cronómetro + `waitingHint`), pero es
> tiempo transcurrido, no progreso real.

**El problema no es la lentitud, es la opacidad.** El usuario no puede distinguir
"trabajando" de "colgado", y eso le hace recargar la página y perder el trabajo.

**Tareas:**

1. Convierte `pages/api/onboarding/projects/[leadId]/proposal-chat.ts` en SSE
   (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).
   En pages router: `res.write('data: ' + JSON.stringify(ev) + '\n\n')` y `res.end()` al
   final. **No** uses `res.json()` en esta ruta.
2. Eventos que debe emitir el agente de la Fase 1, en este orden:
   - `{ type:'start', skills:['section_edit'], model:'heavy' }`
   - `{ type:'tool', name:'read_section', target:'Punto de partida' }` — uno por herramienta
   - `{ type:'progress', done:7, total:13, label:'Mantenimiento y mejora continua' }`
   - `{ type:'retry', reason:'la ampliación fue insuficiente, reintentando' }`
   - `{ type:'done', content, note, stats, intentSatisfied }`
   - `{ type:'error', message }`
3. **Compatibilidad:** mantén la respuesta JSON clásica si la petición no manda
   `Accept: text/event-stream`. No rompas ningún otro consumidor de la ruta.
4. En `OnboardingProposalWorkspace.tsx`, consume el stream (fetch + `ReadableStream` +
   `TextDecoder`, no `EventSource` — necesitas POST) y sustituye el `waitingHint` actual por
   el progreso real: *"Ampliando 7/13 · Mantenimiento y mejora continua · 48 s"*.
   Conserva el cronómetro: sigue siendo útil.
5. **Cancelar:** botón de "Detener" que aborta con `AbortController`. Si el usuario cancela,
   **no** se persiste nada y el draft anterior queda intacto.
6. Revisa el timeout de la plataforma. Producción es **EasyPanel** (Node, no Vercel serverless),
   pero comprueba proxy/nginx: un buffer intermedio puede tragarse el SSE. Si ves que los
   eventos llegan todos de golpe al final, añade `X-Accel-Buffering: no` a las cabeceras.
7. Test: un mock del agente que emite 3 eventos y comprobar que el endpoint escribe 3 tramas
   `data:` bien formadas y cierra.

**Hecho cuando:** una operación de 60 s muestra actividad concreta cada pocos segundos y el
usuario nunca se pregunta si se ha colgado.

---

# FASE 3 — Ejecutor masivo (fan-out): "amplía TODOS los puntos"

Pedir 13 secciones desarrolladas en **una** respuesta es imposible por tokens, aunque subas
el límite. Hay que trocear.

**Tareas:**
1. `detectBulkScope(instruction)` → `{ bulk, scope:'all_sections'|'listed', sections?: number[],
   action:'expand'|'condense'|'enrich' } | null`.
   Señales: `cada punto|todos los puntos|todo el documento|cada seccion|todas las secciones|
   el doble de contenido|mas contenido en todo|llena todo`.
2. Ejecutor `runBulkSectionEdit()` en `lib/onboarding/proposal-bulk.ts`:
   - Una llamada IA **pequeña e independiente por sección**, que recibe: esa sección,
     el context pack **filtrado por relevancia para esa sección**, el objetivo y la sintaxis BRM.
     Devuelve **solo el cuerpo nuevo** de esa sección.
   - Concurrencia limitada: lotes de 3-4 con `Promise.all`. Nunca 13 a la vez (rate limits).
   - Si una sección falla, **conserva la original y sigue** (degradación elegante).
   - Ensambla con `replace_section` y verifica sección a sección con `verifyIntent`.
3. Objetivos de densidad por acción:
   - `expand` → 350-600 palabras por sección
   - `enrich` → mínimo un bloque visual (`:::table`/`:::cards`/`:::callout`/`:::chart`) y 2+ `###`
   - `condense` → -40% palabras conservando todos los hechos
4. Expón el ejecutor al agente como la herramienta `expand_sections` de la FASE 1.
5. `note` final con datos reales: *"11 de 13 puntos ampliados (+4.800 palabras, 6 tablas nuevas)."*
6. Tests: `detectBulkScope` con las frases reales de los pasos 4, 5 y 15; y el ensamblador
   con IA **mockeada** (nunca llames a OpenRouter en tests).

**Hecho cuando:** los pasos 4, 5 y 15 producen +3.000 palabras reales repartidas por todo
el documento.

---

# FASE 4 — Gráficos con sentido: modo "proyección ilustrativa"

El usuario pide *"cómo iría la empresa sin Buffalo y con Buffalo, que se note un gran
crecimiento"* — que **por definición es una proyección modelada**. Pero
`PROPOSAL_BRM_SYNTAX` dice *"No inventes cifras"* y la skill `chart` dice *"Cifras SOLO del
contexto… NUNCA los presentes como reales"*. El modelo queda atrapado entre dos órdenes
contradictorias y saca datos planos o no cambia nada.

**Tareas:**
1. Introduce el concepto explícito y **permitido** de *escenario / proyección ilustrativa*,
   distinto de "inventar datos reales":
   - Permitido: valores modelados **si** el `title` lo indica ("Proyección ilustrativa") **y**
     hay una nota bajo el gráfico con las hipótesis
     (*"Escenario basado en una mejora del 25% en conversión; a validar con datos del cliente"*).
   - Sigue prohibido: presentar cifras inventadas como históricas/reales, e inventar precios
     o compromisos contractuales.
   - Refleja esta distinción en `PROPOSAL_BRM_SYNTAX` **y** en la skill `chart`.
2. `lib/onboarding/proposal-data-tools.ts` con funciones **deterministas** (el LLM aporta
   hipótesis, **no** hace aritmética):
   - `buildScenarioSeries({ periods, periodLabel, baseline, baselineGrowthPct, upliftPct, startLabel? })`
     → crecimiento compuesto con divergencia creciente y visible entre las dos series.
   - `buildChartBlock({ type, title, columns, rows, note? })` → texto `:::chart{...}` con
     tabla GFM válida (valida nº de columnas por fila; escapa `|`).
3. Herramientas/ops nuevas:
   - `set_chart_type({ section, type })` — cambia **solo** el `type=` de un `:::chart`
     existente sin tocar los datos. Arregla el paso 9 de forma garantizada.
   - `insert_scenario_chart({ section, chartType, title?, periods?, baseline?,
     baselineGrowthPct?, upliftPct?, note?, replaceExisting? })` — con `replaceExisting`
     sustituye el `:::chart`/`:::table` que ya haya en esa sección. Arregla el paso 8.
4. Documenta ambas en el system prompt y en la skill `chart`.
5. Tests: crecimiento compuesto correcto, divergencia creciente, `buildChartBlock` válido,
   `set_chart_type` no altera los datos, `insert_scenario_chart` con `replaceExisting`.

**Hecho cuando:** los pasos 8, 9 y 10 producen un gráfico con curvas que se separan de forma
evidente y una nota de hipótesis bajo él.

---

# FASE 5 — Validador: nunca guardar un documento roto

Hoy "éxito" = *"el texto cambió"*. Con las herramientas nuevas esto pasa a ser crítico.

**Tareas:**
1. `validateProposalDraft(draft): { ok, issues: string[], fixed?: string }` en `proposal-brm.ts`:
   - Balance de `:::` con anidación correcta (`:::cards` con `:::card` dentro, `:::kpi-grid` con `:::kpi`).
   - Solo directivas que el renderer soporta (compara contra la lista de `remarkBuffaloDirectives.ts`).
   - La sección Aceptación/Acceptance contiene `:::signatures`.
   - Todo `:::chart` tiene tabla con ≥1 fila y columnas consistentes con la cabecera.
   - Sin placeholders sin resolver: `{{…}}`, `TODO`, `XXX`, `[…]`.
   - Portada: subtítulo ≤ ~400 caracteres.
   - Autocorrección de lo trivial: cerrar `:::` colgantes al final, colapsar `\n{3,}`.
2. Engánchalo en el agente tras cada tanda de herramientas y **antes de persistir**. Si no
   valida y no se autocorrige → devuelve el draft anterior con nota honesta.
3. Igual al final de `generateProposalFromContext`: **un** reintento antes de devolver error.
4. Tests: `:::callout` sin cerrar, `:::chart` con filas desiguales, Aceptación sin
   `:::signatures`, directiva inventada por el modelo.

---

# FASE 6 — Generación inicial en dos fases (arquitecto → redactor)

`generateProposalFromContext` es **una sola llamada** pidiendo 13 secciones. Es la causa de
que el documento **nazca pobre** ("un párrafo por punto") y de que el comercial tenga que
pedir "amplía todo" nada más generarlo.

**Tareas:**
1. `planProposalOutline(input)` → **una** llamada (modelo HEAVY, JSON mode) que devuelve, para
   cada una de las 13 secciones ACCIÓ: 2-4 bullets de qué cubrir **con datos concretos del
   contexto del cliente**, y si conviene `:::chart`/`:::table`/`:::cards` y con qué datos.
2. `writeProposalSection(plan, shared)` → una llamada por sección que expande el plan a BRM
   completo (350-600 palabras + el bloque visual que indique el plan).
3. Ejecuta en lotes de 3-4, ensambla en orden, pasa por `polishProposalDraft` y
   `validateProposalDraft`.
4. **Fallback obligatorio:** si el plan falla o es inválido, cae a la implementación actual
   de una sola llamada. Loguea el fallback (`console.warn`).
5. Reutiliza el ejecutor de la FASE 3 — es el mismo patrón (fan-out por sección con objetivo
   de densidad). No escribas dos motores.

**Hecho cuando:** una propuesta recién generada tiene 2.500-5.000 palabras reales, ≥4
pagebreaks, ≥2 bloques visuales y `:::signatures`, **sin tocar el chat**.

---

# FASE 7 — Editor manual y contratos

## 7.1 · Editor manual (el escape hatch que hoy no existe)
El comercial está **100% rehén del chat**: no puede tocar un párrafo a mano. Ninguna
herramienta tipo Claude Design es solo-chat.
- Click en una sección de la preview → panel lateral con su markdown BRM editable, guardar
  → `replace_section`. Reutiliza `useDraftHistory` (undo/redo ya existe).
- Botón "ver markdown completo" con edición directa y validación al guardar.

## 7.2 · Portar el motor a contratos
Solo cuando 1-6 estén estables y probadas. `contract-patches.ts` tiene ya sus ops
deterministas: envuélvelas como herramientas y reutiliza **el mismo bucle agéntico**
(`proposal-agent.ts` debe ser genérico sobre "documento + caja de herramientas").
El editor de contratos hoy solo inyecta `definition` truncada a 2.000 caracteres y **no** el
contexto CRM: aplícale el mismo `buildProposalContextPack`.

---

## Orden de ejecución

```
FASE 0  ✅ HECHA — no la repitas
   ↓
FASE 1  ← EMPIEZA AQUÍ. Bucle agéntico + multi-intención.
           Es el corazón del cambio y resuelve 2 de las 3 quejas del comercial.
   ↓
FASE 2  (streaming — sin esto, la Fase 3 es inusable)
   ↓
FASE 3 → FASE 4 → FASE 5     (fan-out, gráficos, validador)
   ↓
FASE 6  (generación densa en dos fases)
   ↓
FASE 7  (editor manual, contratos)
```

**Si solo puedes hacer dos fases, haz la 1 y la 2.**

## Después de CADA fase

1. `npm run test` en verde (incluidos los tests nuevos de esa fase).
2. `npm run build` sin errores de tipos (EasyPanel hace typecheck en el build).
3. Prueba manual en `/onboarding/propuesta?lead=<id>` con un lead real que tenga auditoría
   y reuniones: **Generar con IA** → recorrer los 16 pasos del criterio de aceptación
   → **Descargar PDF** → **HTML**.
4. Commit atómico con mensaje descriptivo de la fase.

## Cosas que NO debes hacer

- No refactorices `applyProposalPatches`: **envuélvelo**. Es el motor determinista que ya
  funciona y tiene tests.
- No metas dependencias nuevas. Todo se hace con lo que ya hay (`zod`, `vitest`, fetch).
- No llames a OpenRouter en los tests. Mockea siempre.
- No inventes campos en la BD: `lead.configuracion` es JSON base64, añade claves a
  `ConfiguradorConfig` y ya.
- No toques el flujo de export a PDF/HTML (`exportReportPdf.ts`) — está recién arreglado.
- No borres `docs/proposal-system-upgrade-prompt*.md`: márcalos como superseded por este.

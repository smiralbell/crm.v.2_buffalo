> **SUPERSEDED** — Sustituido por el prompt «Convertir el editor de propuestas en un agente tipo Claude Design» (FASE 0+). No ejecutar este documento.

# Prompt para Cursor — Upgrade del sistema de propuestas (BRM)

Pega esto en el chat del agente de Cursor, en este mismo repo. Está pensado para
ejecutarse **fase por fase** (una fase = una tarea = un commit), no todo de golpe.
Empieza pidiéndole "Ejecuta solo la FASE 1 de este documento" y revisa el diff antes
de seguir con la siguiente.

---

## Rol y contexto

Eres un ingeniero senior trabajando en el CRM de Buffalo AI (Next.js + Prisma +
Postgres). Vas a mejorar el sistema de generación y edición de **propuestas
comerciales** (documento BRM: markdown + directivas visuales propias), sin romper
lo que ya funciona.

Archivos clave que ya existen y debes entender antes de tocar nada:

- `lib/onboarding/proposal-prompt.ts` — prompts de generación (`PROPOSAL_GENERATE_SYSTEM`)
  y edición (`PROPOSAL_EDIT_SYSTEM`, `buildProposalEditSystem`), y la sintaxis BRM
  (`PROPOSAL_BRM_SYNTAX`, `PROPOSAL_ACCI_STRUCTURE`).
- `lib/onboarding/proposal-skills.ts` — catálogo de "skills" (`PROPOSAL_SKILLS`),
  clasificador por keywords (`classifyProposalSkill`) y `formatSkillForPrompt`.
- `lib/onboarding/proposal-patches.ts` — tipo `ProposalPatch` (unión discriminada) y
  `applyProposalPatches` (motor determinista que aplica los parches), más
  `tryLocalPatches` (atajos sin IA).
- `lib/onboarding/proposal-patches.test.ts` — tests existentes (vitest), sigue este
  patrón para los tests nuevos.
- `lib/onboarding/proposal-brm.ts` — parseo/composición del draft, paginado,
  `polishProposalDraft` / `softPolishProposalDraft`.
- `lib/onboarding/proposal-design-catalog.ts` — catálogo de bloques visuales que se
  inyecta solo en la skill `design`.
- `lib/onboarding/project-context-ai.ts` — `generateProposalFromContext` (generación
  inicial) y `reviseProposalWithChat` (chat editor: atajos locales → IA → patches).
- `lib/openrouter.ts` — `openRouterChatCompletion` (wrapper HTTP a OpenRouter, NO
  soporta `tools`/function-calling todavía) y `parseJsonFromModelOutput`.
- `components/retencion/report/remarkBuffaloDirectives.ts` — parser remark de las
  directivas `:::algo{...}` a componentes React (`chart` YA está soportado aquí).
- `components/retencion/report/charts/BuffaloChart.tsx` — componente de gráficos SVG
  (line/area/bar/barcompare/donut/pie) que consume `:::chart{type="..."}` con una
  tabla markdown dentro. **Ya existe y funciona**, pero ningún prompt de propuestas
  lo menciona, así que la IA nunca lo usa.
- `pages/api/onboarding/projects/[leadId]/document.ts` y `.../proposal-chat.ts` —
  endpoints que llaman a lo anterior y persisten en `lead.configuracion` (JSON:
  `proposal_draft`, `proposal_status`). No hay tabla SQL propia del documento.
- `components/onboarding/OnboardingProposalWorkspace.tsx` — UI (generar, chat,
  preview, historial undo/redo, descarga PDF).

## Invariantes — NO rompas esto

1. El documento sigue siendo **markdown + directivas BRM** (`:::algo{...}`), nunca
   HTML crudo ni otro formato.
2. El chat editor sigue funcionando por **parches deterministas**
   (`ProposalPatch` → `applyProposalPatches`), no por "la IA reescribe todo el
   documento" salvo que el usuario pida explícitamente regenerar/traducir.
3. El contrato JSON de respuesta del editor (`{ note, patches, theme }`) no cambia
   de forma — puedes **añadir** campos opcionales, no romper el parseo existente en
   `reviseProposalWithChat` ni en el frontend.
4. Nunca inventar cifras, compromisos o cláusulas. Si un dato no está disponible:
   "A definir con el cliente".
5. Español de España por defecto (ya lo gestiona el prompt actual); catalán/inglés
   solo si el contexto o el usuario lo piden.
6. Compatibilidad con documentos ya guardados en `lead.configuracion` — no hace
   falta migración de datos, todo debe seguir parseando drafts antiguos.
7. No añadas tablas SQL nuevas para esto salvo que una fase lo justifique
   explícitamente (no debería hacer falta: todo sigue cabiendo en el JSON del lead).
8. Cada fase debe compilar, pasar `npm run test` (vitest) y no romper el editor de
   **contratos** (`contract-patches.ts` y similares), que comparte el mismo enfoque
   pero es un documento distinto — no lo toques salvo que se indique.

---

## FASE 1 — Conectar el sistema de gráficos ya existente al cerebro de la IA

**Problema:** `:::chart{type="bar|line|area|barcompare|donut|pie"}` con una tabla
markdown dentro ya renderiza gráficos SVG reales
(`components/retencion/report/charts/BuffaloChart.tsx`), pero no aparece en
`PROPOSAL_BRM_SYNTAX`, ni en `proposal-design-catalog.ts`, ni como op preferida de
ninguna skill. La IA no sabe que existe.

**Tareas:**

1. En `lib/onboarding/proposal-prompt.ts`, añade a `PROPOSAL_BRM_SYNTAX` un bloque
   documentando la directiva `:::chart{type="..." title="..."}` con una tabla GFM
   dentro (primera columna = categoría/eje X, resto = series numéricas). Explica
   los 6 tipos y cuándo usar cada uno (evolución temporal → line/area; comparar
   categorías → bar/barcompare; reparto/porcentajes → donut/pie).
2. Añade una sección equivalente en `lib/onboarding/proposal-design-catalog.ts`
   (mismo estilo que las otras entradas del catálogo).
3. En `lib/onboarding/proposal-skills.ts`:
   - Añade un nuevo `ProposalSkillId`: `'chart'`.
   - Defínelo en `PROPOSAL_SKILLS` con `when` (pide gráfico, evolución, comparativa
     visual de números, "represéntalo en un gráfico") y `how` (usar
     `:::chart` dentro de `replace_section`/`append_to_section`/`insert_section`,
     nunca en portada, cifras solo si están en el contexto/metadatos — si no,
     usar valores de ejemplo etiquetados claramente como "Ilustrativo" NUNCA
     pasarlos como reales).
   - Actualiza `classifyProposalSkill` para detectar `chart` (keywords: "gráfico",
     "grafica", "chart", "evolución visual", "represéntalo visualmente"...),
     **antes** del bucket `design` genérico si hay solape.
4. Añade tests en `lib/onboarding/proposal-patches.test.ts` (o un nuevo archivo
   `proposal-skills.test.ts` si prefieres separarlo) para `classifyProposalSkill`
   con frases tipo "hazme un gráfico de la evolución de tickets" → `'chart'`.
5. Prueba manual: en `/onboarding/propuesta` con un lead real, pide en el chat
   "añade un gráfico de barras comparando el coste manual vs Buffalo" y confirma
   que el PDF/preview lo renderiza.

**Fuera de alcance de esta fase:** no toques el motor de cálculo de cifras (eso es
la Fase 2). Aquí solo conectas la capacidad ya existente al prompt/skills.

---

## FASE 2 — Motor de datos determinista (nada de que la IA "calcule de cabeza")

**Problema:** si le pides ROI, payback o cifras de ahorro, hoy el modelo se las
inventa o las calcula mal en el propio texto. Los LLM no son fiables haciendo
aritmética dentro de un JSON de parches.

**Tareas:**

1. Crea `lib/onboarding/proposal-data-tools.ts` con funciones **puras, sin llamada
   a IA**, testeables:
   - `computeFinanceSummary(input: { setupFeeEur?: number|null; monthlyFeeEur?: number|null; currentMonthlyCostEur?: number|null }): FinanceSummary`
     — calcula ahorro/mes, payback (meses), ROI anual (%) SOLO si hay datos
     suficientes; si falta algo, marca ese campo como `null`/"A definir" en vez de
     estimarlo.
   - `buildChartBlock(input: { type: 'line'|'area'|'bar'|'barcompare'|'donut'|'pie'; title?: string; columns: string[]; rows: (string|number)[][] }): string`
     — genera el texto `:::chart{...}` con la tabla markdown bien formateada
     (escapa `|`, valida que todas las filas tengan el mismo nº de columnas que
     `columns`, lanza error descriptivo si no).
   - `buildFinanceTableBlock(summary: FinanceSummary, opts?): string` — genera un
     `:::table{variant="pricing"}` o `:::kpi-grid` con el resumen económico.
2. Amplía `ProposalPatchOpts` en `lib/onboarding/proposal-patches.ts` para incluir
   `setupFeeEur` y `monthlyFeeEur` (ya se calculan en
   `pages/api/onboarding/projects/[leadId]/proposal-chat.ts` a partir de
   `proyectos.setup_fee_eur` / `monthly_fee_eur` — pásalos igual que ya se pasa
   `clientName`/`clientCompany`).
3. Añade dos nuevos ops a `ProposalPatch` en el mismo archivo:
   - `{ op: 'insert_finance_summary'; section: number|string; style?: 'table'|'kpi-grid' }`
     — ignora cualquier cifra que venga del modelo; calcula con
     `computeFinanceSummary` usando `opts.setupFeeEur`/`opts.monthlyFeeEur` reales
     y lo inserta con `buildFinanceTableBlock`.
   - `{ op: 'insert_chart'; section: number|string; title?: string; chartType: ...; columns: string[]; rows: (string|number)[][] }`
     — usa `buildChartBlock`; el modelo SÍ puede pasar los datos (porque a veces
     son cualitativos: volúmenes de la auditoría, no dinero), pero el patch debe
     **validar** la forma de los datos antes de insertarlos (columnas/filas
     consistentes) y fallar con un error claro en `errors[]` si no cuadra, igual
     que ya hacen `replace_section`/`insert_section`.
   Implementa ambos casos en el `for (const patch of patches)` de
   `applyProposalPatches`, reutilizando `resolveSection` para ubicar dónde
   insertar (igual que `insert_section`/`append_to_section`).
4. Actualiza `PROPOSAL_EDIT_SYSTEM` (sección `OPS`) documentando estos dos ops
   nuevos, y la skill `chart`/una nueva skill `finance` en `proposal-skills.ts`
   para que el modelo sepa cuándo pedir `insert_finance_summary` en vez de
   inventarse una tabla de ROI a mano.
5. Tests unitarios exhaustivos de `proposal-data-tools.ts` (sin mocks de IA — son
   funciones puras) y de los dos ops nuevos en `applyProposalPatches`, siguiendo
   el patrón de `proposal-patches.test.ts`.

---

## FASE 3 — Router que combina varias skills (no solo una por mensaje)

**Problema:** `classifyProposalSkill` devuelve **una sola** skill por regex y hace
`return` en el primer match. Si el usuario pide "añade un gráfico y ponlo en una
card bonita", solo se inyecta la skill `design` o `chart`, nunca las dos.

**Tareas:**

1. Cambia `classifyProposalSkill` a `classifyProposalSkills(instruction): ProposalSkillId[]`
   que **acumula** todos los matches en vez de devolver en el primero (quita los
   `return` tempranos, usa un `Set<ProposalSkillId>` y añade lo que matchee,
   preservando el orden de prioridad actual: regenerate > language > cover >
   acceptance > chart > design > layout > section_edit > general).
   Si el set queda vacío, cae a `['general']`.
2. Actualiza `formatSkillForPrompt` a `formatSkillsForPrompt(skillIds: ProposalSkillId[])`
   que concatena los bloques de cada skill (con el catálogo de diseño solo una vez
   si `design` o `chart` están presentes, para no duplicar).
3. Actualiza `reviseProposalWithChat` en `project-context-ai.ts` para usar las
   nuevas funciones plural. Mantén `wantsFullDoc` si `'language'` o `'regenerate'`
   están en el array.
4. Mantén **compatibilidad hacia atrás**: si algún otro sitio del código todavía
   importa `classifyProposalSkill`/`formatSkillForPrompt` en singular, decide si
   los mantienes como wrapper (`classifyProposalSkills(x)[0]`) o los migras todos
   — busca todos los usos con grep antes de decidir.
5. Tests: instrucciones combinadas ("gráfico de barras en una card con el
   subtítulo más corto") deben devolver más de una skill.

**No** metas aquí una llamada extra a IA para "razonar" el enrutado — esto se
resuelve con el regex existente pero sin cortar en el primer match. Es la mejora
de mayor impacto por menor coste/latencia añadida (cero llamadas extra).

---

## FASE 4 — Verificador antes de guardar (nunca persistir un documento roto)

**Problema:** hoy "éxito" = "el texto cambió". No se valida que el resultado sea
BRM válido (directivas `:::` sin cerrar, tabla de un `:::chart` con columnas
inconsistentes, etc.).

**Tareas:**

1. En `lib/onboarding/proposal-brm.ts` añade `validateProposalDraft(draft: string): { ok: boolean; issues: string[] }`
   que compruebe, como mínimo:
   - Todo `:::directiva{...}` abierto tiene su `:::` de cierre correspondiente
     (balance de aperturas/cierres, no solo un regex simple — ten en cuenta
     anidación de `:::cards` con `:::card` dentro).
   - Si hay sección "Aceptación"/"Acceptance", debe contener `:::signatures`.
   - Cualquier `:::chart` debe tener una tabla con ≥1 fila de datos y todas las
     filas con el mismo número de columnas que la cabecera.
   - No quedan placeholders sin resolver tipo `{{...}}` o `TODO`.
2. Engánchalo en `reviseProposalWithChat` (`project-context-ai.ts`) justo después
   de `applyProposalPatches`: si `validateProposalDraft(draft).ok === false`,
   NO guardes el resultado roto. En vez de eso:
   - Si el problema es simple y autocorregible de forma determinista (p. ej. un
     `:::` sin cerrar al final del documento), arréglalo en código.
   - Si no, devuelve `finish(before, 'No pude aplicar el cambio de forma segura (…). Prueba de nuevo o sé más específico.')`
     en vez de persistir un documento inválido.
3. Aplica la misma validación al final de `generateProposalFromContext` (después
   de `polishProposalDraft`): si falla, reintenta UNA vez la generación antes de
   devolver error al usuario.
4. Tests: drafts con `:::callout` sin cerrar, `:::chart` con filas desiguales,
   "Aceptación" sin `:::signatures` → `ok: false` con el issue correcto.

---

## FASE 5 — Generación inicial en dos fases (arquitecto + redactor)

**Problema:** `generateProposalFromContext` es una única llamada de hasta 12k
tokens pidiendo las 13 secciones de golpe. Es lo que más se beneficia de más
"cerebro" porque es el documento más largo y con más riesgo de quedarse genérico
o cortado.

**Tareas:**

1. Añade `planProposalOutline(input): Promise<ProposalSectionPlan[]>` en
   `project-context-ai.ts` — una llamada IA que, dado el mismo contexto/definición
   /cifras que hoy recibe `generateProposalFromContext`, devuelve un JSON con la
   lista de las 13 secciones ACCIÓ ya ancladas al cliente real: para cada una,
   2-4 bullets de qué debe cubrir (con los datos concretos del contexto que debe
   usar) y si conviene incluir un `:::chart` o `:::table` y con qué datos.
2. Añade `writeProposalSection(plan: ProposalSectionPlan, shared: {...}): Promise<string>`
   — una llamada IA por sección que expande el plan en markdown BRM completo para
   ese `##` (usa el mismo `PROPOSAL_BRM_SYNTAX` como contexto, pero solo para esa
   sección).
3. Ejecuta las secciones con concurrencia limitada (p. ej. lotes de 3-4 con
   `Promise.all`, no las 13 en paralelo sin límite — cuidado con rate limits de
   OpenRouter) y únelas en orden, luego pasa por `polishProposalDraft` como hoy.
4. **De-risk:** si `planProposalOutline` falla o devuelve algo inválido, haz
   fallback automático al `generateProposalFromContext` de una sola llamada
   actual (no rompas el flujo si la fase falla). Loguea el fallback.
5. Verifica con `validateProposalDraft` (Fase 4) el documento final antes de
   devolverlo.
6. Prueba manual con un lead real: compara la calidad/densidad del documento
   generado en dos fases contra el modo actual de una sola llamada.

---

## FASE 6 — Enrutado de modelo por dificultad de la tarea

**Tareas:**

1. Amplía `openRouterChatCompletion` en `lib/openrouter.ts` — ya acepta
   `options.model`, así que aquí solo hace falta **usarlo** de forma consistente:
   añade variables de entorno nuevas, p. ej. `OPENROUTER_MODEL_HEAVY` (para
   generación completa, regenerar, plan de outline) manteniendo
   `OPENROUTER_MODEL`/el default actual para parches rápidos (título, tema,
   subtítulo, un `replace_text`).
2. En `project-context-ai.ts`, pasa `model: process.env.OPENROUTER_MODEL_HEAVY || process.env.OPENROUTER_MODEL`
   en `generateProposalFromContext`, `planProposalOutline` y en el camino
   `wantsFullDoc` (`language`/`regenerate`) de `reviseProposalWithChat`. Deja el
   resto de llamadas (parches normales) con el modelo por defecto.
3. Documenta las nuevas env vars en `.env.example`.

---

## FASE 7 — UI: exponer las capacidades nuevas (chips de acción rápida)

**Tareas:**

1. En `components/onboarding/OnboardingProposalWorkspace.tsx`, localiza el bloque
   del chat editor y añade unos chips/botones de atajo (p. ej. "Añadir gráfico",
   "Calcular ROI", "Comparativa vs. competencia", "Traducir a inglés", "Regenerar
   todo") que simplemente rellenan/envían una instrucción de texto predefinida al
   mismo endpoint `proposal-chat` que ya existe — cero cambios de backend
   necesarios para esta fase, es puramente UI/descubribilidad.
2. Manténlos discretos (no ocupar el espacio principal del chat) y respeta el
   estilo visual existente del workspace.

---

## Orden de ejecución recomendado

1 → 2 → 3 → 4 → (5 y 6 pueden ir en paralelo, son independientes) → 7.

Las fases 1-4 son las de mayor impacto/menor riesgo (conectan y hacen fiable lo
que ya existe). Las fases 5-6 son las que dan "más músculo" a la generación
inicial. La fase 7 es la que hace visible todo lo anterior al usuario final.

Después de cada fase: `npm run test`, arranca el server y prueba manualmente en
`/onboarding/propuesta` con un lead real (generar + usar el chat), y confirma que
el PDF (`Descargar PDF`) sigue exportando bien las hojas.

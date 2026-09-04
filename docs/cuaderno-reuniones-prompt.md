# Prompt para Cursor — Sustituir la auditoría por el Cuaderno de reuniones

> **Objetivo:** reemplazar la auditoría estructurada de onboarding por un cuaderno de notas
> con copiloto de preguntas, investigación del cliente y definición del proyecto.
>
> **Hay un prototipo funcionando que es la especificación.** No inventes la interfaz:
> cópiala. Está en `C:\Users\Admin\Desktop\cursor\buffalo\notas-preview\`.
>
> **Ejecuta UNA FASE POR TAREA Y POR COMMIT.** Empieza con: *"Ejecuta solo la FASE 0"*.
> Al terminar cada fase: `npm run test`, `npm run build`, y prueba manual.

---

## 0. Por qué se cambia

La auditoría actual (`lib/onboarding/audit/`, ~5.800 líneas) obliga al comercial a rellenar
campos estructurados **mientras habla con el cliente**. En una reunión real eso no se puede
hacer: escribes a mano lo que se dice y ya está.

El cuaderno le da la vuelta: **escribes libre, y el copiloto detecta qué te falta por
preguntar.** Mismo objetivo (llegar a la reunión con todo y salir con el proyecto definido),
interacción opuesta.

---

## 1. El prototipo ES la especificación

```
C:\Users\Admin\Desktop\cursor\buffalo\notas-preview\
├── index.html   ← toda la interfaz y la lógica de cliente
├── server.js    ← scraping real + API
└── README.md    ← qué hace cada cosa y qué está simulado
```

**Antes de escribir una línea: arráncalo y úsalo.**

```bash
cd "C:/Users/Admin/Desktop/cursor/buffalo/notas-preview"
node server.js
```

Abre `http://localhost:5599`, escribe notas, teclea `@`, investiga una web real, mira
"Ver contexto" y "Diagnóstico". **Lo que ves ahí es lo que hay que construir.**

### Fidelidad visual: no lo reinterpretes

El usuario ha pedido explícitamente que quede **exactamente igual**. No conviertas el diseño
a componentes de shadcn ni lo "adaptes al estilo del CRM": el prototipo YA está hecho con la
paleta del CRM (zinc + esmeralda, `rounded-3xl`, tamaños `[11px]`/`[13px]`).

**Cómo garantizar la fidelidad:** extrae el `<style>` del prototipo tal cual a
`styles/notebook.css` conservando los nombres de clase (`.note-item`, `.q`, `.at-menu`,
`.dossier`, `.hl-res`…) e impórtalo desde la página. Hay precedente en el repo:
`components/retencion/report/buffaloReportCss.ts` ya hace CSS crudo.
**No traduzcas 700 líneas de CSS a Tailwind**: se va a desviar y el usuario lo va a notar.

---

## 2. Qué hay hoy en el CRM (inventario verificado)

**Auditoría — código a sustituir:**
- `lib/onboarding/audit/` — 17 archivos, ~5.800 líneas (`agent.ts` 1.122, `catalog.ts` 804…)
- `components/onboarding/audit/` — 6 componentes
- `pages/onboarding/audit.tsx` — la página
- `pages/api/onboarding/audit/index.ts` y `[id].ts` — la API

**Base de datos:** tabla `project_audits`, con **SQL directo** (`lib/db.ts` → `query()`),
no Prisma models. Sigue esa convención para lo nuevo.

**Quién consume la auditoría (CRÍTICO — no lo rompas):**
- `lib/onboarding/project-context-ai.ts:31-33` →
  `getAuditByLeadId(leadId)` + `buildProposalPayload(audit)` → `payload.brief`
  alimenta `buildCrmContextSources()`, que es **de donde sale el contexto de la propuesta
  comercial**. Si esto se rompe, las propuestas salen vacías.
- `pages/api/onboarding/audit/[id].ts:457` → también usa `buildProposalPayload`.

**Enlaces que llevan a `/onboarding/audit`:**
- `pages/onboarding/index.tsx:67` (`auditResumeUrl`) y `:347`
- `pages/onboarding/configure.tsx:219`
- `pages/onboarding/proyectos/[id].tsx:225`

**Migraciones:** archivo `.sql` en `prisma/history/` + runner en `scripts/run-*-sql.mjs`
(usan `prisma.$executeRawUnsafe` troceando por `;`). Copia ese patrón.

---

## 3. Invariantes

1. **No borres la auditoría hasta la FASE 6.** Primero construye el cuaderno al lado, y solo
   cuando funcione, cambia las rutas. Un `git revert` tiene que poder devolverte atrás.
2. **Las auditorías ya guardadas no se pierden.** `buildCrmContextSources` debe leer notas
   **y**, si no hay, caer a la auditoría antigua. Hay clientes con auditorías hechas.
3. SQL directo con `lib/db.ts`, como el resto de onboarding. Nada de modelos Prisma nuevos.
4. TypeScript estricto: cero `any` nuevos, cero `@ts-ignore`. `npm run build` debe pasar.
5. No toques el editor de propuestas ni el de contratos.

---

# FASE 0 — Usar el prototipo y hacer el plan

1. Arranca el prototipo y **úsalo 10 minutos de verdad**: escribe una nota larga, mira cómo
   cambian las preguntas, teclea `@`, investiga `anthropic.com`, abre "Ver contexto" y
   "Diagnóstico", crea una nota nueva, cambia el tipo a "Definición".
2. Lee `index.html` entero. Fíjate especialmente en:
   - `TOPICS` (14 temas de descubrimiento) y `TRIGGERS` (7 disparadores) — **esto es el guion
     comercial de Buffalo. No lo tires: en la Fase 3 pasa a ser el prompt del LLM.**
   - `paintHighlight()` y el porqué de la capa espejo.
   - `atTokenAtCaret()` y por qué es sin estado.
3. Lee `server.js`: `signals()`, `interestingLinks()`, `decode()`, `rulesHooks()`.
4. Escribe en `docs/cuaderno-plan.md` el plan de migración: qué archivo del CRM nace de qué
   parte del prototipo. **No escribas código todavía.**

---

# FASE 1 — Datos y API

## 1.1 · Tabla

`prisma/history/CREATE_PROJECT_NOTES.sql`:

```sql
CREATE TABLE IF NOT EXISTS project_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      integer NOT NULL,
  note_date    date NOT NULL DEFAULT CURRENT_DATE,
  type         text NOT NULL DEFAULT 'reunion',   -- reunion | libre | definicion
  title        text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_notes_lead ON project_notes (lead_id, note_date DESC);

CREATE TABLE IF NOT EXISTS project_research (
  lead_id      integer PRIMARY KEY,
  url          text NOT NULL,
  data         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

Y su runner `scripts/run-project-notes-sql.mjs`, copiando `run-smart-cards-sql.mjs`.

> **Por qué tabla propia y no `lead.configuracion`:** son varias filas por lead y van a
> crecer sin techo. `configuracion` es un JSON base64 en una columna; meter ahí las notas
> lo revienta.

## 1.2 · Store

`lib/onboarding/notes/store.ts` con `query()` de `lib/db.ts`:

```ts
export type ProjectNote = {
  id: string; lead_id: number; note_date: string
  type: 'reunion' | 'libre' | 'definicion'
  title: string; body: string
  created_at: string; updated_at: string
}
listNotes(leadId), getNote(id), createNote(...), updateNote(id, patch), deleteNote(id)
getResearch(leadId), saveResearch(leadId, url, data)
```

## 1.3 · API

- `pages/api/onboarding/projects/[leadId]/notes.ts` — GET lista, POST crea
- `pages/api/onboarding/projects/[leadId]/notes/[noteId].ts` — PATCH, DELETE

Autenticación con `requireAuthAPI` y validación con `zod`, igual que
`pages/api/onboarding/projects/[leadId]/proposal-chat.ts`.

**Guardado:** el prototipo guarda en cada tecla contra `localStorage`. Contra Postgres eso
es inviable. Usa **rebote de 800 ms** en el cliente + `PATCH` parcial. El indicador
*"Guardado hace 12s"* del prototipo se mantiene, pero refleja el PATCH real.

**Tests:** el store con la BD mockeada. No llames a Postgres en los tests.

---

# FASE 2 — La interfaz (fidelidad exacta)

1. `styles/notebook.css` — el `<style>` del prototipo, tal cual, mismos nombres de clase.
2. `pages/onboarding/notas.tsx` — la página, con el `Layout` del CRM.
3. `components/onboarding/notes/NotebookWorkspace.tsx` — el grueso, portando el markup
   de las 3 columnas: cuaderno / editor / copiloto.
4. Componentes: `NoteList.tsx`, `NoteEditor.tsx`, `CopilotPanel.tsx`, `AtMenu.tsx`,
   `ResearchDialog.tsx`, `ContextDialog.tsx`, `DiagnosticDialog.tsx`.
5. Estado con `useState` + rebote. Nada de librerías de estado nuevas.

### ⚠️ Tres trampas del prototipo que ya me costaron encontrar

**(a) El resaltado verde de la investigación.**
Un `<textarea>` no puede colorear trozos de texto. El prototipo pinta una **capa espejo**
por debajo (`.note-hl`) con el mismo texto en `color: transparent`, y solo se ven los
fondos. Para que cuadre:
- Misma `font-family`, `font-size`, `line-height`, `letter-spacing`, ancho y `white-space: pre-wrap`.
- **El textarea NO puede tener barra de scroll propia** (`overflow: hidden` + crecer con el
  contenido ajustando `style.height = scrollHeight`). Si la tiene, le roba ~15px de ancho,
  el texto parte en sitios distintos que la capa y el verde se desalinea. Medido: **45px de
  desviación**, el verde no cubría el bloque.
- El `\n` final de la capa solo si el texto acaba en salto; si no, queda una línea más alta.
- Verifícalo midiendo: desviación < 4px entre el `<span class="hl-res">` y la posición real
  del carácter `┌`.

**(b) El menú `@` tiene que ser SIN ESTADO.**
La primera versión guardaba `atOpen` y **se atascaba**: el segundo `@` no abría. Y solo
abría tras espacio o salto de línea, así que escribir `@` después de un punto —lo más
normal— no hacía nada. La versión buena (`atTokenAtCaret()`) recalcula desde el texto en
cada `input`, `click` y `keyup`:

```js
/(?:^|[^\p{L}\p{N}@])@([\p{L}\p{N}_-]*)$/u
```

Abre tras cualquier cosa que no sea letra o número (punto, coma, paréntesis, inicio) y NO
abre dentro de una palabra, para no romper los correos. Envuélvelo en `try/catch` con
alternativa ASCII: si el navegador no soporta `\p{L}`, el literal es un **error de sintaxis
que mata el script entero**.

**(c) Los botones de cada pregunta, siempre visibles.**
Estaban con `opacity: 0` hasta el hover y el usuario reportó que "las preguntas no
funcionan". Descubribilidad cero. Ya está corregido en el prototipo: no lo revuelvas.

---

# FASE 3 — Copiloto de preguntas con LLM

En el prototipo el motor es heurístico (palabras clave). En el CRM lo hace el modelo.

1. `lib/onboarding/notes/topics.ts` — porta `TOPICS` y `TRIGGERS` del prototipo **tal cual**.
   Son el guion comercial de Buffalo: qué hay que sacar de una reunión. Se convierten en el
   guion que se le inyecta al modelo, no se tiran.
2. `pages/api/onboarding/projects/[leadId]/notes-copilot.ts`:
   - Entrada: todas las notas del lead + la ficha de investigación.
   - Reutiliza **`buildProposalContextPack`** (`lib/onboarding/proposal-context-pack.ts`)
     para que el copiloto vea también auditoría vieja y reuniones de Fireflies.
   - Modelo: `resolveModel('heavy')` — redactar preguntas buenas no es tarea de modelo mini.
   - `json: true`. Devuelve:
     ```json
     { "cubiertos": ["volumen","canales"],
       "preguntas": [{ "tema":"Presupuesto", "tipo":"hueco|profundizar|web",
                       "texto":"…", "porque":"…" }] }
     ```
3. **Coste — esto importa.** El prototipo recalcula 550 ms después de cada tecla. Contra un
   LLM eso son cientos de llamadas por reunión.
   - Rebote de **4 segundos** de inactividad, y además solo si el texto ha crecido ≥ 120
     caracteres desde la última llamada.
   - Cachea por hash del contenido: mismo texto, misma respuesta, sin llamada.
   - Botón "Actualizar preguntas" para forzarlo.
   - **Fallback:** si la llamada falla o no hay clave, usa el motor heurístico del prototipo.
     El panel nunca puede quedarse vacío en mitad de una reunión.
4. La barra de cobertura y los chips de temas salen de `cubiertos`.

---

# FASE 4 — `@investigar` con scraping real

1. `lib/onboarding/notes/scrape.ts` — porta de `server.js`: `getPage`, `decode`, `text`,
   `meta`, `headings`, `signals`, `interestingLinks`, `rulesHooks`.
2. `pages/api/onboarding/projects/[leadId]/research.ts` — POST `{ url }`, guarda en
   `project_research` y devuelve la ficha.
3. Enriquecimiento con LLM: igual que `llmEnrich` en `server.js`, con `resolveModel('heavy')`.
   Sin clave, los ganchos salen de reglas.
4. El bloque se inserta **en la nota**, en verde, con los marcos `┌ │ └`. Formato exacto en
   `researchToText()` del prototipo.

### Lo que hay que saber antes de prometer nada

- **Timeout de 12 s y máximo 3 subpáginas.** Sin tope, un sitio lento cuelga la petición.
- **Muchas webs cargan el contenido con JavaScript** y el HTML plano viene medio vacío. Con
  webs sencillas funciona; con un WordPress de constructor visual puede salir pobre. Si pasa
  con clientes reales, la solución es un servicio de scraping que ejecute JS — dependencia
  externa de pago. **No la metas sin preguntar.**
- **Decodifica las entidades HTML** (`&#x27;` → `'`), incluidas las numéricas, y también en
  los `<meta>`. Si no, las descripciones salen en crudo.
- **Limpia el nombre**: los `<title>` vienen como `Home | Marca` o `Home \ Marca`. Quédate
  con el trozo más largo que no sea "home"/"inicio".
- **Errores en cristiano.** `fetch` esconde la causa real en `e.cause.code`: sin mirar ahí,
  todo sale como "fetch failed". Distingue dominio inexistente, timeout, TLS y conexión
  rechazada.
- **SSRF:** la URL la escribe el comercial, pero valida igual. Rechaza `localhost`, `127.*`,
  `10.*`, `192.168.*`, `169.254.*` y esquemas que no sean http/https.

---

# FASE 5 — Contexto, diagnóstico y definición

1. **Ver contexto** — porta `buildContexto()`. Debe enseñar **exactamente** lo que recibiría
   la IA: investigación + definición + notas + **la lista de lo aún no preguntado**. Ese
   último bloque es deliberado: evita que el modelo se invente lo que no sabe.
2. **Diagnóstico** — porta `buildDiagnostico()` con su semáforo (verde / ámbar / rojo),
   qué sabemos, qué falta, de dónde sale y el riesgo.
3. **Usar como definición del proyecto** — la nota de tipo `definicion` escribe en
   `cfg.description` vía `mergeLeadConfig`, que es lo que ya consume la propuesta. Antes de
   sobrescribir, **enseña qué se va a enviar y pide confirmación** (el prototipo abre un
   panel con el contenido).
4. **Redactar desde mis notas** — en el CRM lo hace el LLM (modelo heavy) a partir de todas
   las notas, no la plantilla del prototipo. Debe terminar con el apartado *"Pendiente de
   confirmar"* con los huecos.

---

# FASE 6 — Sustituir la auditoría (lo último)

**Solo cuando las fases 1-5 estén probadas con un lead real.**

1. **Redirige las entradas** — que estos 4 sitios apunten a `/onboarding/notas`:
   `pages/onboarding/index.tsx:67` y `:347`, `pages/onboarding/configure.tsx:219`,
   `pages/onboarding/proyectos/[id].tsx:225`.
2. **`/onboarding/audit` no se borra todavía:** déjala accesible en modo lectura, con un
   aviso arriba: *"Esta auditoría es del sistema anterior. El cuaderno está en …"*.
3. **El contexto de la propuesta pasa a leer notas.** En `buildCrmContextSources()`
   (`lib/onboarding/project-context-ai.ts:27`), el orden queda:
   ```
   1. Notas del cuaderno (nuevo)
   2. Ficha de investigación (nuevo)
   3. Auditoría antigua  ← SOLO si el lead no tiene notas
   4. Reuniones de Fireflies (se queda igual)
   ```
   **Esto es lo más delicado de toda la migración.** Pruébalo con un lead que tenga
   auditoría vieja y con otro que solo tenga notas, y genera la propuesta en ambos.
4. **Retirada del código, en un commit aparte y solo cuando el usuario lo confirme:**
   `lib/onboarding/audit/`, `components/onboarding/audit/`, `pages/onboarding/audit.tsx`,
   `pages/api/onboarding/audit/`. La tabla `project_audits` **no se borra**: es histórico.
   `agent.test.ts` (16 tests) se va con su código.

---

## Orden

```
FASE 0 (usar el prototipo)  →  1 (datos)  →  2 (interfaz)  →  3 (copiloto)
   →  4 (scraping)  →  5 (contexto)  →  6 (sustituir)
```

**No adelantes la 6.** Mientras no esté probado, la auditoría es lo único que alimenta las
propuestas de los clientes que ya están en marcha.

## Después de cada fase

1. `npm run test` en verde.
2. `npm run build` sin errores de tipos (EasyPanel hace typecheck en el build).
3. Prueba manual en `/onboarding/notas?lead=<id>` con un lead real.
4. Commit atómico.

## Qué NO hacer

- No reinterpretes el diseño: el prototipo es la especificación.
- No conviertas el CSS a Tailwind.
- No metas dependencias nuevas (ni editor rich-text, ni librería de estado, ni scraper).
  Todo se hace con lo que ya hay.
- No llames a OpenRouter ni a Postgres en los tests. Mockea.
- No borres `project_audits` ni el código de auditoría antes de la Fase 6.
- No dispares el copiloto en cada tecla: se te va el coste en llamadas.

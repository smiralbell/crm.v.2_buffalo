# Plan de migración — Cuaderno de reuniones (sustituye auditoría)

> **FASE 0.** Prototipo = especificación visual y de flujo.
> Fuente: `C:/Users/Admin/Desktop/cursor/buffalo/notas-preview/` (`index.html` ~1394 líneas, `server.js` ~327, `README.md`).
> Arranque: `node server.js` → `http://localhost:5599` (puerto ya en uso = prototipo activo).
>
> **No hay código de producción en esta fase.** Solo este plan.

---

## 1. Por qué y qué no tocar

La auditoría estructurada (`lib/onboarding/audit/`, ~5.800 líneas) obliga a rellenar campos
durante la reunión. El cuaderno invierte el flujo: texto libre + copiloto de huecos.

**Invariantes:**
- No borrar auditoría hasta **FASE 6**.
- `buildCrmContextSources` debe seguir alimentando propuestas: notas nuevas **y** fallback a auditoría vieja.
- SQL directo (`lib/db.ts`), no modelos Prisma nuevos.
- No tocar editor de propuestas ni contratos.
- CSS del prototipo **tal cual** (no Tailwindizar).

---

## 2. Mapa prototipo → CRM

### 2.1 · Estilos e interfaz (FASE 2)

| Prototipo | CRM |
|---|---|
| `<style>` completo de `index.html` (clases `.app`, `.topbar`, `.grid`, `.panel`, `.note-item`, `.note-hl`, `.note-text`, `.q`, `.q-list`, `.at-menu`, `.dossier`, `.hl-res`, `.veil`, `.modal`, `.coverage-bar`, …) | `styles/notebook.css` — copiar CSS crudo; importar desde la página (precedente: `buffaloReportCss.ts`) |
| Markup 3 columnas (cuaderno / editor / copiloto) + topbar | `pages/onboarding/notas.tsx` + `components/onboarding/notes/NotebookWorkspace.tsx` |
| Lista de notas agrupada por día | `components/onboarding/notes/NoteList.tsx` |
| Título, tipo, textarea + capa espejo | `components/onboarding/notes/NoteEditor.tsx` |
| Cobertura + preguntas + dossier | `components/onboarding/notes/CopilotPanel.tsx` |
| Menú `@` flotante | `components/onboarding/notes/AtMenu.tsx` |
| Modal URL investigación | `components/onboarding/notes/ResearchDialog.tsx` |
| Modal “Ver contexto” | `components/onboarding/notes/ContextDialog.tsx` |
| Modal “Diagnóstico” | `components/onboarding/notes/DiagnosticDialog.tsx` |
| `localStorage` en cada tecla | Rebote **800 ms** → `PATCH` real; conservar indicador *Guardado hace Ns* |

### 2.2 · Guion comercial y copiloto (FASE 3)

| Prototipo | CRM |
|---|---|
| `TOPICS` (14 temas: proceso, volumen, canales, …) | `lib/onboarding/notes/topics.ts` — **portar tal cual** |
| `TRIGGERS` (7 disparadores) | Mismo archivo; inyectar al prompt LLM |
| `analyse()` heurístico | Fallback si falla OpenRouter / sin clave |
| Recálculo ~550 ms | Rebote **4 s** + umbral ≥120 chars + cache por hash + botón “Actualizar preguntas” |
| — | `pages/api/onboarding/projects/[leadId]/notes-copilot.ts` — modelo `resolveModel('heavy')`, `json: true`, contexto vía `buildProposalContextPack` |

### 2.3 · Investigación `@investigar` (FASE 4)

| Prototipo `server.js` | CRM |
|---|---|
| `getPage`, `decode`, `text`, `meta`, `headings`, `signals`, `interestingLinks`, `rulesHooks`, `llmEnrich`, `research` | `lib/onboarding/notes/scrape.ts` |
| `POST /api/research` | `pages/api/onboarding/projects/[leadId]/research.ts` |
| `researchToText()` + marcos `┌ │ └` | Misma función en cliente/lib; insertar en el body de la nota |
| Timeout 12 s, máx. 3 subpáginas | Conservar; añadir validación SSRF (no localhost / privadas) |
| Badge `scraping real` / simulado | Equivalente en UI CRM |

### 2.4 · Contexto, diagnóstico, definición (FASE 5)

| Prototipo | CRM |
|---|---|
| `buildContexto()` | Misma estructura de bloques; incluir “AÚN NO PREGUNTADO” |
| `buildDiagnostico()` (semáforo) | Puerto a React |
| “Usar como definición del proyecto” | Escribe `cfg.description` vía `mergeLeadConfig` **con confirmación previa** |
| “Redactar desde mis notas” | LLM heavy (no plantilla del prototipo); apartado *Pendiente de confirmar* |

### 2.5 · Datos y API (FASE 1)

| Concepto | CRM |
|---|---|
| Varias notas por lead | Tabla `project_notes` — `prisma/history/CREATE_PROJECT_NOTES.sql` + `scripts/run-project-notes-sql.mjs` (patrón `run-smart-cards-sql.mjs`) |
| Ficha web por lead | Tabla `project_research` (jsonb) |
| Store | `lib/onboarding/notes/store.ts` con `query()` de `lib/db.ts` |
| CRUD notas | `pages/api/onboarding/projects/[leadId]/notes.ts` + `notes/[noteId].ts` |

---

## 3. Consumidores críticos (no romper)

| Consumidor | Hoy | Después (FASE 6) |
|---|---|---|
| `buildCrmContextSources` (`project-context-ai.ts`) | `getAuditByLeadId` + `buildProposalPayload` → brief | 1) notas 2) research 3) **auditoría solo si no hay notas** 4) Fireflies |
| Enlaces a `/onboarding/audit` | `index.tsx` (`auditResumeUrl`, L67/L347), `configure.tsx` L219, `proyectos/[id].tsx` L225 | Apuntar a `/onboarding/notas?lead=…` |
| `/onboarding/audit` | Página activa | Modo lectura + aviso; código no se borra hasta confirmación usuario |

**Código auditoría a conservar hasta FASE 6 (retirada solo con OK explícito):**
- `lib/onboarding/audit/` (20 archivos, incl. `agent.test.ts`)
- `components/onboarding/audit/` (6)
- `pages/onboarding/audit.tsx`
- `pages/api/onboarding/audit/`
- Tabla `project_audits` — **nunca borrar** (histórico)

---

## 4. Tres trampas del prototipo (obligatorias en FASE 2)

1. **Resaltado verde = capa espejo** (`.note-hl` bajo `.note-text`): misma tipografía/ancho; textarea `overflow: hidden` + altura = `scrollHeight`; `\n` final en la capa solo si el texto acaba en salto.
2. **Menú `@` sin estado de “¿está abierto?” como fuente de verdad:** `atTokenAtCaret()` + regex Unicode con try/catch y fallback ASCII.
3. **Botones de cada pregunta siempre visibles** (no `opacity: 0` hasta hover).

---

## 5. Orden de fases

```
0 ✅ Plan (este doc)
1    Datos + API + store (+ tests mock)
2    Interfaz (CSS exacto + workspace)
3    Copiloto LLM (+ fallback heurístico)
4    Scraping real + research API
5    Contexto / diagnóstico / definición → cfg.description
6    Redirigir entradas + fallback contexto; retirar auditoría solo con OK
```

**Criterio de “hecho” por fase:** `npm run test`, `npm run build`, prueba manual en
`/onboarding/notas?lead=<id>` (desde FASE 2), commit atómico.

---

## 6. Qué deliberadamente no entra (igual que el prototipo)

Sin grabación/transcripción en vivo, sin colaboración multi-usuario, sin adjuntos, sin
tags/buscador, sin export PDF, sin scraper headless de pago (preguntar antes si hace falta).

---

## 7. Checklist de lectura FASE 0

- [x] README del prototipo
- [x] `TOPICS` / `TRIGGERS` / `analyse` / `paintHighlight` / `atTokenAtCaret` / `researchToText`
- [x] `buildContexto` / `buildDiagnostico`
- [x] `server.js`: `getPage`, `decode`, `signals`, `interestingLinks`, `rulesHooks`, `research`
- [x] Inventario CRM: audit lib/components/pages/api + consumidores de contexto + runners SQL
- [x] Puerto 5599 ocupado → prototipo ya disponible localmente

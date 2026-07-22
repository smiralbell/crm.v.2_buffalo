# Mantenimiento (Retención) — Explicado desde cero

> Esta guía asume que **no sabes nada** de Buffalo, ni del CRM, ni de cómo trabajamos.
> Empieza por el principio y explica **qué es el mantenimiento, para qué sirve y de dónde
> sale cada dato** que ves en pantalla. Si lees esto entero, entiendes el módulo completo.

---

## 1. El contexto: ¿qué es Buffalo y qué es "el CRM"?

**Buffalo AI** monta sistemas de automatización con IA para clientes (agentes de voz,
chatbots, dashboards, integraciones a medida…). Cuando vendemos uno de estos sistemas,
normalmente hay dos partes económicas:

- **Setup**: un pago inicial por construir el sistema.
- **Mensualidad** (a.k.a. "mantenimiento" o "cuota"): un pago recurrente por mantenerlo
  vivo, mejorarlo y darle soporte.

El **CRM** (este proyecto, `crm.sergi`) es nuestra herramienta interna para gestionar
todos los clientes y proyectos: leads, contactos, contratos, tareas de desarrollo,
tickets de soporte, KPIs, etc. Es una app web (Next.js + base de datos Postgres).

Dentro del CRM hay varios "engranajes" (módulos numerados). El que nos ocupa es:

- **ENG 4 = Retención = Mantenimiento**. Es el módulo que se encarga de que un cliente
  que ya paga mensualidad **siga contento y no se dé de baja** (que no haya "churn").

> A partir de aquí, cuando decimos **"mantenimiento"**, **"retención"** o **"ENG 4"**,
> hablamos de lo mismo.

---

## 2. ¿Qué problema resuelve el módulo de Mantenimiento?

Un cliente que paga cada mes se pregunta constantemente: *"¿esto me sigue mereciendo la
pena?"*. Si no le demostramos valor, se va.

El módulo de Mantenimiento sirve para **generar cada mes un informe** que:

1. Demuestra al **cliente** el valor que obtiene (KPIs, ROI, mejoras, plan del mes).
2. Da al **equipo Buffalo** una foto interna del riesgo de baja, oportunidades de venta
   adicional (upsell) y cosas que arreglar.

Pero un informe bueno no se puede escribir "a ciegas". Antes hay que **entender el
proyecto a fondo**. Por eso el módulo tiene **tres fases** en orden:

```
FASE 1  ──►  FASE 2  ──►  FASE 3
Auditoría   Contexto     Informe
(entender)  (guardar)    (generar valor)
```

- **Fase 1 · Auditoría**: un asistente de IA + tú investigáis el proyecto (datos del CRM,
  preguntas, y opcionalmente la base de datos del cliente).
- **Fase 2 · Contexto**: todo lo aprendido se **guarda en un documento estructurado**
  revisable por humanos. Es la "fuente de verdad".
- **Fase 3 · Informe**: usando ese contexto, se generan los informes mensuales.

Idea clave (importante): **la auditoría existe para construir y guardar el contexto**.
El informe mensual **solo se genera bien si ese contexto existe**.

---

## 3. ¿Qué proyectos entran en Mantenimiento? (elegibilidad)

No todos los proyectos del CRM aparecen aquí. Un proyecto entra en Retención solo si
cumple **todas** estas condiciones (código en `lib/retencion/eligibility.ts`):

| Condición | Qué significa | De dónde sale |
|-----------|---------------|---------------|
| `es_buffalo = true` | Es un proyecto real construido por Buffalo (no una prueba/demo). | Columna `es_buffalo` de la tabla `proyectos`. |
| `has_mensualidad = true` | El cliente paga una cuota mensual. | Columna `has_mensualidad` de `proyectos`. |
| `status ∈ {development, active, paused}` | Está en marcha (en desarrollo, activo o pausado), no cancelado. | Columna `status` de `proyectos`. |

Si un proyecto no cumple esto, el sistema devuelve un error tipo *"Solo proyectos Buffalo
en marcha con mensualidad entran en Retención"* y no deja configurar nada.

---

## 4. Dónde vive esto en la pantalla

Entras a un proyecto (`/retencion/proyectos/[id]`) y arriba hay pestañas:
**Proyecto · Configurar · Guía de desarrollo · KPIs**.

- **Configurar** (solo admins) es donde está todo el módulo de mantenimiento: las tres
  fases en un carrusel horizontal (pasas de una a otra con el stepper de arriba, con las
  flechas del teclado ← → o arrastrando).

El componente principal es `components/retencion/RetentionConfigureAgent.tsx`.

---

## 5. FASE 1 · Auditoría (entender el proyecto)

Aquí hablas con un **agente de IA** (un chat). Su único trabajo es **entender el proyecto
y construir el contexto**. No escribe el informe todavía.

### 5.1. ¿De dónde saca la información el agente?

El agente combina **tres fuentes**:

#### Fuente A — El propio CRM (automático)

Al empezar, el agente "siembra" (seed) el conocimiento leyendo muchas tablas del CRM.
Esto lo hace el recolector `lib/retencion/knowledge/collect-crm.ts`. Lee, entre otras:

| Dato recogido | Tabla / origen en el CRM |
|---------------|--------------------------|
| Identidad del proyecto (nombre, tipo, estado, fechas) | `proyectos` |
| Cliente (nombre, empresa, email, teléfono) | `leads` + `contacts` |
| Notas y origen del lead | `leads.notas`, `leads.origen_principal` |
| Qué se vendió (voz/chat/dash, addons, idiomas, tier) | `proyectos` (flags) + configuración parseada |
| Configuración detallada del producto | `leads.configuracion` (JSON del configurador) |
| Comercial (setup, mensualidad, plan, split de pagos) | `proyectos` + `contract-summary` |
| Datos técnicos (IDs Retell/Twilio/WhatsApp, webhooks) | `proyectos` (columnas técnicas) |
| Onboarding de desarrollo (alcance, entregables, stack, notas, docs) | `project_dev_onboarding` + `project_dev_onboarding_docs` |
| Tareas de desarrollo (abiertas, prioridad, responsables) | `project_dev_tasks` |
| Soporte / incidencias (tickets abiertos y recientes) | `tickets` |
| Métricas / KPIs recientes | `engranaje5_kpis` |
| Desarrolladores asignados | `crm_user_projects` + `crm_users` |

El recolector también apunta qué fuentes cargó bien y cuáles faltaban
(`sources_ok` / `sources_missing`), para que haya **trazabilidad**.

#### Fuente B — Tú (la entrevista)

Hay cosas que el CRM **no sabe** y que el agente te pregunta en el chat. Sobre todo:

- **Cómo era el proceso ANTES de Buffalo** (a mano): cuánto tiempo costaba, cuánta gente,
  qué herramientas, cuánto dinero. Esto se llama el **baseline manual**.
- Detalles de operativa: SLAs, flujos, qué consideran "éxito", dolores conocidos.

#### Fuente C — La base de datos del cliente (opcional, solo lectura)

Si hace falta ver datos reales (número de llamadas, chats, citas…), puedes **conectar la
base de datos Postgres del cliente**. El agente entonces puede:

- `list_tables`: listar tablas.
- `describe_table`: ver columnas de una tabla.
- `run_select`: hacer consultas **SELECT** (solo lectura, nunca escribe).

> **Seguridad de la conexión** (`lib/retencion/readonly-postgres.ts` +
> `db-url-crypto.ts`):
> - Solo se permiten `SELECT` / `WITH … SELECT`. Cualquier `INSERT/UPDATE/DELETE/DROP/…`
>   está **bloqueado**.
> - Se fuerza `default_transaction_read_only = on` y un `statement_timeout`.
> - La URL de conexión se **cifra** antes de guardarse y nunca se vuelve a mostrar
>   completa (se enmascara: solo ves host y nombre de la BD).
> - Idealmente se usa un usuario de solo lectura del lado del cliente.

Cuando el agente necesita la BD y no está conectada, lo pide y aparece la tarjeta de
"Conectar Postgres".

### 5.2. ¿Cómo "piensa" el agente? (skills y herramientas)

El agente corre sobre un modelo LLM vía **OpenRouter** (por defecto
`anthropic/claude-sonnet-4`, con `openai/gpt-4o-mini` de respaldo). Está definido en
`lib/retencion/retention-agent.ts`.

Tiene un conjunto de **skills** (protocolos) y **tools** (herramientas que puede llamar),
en `lib/retencion/knowledge/skills.ts`. El orden típico es:

```
ingest_crm → roi_baseline (+ interview) → explore_client_db
          → validate_checklist → structure_knowledge → persist_context
```

Herramientas disponibles:

- **Conocimiento CRM**: `load_crm_knowledge`, `seed_knowledge_from_crm`,
  `merge_knowledge_section`, `update_audit_checklist`.
- **Base de datos cliente**: `list_tables`, `describe_table`, `run_select`.
- **Guardar contexto**: `save_knowledge`.

Regla de oro que le imponemos: **no inventa cifras**. Si falta un dato, escribe
"Pendiente: …" y te lo pregunta.

---

## 6. FASE 2 · Contexto (el documento fuente de verdad)

Todo lo que el agente aprende se guarda en un único **documento en markdown** con una
estructura fija de **13 secciones** (plantilla en `lib/retencion/knowledge/template.ts`):

| # | Sección | Qué contiene |
|---|---------|--------------|
| 1 | Identidad y cliente | Quién es, IDs CRM, estado. |
| 2 | Producto contratado | Voz, chat, dash, addons, scope a medida. |
| 3 | Comercial / mensualidad | Setup, cuota mensual, plan, split de pagos. |
| 4 | Stack y accesos técnicos | IDs Retell/Twilio/WhatsApp, webhooks, stack. |
| 5 | Onboarding desarrollo | Alcance, entregables, notas internas, docs. |
| 6 | Tareas y entrega | Timeline, tareas abiertas, responsables. |
| 7 | Soporte e incidencias | Tickets abiertos/recientes, temas recurrentes. |
| 8 | Datos y schema del cliente | Tablas clave en su Postgres, métricas, grano. |
| 9 | Métricas de retención | KPIs de uso reciente (Engranaje5). |
| 10 | Riesgos, SLAs y notas operativas | Qué mide éxito, dolores, alertas. |
| **11** | **Coste manual antes de Buffalo** | **Tiempo, dinero y recursos del proceso a mano.** |
| **12** | **ROI y ahorro con Buffalo** | **Baseline vs coste Buffalo: horas, €/mes, payback, ROI %.** |
| 13 | Fuentes CRM ingeridas | Qué se cargó del CRM y cuándo (trazabilidad). |

Las secciones **11 y 12 son las más importantes** para el valor del cliente, y son
justo las que el CRM no puede rellenar solo: salen de la **entrevista** contigo.

En esta fase puedes:
- **Cargar CRM** / **Sobrescribir CRM**: volver a sembrar desde el CRM.
- **Entrevista ROI**: pedir al agente que active la skill de baseline/ROI.
- **Revisar / editar**: ver y editar el documento a mano.
- **Validar con el agente**: pedirle que revise y marque las tarjetas (ver abajo).

### 6.1. Las 3 tarjetas de validación (checklist)

Debajo hay **tres tarjetas** que indican si el contexto está listo. Lógica en
`lib/retencion/knowledge/checklist.ts`:

| Tarjeta | Pregunta que responde | Se pone verde cuando… |
|---------|-----------------------|------------------------|
| **Base de datos** (`db_access`) | ¿Hay acceso a Postgres y se entienden las columnas clave? | Hay BD conectada + resumen de schema / sección 8 documentada. |
| **ROI / coste manual** (`roi_resolved`) | ¿Tiempo, dinero y recursos resueltos? | Secciones 11 y 12 con cifras o estimaciones claras. |
| **Proyecto entendido** (`project_understood`) | ¿Se entiende producto, flujos y operativa? | El documento es suficientemente rico (producto + operativa/onboarding). |

Cada tarjeta se calcula de **dos formas** que se combinan:
- **Heurística automática**: el sistema mira el contenido del documento y decide.
- **Marca del agente**: si el agente llama `update_audit_checklist`, su marca **manda**
  sobre la heurística.

Cuando **las 3 tarjetas están en verde**, el carrusel te lleva automáticamente a la
Fase 3 (informe).

---

## 7. FASE 3 · Informe mensual (el entregable)

Aquí se generan los informes. Hay **dos tipos**, con **dos prompts distintos**:

### 7.1. Dos destinatarios

| Caja | Para quién | Qué enfatiza | Prompt por defecto |
|------|------------|--------------|--------------------|
| **Informe para Buffalo** | Uso **interno** | Mejoras, señales de churn, upsell, deuda técnica, acciones del equipo, "qué NO decirle al cliente". | `DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO` |
| **Informe para el cliente** | El **cliente** | Valor, KPIs, ROI, plan del mes, en lenguaje de cara al cliente. | `DEFAULT_RETENCION_REPORT_PROMPT` (client) |

Ambos prompts viven en `lib/retencion/report-prompt.ts`.

Cada caja tiene:
- **Generar informe**: crea el informe para ese destinatario y periodo.
- **Ver / editar prompt** (icono de ojo): abre un popup donde puedes **leer y editar** el
  prompt maestro. Por defecto el prompt **no se ve**: solo aparece si lo abres. Si lo
  editas y guardas, se usa tu versión a partir de entonces.

Arriba eliges el **periodo** (mes / año) del informe.

### 7.2. ¿De dónde saca los datos el informe?

El generador (`generateMonthlyReport` en `retention-agent.ts`) le pasa al modelo:

1. El **prompt maestro** del destinatario elegido (Buffalo o cliente).
2. El **contexto de auditoría** guardado (fase 2) — la fuente de verdad.
3. El **schema summary** y, si hay BD conectada, un **muestreo en vivo** (lista de tablas
   + hasta 5 filas de ejemplo de algunas tablas, todo por SELECT de solo lectura).
4. Los **datos CRM** del proyecto.
5. El **informe del mes anterior** (mismo destinatario), si existe, para generar una
   **comparativa de deltas** (qué mejoró/empeoró).

El modelo devuelve un JSON con: `title`, `content` (el markdown del informe),
`highlights`, `risks`, `actions` y un `roi_snapshot`.

### 7.3. Qué puedes hacer con un informe generado

- **Verlo** renderizado (markdown bonito).
- **Editarlo** a mano (título + contenido) y guardar.
- **Exportarlo a PDF**.
- **Histórico**: una tira de "chips" con los informes anteriores (con etiqueta Buffalo o
  Cliente y su periodo). Al hacer clic, se abre ese informe. **No se abre ninguno
  automáticamente**: si no clicas, ves un estado vacío ("Ningún informe abierto").

---

## 8. Dónde se guarda todo (base de datos del CRM)

El módulo usa dos tablas propias (SQL en `prisma/CREATE_RETENCION_AGENT.sql`):

### `retencion_agent_configs` (una fila por proyecto)
Guarda la configuración y el contexto de la auditoría:

| Columna | Para qué |
|---------|----------|
| `proyecto_id` | A qué proyecto pertenece. |
| `client_db_url_enc` / `client_db_host` / `client_db_name` | Conexión Postgres del cliente (URL **cifrada** + host/nombre enmascarados). |
| `audit_status` | En qué punto va la auditoría (`pending`, `discovery`, `db_needed`, `schema_audit`, `ready`). |
| `audit_knowledge` | **El documento de contexto** (las 13 secciones). |
| `audit_messages` | El historial del chat de auditoría. |
| `schema_summary` | Resumen del schema de la BD del cliente. |
| `report_prompt` | Prompt maestro del informe **para el cliente**. |
| `report_prompt_buffalo` | Prompt maestro del informe **interno Buffalo**. |
| `audit_checklist` | Estado de las 3 tarjetas de validación. |

### `retencion_monthly_reports` (una fila por informe)
Guarda cada informe generado:

| Columna | Para qué |
|---------|----------|
| `proyecto_id`, `year`, `month` | Proyecto y periodo. |
| `audience` | `client` o `buffalo` (destinatario). |
| `title`, `content` | Título y markdown del informe. |
| `meta` | Extras (highlights, riesgos, acciones, roi_snapshot…). |

La clave única es `(proyecto_id, year, month, audience)`: puede haber **un informe
Buffalo y uno de cliente por mes**, y regenerar sobrescribe el de ese periodo+destinatario.

---

## 9. El flujo completo, de un vistazo

```
1. Entras a un proyecto elegible → pestaña "Configurar".

2. FASE 1 · Auditoría
   - "Empezar auditoría" → el agente siembra el CRM (collect-crm).
   - Respondes a sus preguntas (baseline manual, operativa…).
   - (Opcional) Conectas la BD del cliente para ver datos reales.

3. FASE 2 · Contexto
   - El agente guarda todo en el documento de 13 secciones.
   - Revisas/editas si quieres.
   - "Validar con el agente" → pone en verde las 3 tarjetas.
   - Con las 3 en verde → pasa solo a la Fase 3.

4. FASE 3 · Informe
   - Eliges mes/año.
   - "Generar informe para Buffalo" y/o "para el cliente".
   - (Opcional) "Ver / editar prompt" para ajustar el prompt maestro.
   - Ves / editas / exportas a PDF / consultas el histórico.
```

---

## 10. Glosario rápido

- **Retención / Mantenimiento / ENG 4**: el módulo que evita que los clientes con
  mensualidad se den de baja, generando informes de valor mensuales.
- **Churn**: que un cliente se dé de baja.
- **Upsell**: venderle más al cliente (más módulos, addons…).
- **Baseline manual**: cómo hacía el cliente el trabajo **antes** de Buffalo (a mano) y
  cuánto le costaba (tiempo, dinero, recursos).
- **ROI**: retorno de la inversión = cuánto ahorra/gana el cliente frente a lo que paga.
- **Contexto / documento de contexto**: el markdown de 13 secciones que es la fuente de
  verdad del proyecto.
- **Checklist / tarjetas**: los 3 indicadores (Base de datos, ROI, Proyecto entendido)
  que dicen si el contexto está listo.
- **Seed**: sembrar = rellenar el contexto automáticamente leyendo el CRM.
- **Prompt maestro**: las instrucciones que se le dan al modelo para redactar el informe.
- **OpenRouter**: el servicio a través del cual llamamos al modelo de IA.

---

## 11. Notas de operación (para quien lo instala/mantiene)

- Tras cambiar el esquema hay que ejecutar `prisma/CREATE_RETENCION_AGENT.sql` en el
  Postgres del CRM (crea/actualiza las dos tablas, incluidas las columnas
  `report_prompt_buffalo` y `audience`) y reiniciar el servidor (`npm run dev`).
- Variables de entorno necesarias:
  - `OPENROUTER_API_KEY` (obligatoria para el agente y los informes).
  - `RETENCION_OPENROUTER_MODEL` / `DEMO_OPENROUTER_MODEL` / `OPENROUTER_MODEL`
    (opcionales, para elegir modelo).
  - Clave de cifrado para las URLs de BD del cliente (ver `db-url-crypto.ts`).
- El acceso a "Configurar" es **solo para admins**; los clientes/desarrolladores solo ven
  "Guía de desarrollo" y "KPIs".

---

### Ficheros clave (por si quieres bucear en el código)

| Fichero | Qué hace |
|---------|----------|
| `lib/retencion/eligibility.ts` | Decide qué proyectos entran y arma el contexto CRM básico. |
| `lib/retencion/knowledge/collect-crm.ts` | Recolector: lee todas las tablas del CRM. |
| `lib/retencion/knowledge/template.ts` | Las 13 secciones + checklist de entrevista ROI. |
| `lib/retencion/knowledge/skills.ts` | Skills y herramientas del agente. |
| `lib/retencion/knowledge/checklist.ts` | Lógica de las 3 tarjetas de validación. |
| `lib/retencion/retention-agent.ts` | El agente de auditoría y el generador de informes. |
| `lib/retencion/report-prompt.ts` | Los dos prompts maestros (cliente y Buffalo). |
| `lib/retencion/readonly-postgres.ts` | Conexión de solo lectura a la BD del cliente. |
| `lib/retencion/agent-config-store.ts` | Guardado/lectura de la configuración. |
| `components/retencion/RetentionConfigureAgent.tsx` | Toda la interfaz de las 3 fases. |
| `pages/api/retencion/proyectos/[id]/*` | Endpoints (config, chat, informes). |
| `prisma/CREATE_RETENCION_AGENT.sql` | Crea las tablas en Postgres. |

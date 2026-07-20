# Buffalo CRM — Guía de análisis para agente IA

**Propósito:** Este documento es la fuente de verdad operativa del CRM Buffalo AI. Un agente debe usarlo para (1) entender cada apartado de la UI y su lógica de negocio, (2) conocer cada tabla/columna de la base PostgreSQL, y (3) producir análisis cuantitativos profundos (ingresos, embudos, carga de proyectos, retención, marketing, cold calling, tickets, etc.).

**Repo:** `crm.sergi` / `smiralbell/crm.v.2_buffalo`  
**Stack:** Next.js (Pages Router) + Prisma parcial + SQL crudo (`$queryRaw`) + PostgreSQL  
**Fecha de la guía:** 2026-07-19  

**UI en el CRM:** `/analisis` (sidebar **Análisis IA**, solo admin). Genera informes con OpenRouter usando esta guía + snapshot SQL (`lib/analisis/*`, tabla `crm_company_ai_analyses`).

**Instrucciones al agente analista**
1. Lee primero la sección 0 (modelo de negocio) y la 1 (roles).
2. Para cualquier KPI, localiza la **tabla y columna** en el diccionario (sección 6).
3. Preferir consultas SQL sobre Prisma: muchas columnas/tablas **no están en `schema.prisma`** y solo existen en DB.
4. Excluir soft-deletes (`deleted_at IS NOT NULL`) salvo que se pida histórico.
5. Distinguir siempre: **pipeline Kanban** vs **lead.estado** vs **proyecto.status** vs **coldcall stage** — no son lo mismo.
6. Dinero: documentar moneda EUR, si incluye IVA, y si es setup (one-shot) o mensualidad (MRR).
7. Al analizar, citar tablas/columnas y filtros usados; proponer acciones, no solo números.

---

## 0. Modelo de negocio Buffalo (los “engranajes”)

Buffalo vende proyectos de IA (agentes de voz/chat, dashboards, automatización, lead gen, GEO/SEO). El CRM organiza el recorrido en engranajes visibles en el sidebar admin:

| Badge | Área | Significado |
|-------|------|-------------|
| ENG 1 | Marketing | Captación (web, email Instantly, cold call, ads) |
| ENG 2 | Onboarding | Configurar proyecto del cliente, propuesta/contrato/factura, **poner en marcha** |
| ENG 3 | Proyectos | Ejecución interna (tareas, developers, tickets) solo proyectos Buffalo en marcha |
| ENG 4 | Retención | Clientes con **mensualidad** (`has_mensualidad = true`) + KPIs Engranaje 5 |

**Cadena de verdad (muy importante):**
1. Se crea/elige un **contact** → **lead**.
2. En Onboarding se guarda `leads.configuracion` (JSON base64 del configurador o brief IA).
3. Sync crea/actualiza fila en **`proyectos`** (`es_buffalo = false` al nacer).
4. Admin pulsa **Poner en marcha** → `es_buffalo = true` → aparece en Gestión de proyectos.
5. Al terminar desarrollo → **Finalizar proyecto** → `status = 'active'` (producción) + `fecha_fin_real`.
6. Si hay retainer → Retención / Engranaje 5.

Sin onboarding configurado válido, un proyecto **no** debe contar como Buffalo en marcha.

---

## 1. Roles y acceso

| Rol | Origen | Home | Ve principalmente |
|-----|--------|------|-------------------|
| `admin` | Env `CRM_ADMIN_EMAIL` / `CRM_ADMIN_PASSWORD` (id lógico 0) o `crm_users.role=admin` | `/dashboard` | Todo |
| `developer` | `crm_users` | `/developer` | Proyectos asignados, tickets, retención (guía/KPIs), facturas freelance |
| `comercial` | `crm_users` | `/comercial` | Cold calling, pipeline cold call, reuniones, facturas freelance |

Sesión: cookie `session_id` (HMAC, ~7 días). APIs: `/api/auth/login|logout|me`.

Developers solo ven proyectos en `crm_user_projects` (salvo admin = todos).

---

## 2. Mapa de la aplicación (UI)

### 2.1 Admin — sidebar

| Menú | Ruta | Qué hace |
|------|------|----------|
| Dashboard | `/dashboard` | KPIs globales: leads, pipeline, facturas, ingresos |
| Leads | `/leads` | Listado/CRUD leads + diálogo editar |
| Finanzas ▾ Resumen | `/finances` | Executive summary, banco, gráficos |
| Finanzas ▾ Facturas | `/invoices` | Facturas cliente Buffalo |
| Finanzas ▾ Recurrentes | `/invoices/recurring` | Plantillas mensuales |
| Pipelines | `/pipelines` | Tableros Kanban (WEB, Cold Calling, Global…) |
| Marketing ENG1 | `/marketing?tab=…` | global / web / email / coldcalling / meta / google |
| Onboarding ENG2 ▾ Proyectos activos | `/onboarding?tab=projects` | Leads con configuración |
| Onboarding ▾ Configurador | `/onboarding/configure` | Paquete Buffalo o a medida |
| Onboarding ▾ Demos | `/demos` | Agentes demo WhatsApp/voz |
| Proyectos ENG3 ▾ Abiertos | `/gestion-proyecto` | Solo `es_buffalo` + onboarding válido |
| Proyectos ▾ Tickets | `/tickets` | Inbox tickets de clientes |
| Retención ENG4 | `/retencion` | Proyectos con mensualidad |
| Checklist | `/checklist` | Tareas internas inbox/Santi/Sergi |
| Usuarios | `/usuarios` | Alta developers/comerciales, asignaciones |

### 2.2 Developer — sidebar

Dashboard `/developer` · Proyectos · Tickets · Retención · Facturas freelance `/developer/facturas`.

### 2.3 Comercial — sidebar

Llamar ahora · Inicio · Campañas · Pipeline · Reuniones · Llamar más tarde · Objeciones · Duplicados · Preparar demos · Mis facturas.

---

## 3. Apartados y lógica de negocio (detalle)

### 3.1 Leads y Contacts

**Contacts** (`/contacts*`): ficha fiscal/comercial (nombre, email, empresa, CIF, IBAN, ciudad…).  
**Leads** (`/leads*`): 1:1 con contact. Campos clave: `estado`, `valor`, `prioridad`, `origen_principal`, `configuracion`, `notas`.

**Estados lead (`leads.estado`) — UI tipica:**
`frio` → LEAD · `caliente` → CONTACTO · `reunion` · `propuesta` · `negociando` · `cerrado` · `activo` · `perdido`

**Botones típicos:** Nuevo lead, Editar (popup `EditLeadDialog`), ver detalle, borrar.  
**APIs:** `/api/leads`, `/api/leads/[id]`, `/api/contacts`, `/api/contacts/[id]`.

**Análisis:** embudo por `estado`, valor medio (`valor`), origen, tiempo desde `created_at` / `ultima_interaccion`, % con `configuracion` no vacía.

---

### 3.2 Pipelines (Kanban)

Tablas: `pipelines`, `pipeline_stages`, `pipeline_cards`.

- Card enlaza entidad por `entity_id` (texto) + `entity_type` (`contact`|`client`).
- `stage` es **nombre de columna** (string), no FK.
- `amount` = valor del deal en el kanban.
- Soft-delete: `deleted_at`.

**Pipeline Global** (env `GLOBAL_PIPELINE_ID`): avanza con acciones del configurador (`enviar_propuesta`, `enviar_contrato`, `enviar_factura`, `enviar_onboarding`) vía `/api/onboarding/pipeline-advance`.

**Etapas Buffalo por defecto (nombres):** LEAD → CONTACTO → REUNIÓN → PROPUESTA CREADA → PROPUESTA ENVIADA → CONTRATO ENVIADO → CONTRATO FIRMADO → FACTURA EMITIDA → ONBOARDING → EN DESARROLLO → ACTIVO → REMARKETING.

**Análisis:** conversión entre stages, € por stage (`amount`), tiempo en stage (si se infiere por `updated_at`), tags (`tags[]`, p.ej. coldcall).

---

### 3.3 Marketing (ENG 1)

#### 3.3.1 Métricas globales / ads / email
Tabla `marketing_metrics`: por `channel` + `period` (`YYYY-MM`).  
Canales: `email_outreach`, `meta_ads`, `google_ads`, `organic`.  
Campos: `spend`, emails/replies/meetings, impressions/clicks.

Instantly: webhooks en `instantly_webhooks` (`event_type`, `email`, `campaign_*`, `payload`).

#### 3.3.2 Web
- Formularios: `web_form_submissions` (`payload` JSONB, `estado`: pendiente/contactado/descartado).
- Calendario: `cal_bookings` (Cal.com).
- Chat: sesiones vía APIs agent-chats; sync pipeline en `web_chat_pipeline_sync`.

#### 3.3.3 Cold Calling
Tablas: `coldcall_campaigns`, `coldcall_prospects`, `coldcall_calls`, `coldcall_import_batches`, `coldcall_activities`, `coldcall_prospect_requests`.

**Stages prospect (app):** `nuevo`, `en_cola`, `volver_a_llamar`, `interesado_info_enviada`, `reunion_agendada`, `no_interesado`, `descartado_numero_erroneo`.

**Resultados llamada (`coldcall_calls.resultado`):** `sin_respuesta`, `buzon_voz`, `llamar_tarde`, `interesado`, `reunion_agendada`, `no_interesado`, `otra_persona`, `numero_erroneo`, …

**Botones/flujo:** import CSV → mapping → call station → log call → reunión (Cal/Google) → convertir a lead CRM (`/api/coldcall/convert-to-lead`).

**Análisis:** contact rate, meeting rate, duración media, intentos (`call_attempts`), DNC, rendimiento por `created_by_user_id` / campaña, funnel stages.

---

### 3.4 Onboarding (ENG 2)

**Lista** `/onboarding?tab=projects`: leads con `configuracion` no vacía (`GET /api/leads?configured=1`).

**Botones por fila:**
| Botón | Función |
|-------|---------|
| **Poner en marcha** | `PATCH .../onboarding/projects/{leadId}` `{ es_buffalo: true }` → entra en Gestión |
| **Proyecto Buffalo** | Ya en marcha; click quita (`es_buffalo: false`) |
| Configurador | Abre configurador de producto |
| Lápiz | Edita datos cliente/proyecto (incl. timeline) |
| Ojo | Detalle `/onboarding/proyectos/[id]` |
| Facturas | Atajo invoices |
| Trash | Borra config onboarding; proyecto → `churned`, limpia `lead_id`, `es_buffalo=false` |
| Asignar developers | Vincula `crm_user_projects` |

**Configurador** `/onboarding/configure`:
- Modo **Paquete Buffalo**: iframe configurador (voz/chat/dashboard/addons/precios).
- Modo **A medida**: `/onboarding/custom` — brief + chat IA → genera config → **Guardar y volver a inicio**.

Al guardar config: actualiza `leads.configuracion`, `valor`, `notas`; sync `proyectos` vía `/api/engranaje5/proyectos/sync`.

**Campos timeline (editar datos):**
- `tiempo_previsto` (texto, ej. “4 semanas”)
- `fecha_inicio_real` (DATE; sincroniza también `launched_at`)
- `fecha_fin_real` (DATE; **NULL = aún no acabó**)

**Análisis Onboarding:**
- Leads configurados vs puestos en marcha (`es_buffalo`).
- Tiempo desde config hasta `es_buffalo`.
- Setup total y MRR potenciales (desde `proyectos.setup_fee_eur` / `monthly_fee_eur` o parse de config).
- Proyectos sin fecha inicio / sin tiempo previsto.

---

### 3.5 Proyectos / Gestión (ENG 3)

**Lista** `/gestion-proyecto` — solo filas que cumplen:
```
proyectos.es_buffalo = TRUE
AND status IN ('development','active','paused')
AND lead_id IS NOT NULL
AND leads.configuracion IS NOT NULL AND <> ''
AND lead existe
```

**Tarjeta money (arriba):**
- **Proyectos** = Σ `setup_fee_eur`
- **Mensualidades** = Σ `monthly_fee_eur` (“/mes”)

**Estilo tarjeta:**
- `status = development|paused` → tarjeta normal “Proyecto Buffalo”
- `status = active` → tarjeta **verde** “En producción”

**Detalle** `/gestion-proyecto/proyectos/[id]`:
| Tab | Contenido |
|-----|-----------|
| Dashboard | Métricas tareas, timeline, **Finalizar proyecto**, AI analysis |
| Onboarding | Brief interno + docs |
| Tareas | Board `pending` → `in_progress` → `buffalo_validation` → `done` |

**Finalizar proyecto** `POST /api/gestion-proyecto/proyectos/[id]/finalizar` (admin):
- `status = 'active'`
- `fecha_fin_real = COALESCE(fecha_fin_real, CURRENT_DATE)`

**service_type:** `voice_agent` | `text_agent` | `dashboard_app` | `automation` | `lead_gen` | `geo_seo`  
**status proyecto:** `development` | `active` | `paused` | `churned`

**Asignaciones sueltas:** `developer_assignments` (tareas puntuales a un user, no ligadas a proyecto grande).

**Análisis Proyectos:**
- Pipeline ejecución: en desarrollo vs producción.
- € setup vs MRR de cartera abierta.
- Carga por developer (`crm_user_projects` + `project_dev_tasks.assignee`).
- Aging: días desde `fecha_inicio_real` o `created_at` sin `fecha_fin_real`.
- Throughput tareas / % done / stale (`status_changed_at`, `stale_notice_active`).
- Previsión: `tiempo_previsto` vs duración real.

---

### 3.6 Tickets

Ingest: webhook `/api/webhooks/tickets` (ver `docs/TICKETS_WEBHOOK.md`) → `tickets` + `ticket_updates`.  
Auth por proyecto: `proyectos.webhook_secret`. Callback opcional: `ticket_callback_url` + token.

**status:** `open` | `in_progress` | `resolved` | `closed`  
**priority:** `low` | `medium` | `high` | `critical`  
**assignee_user_id** → `crm_users` (columna SQL; puede no estar en Prisma).

**Análisis:** tickets abiertos por proyecto, SLA (created→resolved), por assignee, por prioridad, volumen vs clientes en producción.

---

### 3.7 Retención (ENG 4)

Lista: `has_mensualidad = true` (+ lead).  
Detalle: resumen contrato (admin), guía developers, KPIs Engranaje 5 (`engranaje5_data` + `engranaje5_kpis`).

**maint_plan:** `connect` (~10%) | `cloud` (~15%) | NULL.

**Análisis:** MRR retainer, churn (`status=churned`), KPIs uso/ROI/NPS, clientes sin datos del mes actual.

---

### 3.8 Finanzas y facturas

#### Facturas cliente (`invoices`, `invoice_source='client'`)
- Numeración típica `BUF-YYYY-#####` (empresa).
- `services` JSONB: `[{description, quantity, price, tax, ...}]`
- Totales: `subtotal`, `iva`, `total`
- `status`: `draft` | `sent` | `cancelled`
- Soft-delete `deleted_at`
- Drive: `pdf_drive_*`, `sent_to_drive`
- Opcional enlace cobro: `bank_transaction_id` → `bank_transactions.id` (**sin FK formal**)

#### Facturas developer (`invoice_source='developer'`, nº `DEV-…`)
Emitidas por comerciales/developers en `/developer/facturas`.

#### Recurrentes
`recurring_invoices`: clona factura fuente cada mes (`issue_day`, `last_generated_period`).

#### Banco
`bank_accounts` → `bank_statements` → `bank_transactions`  
`amount` con signo; flags `is_reconciled`, `is_recurring_income`.

#### Módulo manual
`expenses`, `fixed_expenses`, `salaries`, `financial_incomes`, `financial_settings` (IS % sociedades).

**Conceptos de pago (banco):** ver `lib/finance/payment-concepts.ts` (FAC cliente, DEV developer, etc.).

**Análisis Finanzas:**
- Facturado (invoices sent, no deleted) vs cobrado (bank +/ conciliado).
- IVA repercutido vs soportado.
- MRR: mensualidades proyectos + `is_recurring_income` + recurrent invoices.
- Cashflow por periodo; P&L aproximado gastos+sueldos+fijos.
- Aging facturas draft/sent sin match bancario.

---

### 3.9 Demos

Tablas `demos`, `demo_numeros`, `demo_conversaciones`, `demo_llamadas`, …  
WhatsApp (Wasender) y voz (Retell). Formulario público `/formulario/[token]`.

**Análisis:** demos activas, conversaciones, llamadas, conversión demo→lead (si se trackea en notas/origen).

---

### 3.10 Checklist y usuarios

- `crm_checklist_items`: columnas `inbox` | `santi` | `sergi`.
- `crm_users` + `crm_user_projects` + `developer_assignments`.

---

## 4. Flujos críticos (diagramas mentales)

### 4.1 De lead a producción
```
Contact → Lead → Config (packaged|custom IA)
  → sync proyectos (es_buffalo=false)
  → Poner en marcha (es_buffalo=true) → Gestión
  → Tareas / tickets
  → Finalizar (status=active, fecha_fin_real) → tarjeta verde
  → (opcional) has_mensualidad → Retención
```

### 4.2 Dinero del proyecto
| Concepto | Campo | Naturaleza |
|----------|-------|------------|
| Setup / proyecto | `proyectos.setup_fee_eur` | One-shot |
| Mensualidad | `proyectos.monthly_fee_eur` | Recurrente |
| Valor lead | `leads.valor` | Deal comercial (puede coincidir con setup) |
| Factura | `invoices.total` | Fiscal emitido |
| Cobro banco | `bank_transactions.amount` | Caja real |

No asumir que factura = setup del proyecto sin cruzar cliente/periodo.

---

## 5. Enums y valores canónicos (cheat sheet)

| Dominio | Campo | Valores |
|---------|-------|---------|
| Lead | estado | frio, caliente, reunion, propuesta, negociando, cerrado, activo, perdido |
| Proyecto | status | development, active, paused, churned |
| Proyecto | service_type | voice_agent, text_agent, dashboard_app, automation, lead_gen, geo_seo |
| Proyecto | es_buffalo | true = en Gestión |
| Task dev | status | pending, in_progress, buffalo_validation, done |
| Task dev | priority | low, medium, high |
| Ticket | status | open, in_progress, resolved, closed |
| Ticket | priority | low, medium, high, critical |
| Invoice | status | draft, sent, cancelled |
| Invoice | invoice_source | client, developer |
| Fin. income | status | pending, paid, estimated |
| Coldcall stage | stage | nuevo, en_cola, volver_a_llamar, interesado_info_enviada, reunion_agendada, no_interesado, descartado_numero_erroneo |
| User | role | admin, developer, comercial |

---

## 6. Diccionario de datos (tablas y columnas)

> **Nota Prisma:** Solo una parte está en `prisma/schema.prisma`. Si el análisis falla por “tabla no existe en Prisma”, usar SQL directo.

### 6.1 CRM core

#### `contacts`
| Columna | Tipo | Significado |
|---------|------|-------------|
| id | serial PK | ID contacto |
| nombre | text | Nombre |
| email | text unique | Email |
| instagram_user | text unique | IG |
| telefono | text | Teléfono |
| empresa | text | Empresa |
| direccion_fiscal, ciudad, codigo_postal, pais | text | Dirección |
| cif, dni, iban | text | Datos fiscales/bancarios |
| created_at, updated_at | timestamptz | Auditoría |

#### `leads`
| Columna | Tipo | Significado |
|---------|------|-------------|
| id | serial PK | ID lead |
| contact_id | int unique FK | Contacto |
| estado | text | Temperatura/etapa comercial |
| origen_principal | text | Canal origen |
| prioridad | text | media/alta/… |
| score | int | Scoring |
| ultima_interaccion | timestamp | Último toque |
| pipeline_id, pipeline_stage_id | int | **Legacy** (kanban real es UUID) |
| valor | numeric(10,2) | Valor deal € |
| notas | text | Notas |
| configuracion | text | Config producto (base64/JSON) — **clave onboarding** |
| position | int | Orden |
| created_at, updated_at | timestamp | Auditoría |

#### `messages`
id, contact_id, lead_id, canal, direccion, contenido, timestamp, raw_payload.

#### `tasks` (+ columnas SQL board)
Legacy: lead_id, contact_id, tarea, pendiente, fecha.  
Board: client_id, assignee_id, title, description, project, priority, status, due_date, completed_at…

#### `team_members`
id, name, color, active — assignees del board antiguo.

---

### 6.2 Pipelines

#### `pipelines`
id UUID, name, entity_type (`client`|`contact`), created_at.

#### `pipeline_stages`
id UUID, pipeline_id, name, color, position, created_at.

#### `pipeline_cards`
id UUID, pipeline_id, entity_id, entity_type, stage, stage_color, position, tags[], capture_date, amount, notes, created_at, updated_at, **deleted_at**.

#### `web_chat_pipeline_sync`
session_id PK, contact_id, pipeline_card_id, synced_at.

---

### 6.3 Proyectos / Engranaje / Gestión

#### `proyectos`  ★ tabla central de delivery
| Columna | Tipo | Significado analítico |
|---------|------|----------------------|
| id | uuid PK | ID proyecto |
| client_id | uuid | Cliente lógico |
| name | text | Nombre comercial |
| service_type | text | Tipo servicio |
| status | text | development/active/paused/churned |
| launched_at | date | Lanzamiento (legacy/sync con inicio) |
| tiempo_previsto | text | Duración estimada |
| fecha_inicio_real | date | Inicio real |
| fecha_fin_real | date null | Fin real; null = en curso |
| dev_target_end_date | date | Fin previsto desarrollo (SQL) |
| addon_* | bool | Add-ons contratados |
| dashboard_tier | text | Tier dashboard |
| languages_count | int | Idiomas |
| cost_operator_hour_eur, operators_dedicated, hours_per_week_before | numeric | Inputs ROI |
| **setup_fee_eur** | numeric | € setup |
| **monthly_fee_eur** | numeric | €/mes |
| **has_mensualidad** | bool | Entra en Retención |
| maint_plan | text | connect/cloud/null |
| has_voz, has_chat, has_dash, has_pack | bool | Módulos activos |
| retell_agent_id, twilio_number, whatsapp_number | text | Tech |
| webhook_secret | text | Auth webhooks tickets |
| lead_id | int unique | Puente a lead onboarding |
| contact_id | int | Contacto |
| config_ref | text | Ref tipo BUF-2026-… |
| ticket_callback_url, ticket_callback_token | text | Callback cliente |
| **es_buffalo** | bool | Visible en Gestión si true |
| created_at, updated_at | timestamptz | Auditoría |

#### `engranaje5_data`
Métricas mensuales por proyecto (interacciones, voz, chat, dashboard, costes, NPS…). UNIQUE(project_id, year, month).

#### `engranaje5_kpis`
KPIs calculados: kpi_key, kpi_category (`roi|uso|calidad|coste|disponibilidad|satisfaccion|riesgo`), kpi_value, trends, visibility flags.

#### `project_dev_onboarding`
Brief 1:1: summary, client_context, scope_text, stack_text, deliverables, contacts, internal_notes.

#### `project_dev_onboarding_docs`
Docs link/file del brief.

#### `project_dev_tasks`
Tareas internas: status, priority, assignee, estimated_hours, position, status_changed_at, stale_*.

#### `project_dev_task_attachments`
Ficheros de tarea.

#### `developer_assignments`
Asignaciones puntuales a `crm_users` (title, summary, status, due_date).

#### `crm_user_projects`
M2M user_id ↔ project_id (acceso developer).

---

### 6.4 Tickets

#### `tickets`
id, project_id, title, description, priority, status, reporter_*, source, external_id, payload, custom_fields, **assignee_user_id**, created_at, updated_at.

#### `ticket_updates`
Hilo: author_name, message, status, is_from_client, created_at.

#### `ticket_field_discoveries`
Campos custom descubiertos por proyecto.

---

### 6.5 Finanzas

#### `invoices`
invoice_number, client_*, company_*, issue_date, due_date, services JSONB, subtotal, iva, total, status, drive fields, bank_transaction_id, crm_user_id, invoice_source, developer_pdf_path, deleted_at, timestamps.

#### `recurring_invoices`
Plantilla mensual: source_invoice_id, issue_day, due_day, is_active, last_generated_*.

#### `fixed_expenses` / `expenses` / `salaries` / `financial_incomes` / `financial_settings`
Costes e ingresos manuales + % IS.

#### `bank_accounts` / `bank_statements` / `bank_transactions` / `bank_connections`
Caja real y sync Enable Banking.

#### `finance_ai_analyses`
Resúmenes IA guardados.

#### `drive_carpetas_facturas`
Caché carpetas Drive por periodo.

---

### 6.6 Cold calling

#### `coldcall_campaigns`
name, status (active/paused/archived), assigned_to_user_id, scripts, mapping, presentation_url.

#### `coldcall_prospects`
Perfil + campaign_id, stage, call_attempts, next_retry_at, do_not_call, assigned_user_id, apollo_*, lost_reason, soft-delete.

#### `coldcall_calls`
fecha, duracion, resultado, notas, flags WA/email, reunion_*, demo_prep_*, created_by_user_id.

#### `coldcall_import_batches` / `coldcall_activities` / `coldcall_prospect_requests`
Import stats, feed, peticiones de BBDD.

---

### 6.7 Marketing / web / demos / auth

#### `marketing_metrics`, `instantly_webhooks`, `cal_bookings`, `web_form_submissions`
Captación digital.

#### `demos` + `demo_numeros` + `demo_conversaciones` + `demo_llamadas` + logs
Demos comerciales.

#### `crm_users`
name, email, password_hash, role, active, coldcall_* persona/objeciones.

#### `crm_checklist_items`
Checklist interno.

---

## 7. Relaciones (mapa)

```
contacts 1──1 leads
leads 0..1──1 proyectos (lead_id)
contacts 0..*── proyectos (contact_id)
proyectos 1──* tickets ──* ticket_updates
proyectos 1──* project_dev_tasks
proyectos 1──1 project_dev_onboarding
proyectos 1──* engranaje5_data / engranaje5_kpis
crm_users *──* proyectos (crm_user_projects)
crm_users 1──* tickets.assignee_user_id
crm_users 1──* invoices (developer)
crm_users 1──* coldcall_calls / campaigns
coldcall_campaigns 1──* coldcall_prospects 1──* coldcall_calls
pipelines 1──* pipeline_cards
bank_accounts 1──* bank_transactions
invoices ··· bank_transactions (bank_transaction_id, sin FK)
```

---

## 8. Recetas de análisis (el agente debe ejecutar estas y más)

### 8.1 Salud comercial
1. Embudo leads por `estado` + € `valor`.
2. % leads con `configuracion` vs sin ella.
3. Conversión lead configurado → `es_buffalo` → `status=active`.
4. Tiempo medio (días) entre hitos: lead.created → config → es_buffalo → fecha_fin_real.
5. Pipeline Kanban Global: distribución `amount` por `stage` (excluir deleted).

### 8.2 Cartera de proyectos (ENG 3)
```sql
-- Cartera abierta Buffalo (misma lógica que la UI)
SELECT p.status,
       COUNT(*) AS n,
       COALESCE(SUM(p.setup_fee_eur),0) AS setup_eur,
       COALESCE(SUM(p.monthly_fee_eur),0) AS mrr_eur
FROM proyectos p
JOIN leads l ON l.id = p.lead_id
WHERE p.es_buffalo = TRUE
  AND p.status IN ('development','active','paused')
  AND l.configuracion IS NOT NULL AND l.configuracion <> ''
GROUP BY 1;
```
- Proyectos en curso sin `fecha_inicio_real` o sin `tiempo_previsto`.
- Overdue: con `dev_target_end_date` < today y status=development.
- Carga: tareas abiertas por assignee / por developer asignado.

### 8.3 Retención / MRR
- Σ `monthly_fee_eur` where `has_mensualidad` and status in (active, development, paused).
- Churn: pass a `churned` en ventana.
- Engranaje5: cobertura de meses con datos; KPIs estrella (`is_star_kpi`).

### 8.4 Finanzas
- Facturado mes: invoices `status='sent'`, `deleted_at IS NULL`, por `issue_date`.
- Cobrado mes: bank_transactions amount>0 por `date`.
- Gap facturado vs cobrado; drafts viejos.
- Gastos + salaries + fixed_expenses del periodo.
- Conciliación: invoices con/sin `bank_transaction_id`.

### 8.5 Marketing & cold call
- CAC aproximado: spend (`marketing_metrics`) / meetings o leads.
- Instantly: replies / meetings_booked.
- Cold call: dials, contact rate, meeting rate por user y campaña; callbacks pendientes (`llamar_tarde` / stage volver_a_llamar).

### 8.6 Delivery quality
- Tickets abiertos por proyecto en producción.
- % tareas en `buffalo_validation` (cuello de botella Buffalo).
- Stale tasks (`stale_notice_active`).

### 8.7 Equipo
- Developers: nº proyectos (`crm_user_projects`), horas estimadas abiertas, tickets assigned.
- Comerciales: llamadas, reuniones, conversiones a lead.

---

## 9. Botones → efecto en datos (índice rápido)

| UI | Efecto DB |
|----|-----------|
| Onboarding → Poner en marcha | `proyectos.es_buffalo=true` (+ sync si hace falta) |
| Onboarding → Quitar Buffalo | `es_buffalo=false` |
| Onboarding → Eliminar proyecto | lead.configuracion=null; proyecto churned; lead_id null; es_buffalo=false |
| Editar datos → fechas/tiempo | `tiempo_previsto`, `fecha_inicio_real`, `fecha_fin_real`, `launched_at` |
| Gestión → Finalizar proyecto | `status='active'`, `fecha_fin_real` |
| Configurador guardar | `leads.configuracion`, valor/notas; upsert `proyectos` |
| Sync Engranaje | INSERT/UPDATE `proyectos` desde config (**es_buffalo permanece false en insert**) |
| Asignar developer | INSERT `crm_user_projects` |
| Nueva tarea proyecto | INSERT `project_dev_tasks` |
| Ticket webhook | INSERT `tickets` (+ discoveries/updates) |
| Emitir factura | INSERT `invoices` |
| Sync banco | UPSERT `bank_transactions` |
| Log llamada coldcall | INSERT `coldcall_calls`; update prospect stage/attempts |

---

## 10. Reglas anti-error para el agente

1. **No cuentes como “proyecto Buffalo”** filas con `es_buffalo=false` o sin lead/config.
2. **`active` ≠ churned**: active = en producción; churned = muerto.
3. **`fecha_fin_real` null** no es error: significa en curso (salvo que status=active y se espere fecha).
4. **Lead.estado** no actualiza solo el kanban; pueden divergir — reportar ambas vistas.
5. **Prisma incompleto**: si `prisma.X` falla, cambiar a SQL.
6. **Soft deletes**: invoices, expenses, pipeline_cards, prospects — filtrar `deleted_at IS NULL`.
7. **IVA:** `invoices.total` incluye IVA; `setup_fee_eur` suele ser sin IVA (configurador). Explicitar supuestos.
8. **Admin env** no está en `crm_users`; métricas “por usuario” de admin pueden quedar en null `created_by_user_id`.
9. No inventar columnas; si falta dato, decir “no modelado / no capturado”.
10. Separar siempre **pipeline comercial** vs **ejecución de proyecto** vs **caja bancaria**.

---

## 11. Prompt sugerido para lanzar el análisis

> Usa `docs/CRM_GUIA_ANALISIS_IA.md` como única ontología del CRM Buffalo.  
> Conéctate a PostgreSQL y genera un informe ejecutivo con:  
> (A) Embudo comercial y pipeline,  
> (B) Cartera de proyectos (setup + MRR, desarrollo vs producción, aging),  
> (C) Retención y churn,  
> (D) Finanzas (facturado / cobrado / gastos / gap),  
> (E) Marketing + cold call ROI,  
> (F) Operaciones (tareas, tickets, carga equipo),  
> (G) Alertas y oportunidades top 10 con SQL reproducible.  
> Cada KPI debe citar tabla.columna y filtros. Marca huecos de dato.

---

## 12. Archivos ancla en el código

| Tema | Ruta |
|------|------|
| Nav / roles UI | `components/Sidebar.tsx`, `lib/auth-rbac.ts` |
| Sync proyecto | `lib/engranaje5/sync-proyecto.ts` |
| Lista gestión + money | `pages/api/gestion-proyecto/proyectos.ts` |
| Poner en marcha | `pages/api/onboarding/projects/[leadId].ts` |
| Finalizar | `pages/api/gestion-proyecto/proyectos/[id]/finalizar.ts` |
| Schema Prisma (parcial) | `prisma/schema.prisma` |
| SQL migraciones | `prisma/*.sql`, `prisma/history/*.sql` |
| Tickets webhook | `docs/TICKETS_WEBHOOK.md` |
| Conceptos banco | `lib/finance/payment-concepts.ts` |

---

*Fin de la guía. Mantener este documento alineado cuando se añadan tablas, estados o engranajes nuevos.*

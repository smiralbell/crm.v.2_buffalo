# Retención (ENG 4) — auditoría, contexto e informe mensual

## Quién aparece en la lista

Solo proyectos con:

- `es_buffalo = true` (puestos en marcha)
- `has_mensualidad = true`
- `status IN ('development','active','paused')`
- `lead_id` no nulo

## Modelo mental (3 fases)

```
1. Auditoría (chat + skills CRM + Postgres SELECT opcional)
        ↓
2. CONTEXTO DEL PROYECTO (guardado, revisable/editable)
        ↓
3. Agente informe mensual (prompt editable + contexto + Postgres)
        ↓
   Informe markdown en retencion_monthly_reports
```

### Por qué existe la auditoría

Para **construir y guardar el contexto del proyecto**: documento que el equipo revisa cuando hay fallos. El chat no es la fuente de verdad; lo es `audit_knowledge`.

### Sistema de conocimiento CRM

Al iniciar la auditoría (o con «Cargar CRM»), el sistema recoge:

| Fuente | Contenido |
|--------|-----------|
| `proyectos` + addons / tech IDs | Identidad, timeline, flags |
| `leads.configuracion` (parseada) | Producto contratado, scope custom, notas |
| `contacts` | Cliente |
| `project_dev_onboarding` (+ docs) | Brief de desarrollo |
| `project_dev_tasks` | Tareas y entrega |
| `tickets` | Soporte |
| `engranaje5_kpis` | Métricas si existen |
| `crm_user_projects` | Developers asignados |

Eso se estructura en **13 secciones** fijas (`lib/retencion/knowledge/template.ts`), incluidas:

- **11. Coste manual antes de Buffalo** — tiempo, dinero, personas, PCs, herramientas
- **12. ROI y ahorro con Buffalo** — comparación vs mensualidad, payback, ROI %

### Skills del agente

| Skill | Tools |
|-------|--------|
| Ingestar CRM | `load_crm_knowledge`, `seed_knowledge_from_crm` |
| Baseline / ROI | entrevista + `merge_knowledge_section` (`baseline_manual`, `roi_ahorro`) |
| Estructurar | `merge_knowledge_section`, `save_knowledge` |
| Explorar DB cliente | `list_tables`, `describe_table`, `run_select` |
| Entrevista operativa | preguntas + merge |
| Persistencia | `save_knowledge` / merge |

Código: `lib/retencion/knowledge/*` + `lib/retencion/retention-agent.ts`.

### Tarjetas de validación (panel Contexto)

Tres tarjetas en verde cuando está OK:

1. **Base de datos** — Postgres conectado + schema/columnas documentadas  
2. **ROI / coste manual** — secciones 11–12 con tiempo, dinero, recursos y cálculo  
3. **Proyecto entendido** — producto/flujos/operativa útiles  

Se actualizan por heurística del contenido o con `update_audit_checklist` (agente). Botón «Pedir validación al agente».

Migración: re-ejecuta `prisma/CREATE_RETENCION_AGENT.sql` (añade `audit_checklist JSONB`).

### Informe mensual

Solo con contexto guardado. Usa:

1. Prompt base editable por proyecto (default curado: KPIs, ROI, fricciones, plan)
2. Contexto (`audit_knowledge`)
3. Postgres SELECT si está conectado

Tras generar: **Editar informe** + guardar (PATCH). En el prompt: **Restaurar default**.

## SQL a ejecutar

```bash
psql $DATABASE_URL -f prisma/CREATE_RETENCION_AGENT.sql
```

## APIs

| Ruta | Uso |
|------|-----|
| `GET/PATCH .../agent-config` | Config, DB URL, prompt, contexto. `start_audit` y `refresh_crm_knowledge` siembran CRM |
| `POST .../agent-chat` | Turno auditoría (tools CRM + Postgres) |
| `GET/POST/PATCH .../monthly-report` | Listar / generar / editar contenido guardado |

## Seguridad DB cliente

- Solo SELECT/WITH + txn read-only + timeout
- URL cifrada; al cliente solo host/dbname

# Retención · Calidad de los agentes

Pestaña **Sistema** de cada proyecto de retención. En la barra de flujos, antes de «Informe del sistema» y de los flujos propios, hay dos fijos:

| Flujo | Qué hace |
|---|---|
| **Cerebro** | Una araña recorre CRM, repositorio, MCP y Retell y construye el mapa del sistema |
| **Pruebas de cambios** | Convierte cada mejora en una norma que espera aprobación |

Los siguientes (conversaciones reales y mejoras) usarán el mismo cerebro.

La primera vez sale un tutorial que guía paso a paso: fuentes → rastreo → cerebro listo → flujo de cambios. Se puede volver a abrir con **Tutorial**.

## Cerebro

Fases y peso en el progreso: CRM 10 %, repositorio 35 %, MCP 20 %, Retell 10 %, IA 25 %. Una fuente que falta se salta y no bloquea el resto.

- **Repositorio:** URL de GitHub (con `GITHUB_TOKEN` si es privado) o carpeta local (solo con el CRM en local o `QA_LOCAL_REPOS=1`). Por defecto usa el `repo_url` de Gestión de proyecto. Se leen primero CLAUDE.md, README, `docs/` y archivos de prompts y agentes, hasta unos 300.000 caracteres.
- **MCP:** los conectores conectados de la pestaña MCP. Lista sus herramientas y llama a las de resumen, estado y agentes que no piden argumentos.
- **Retell:** opcional, con la clave de API del proyecto (cifrada). Lee agentes, prompts, herramientas y voces.
- **IA:** `QA_BRAIN_MODEL` o `OPENROUTER_MODEL_HEAVY`. Devuelve entradas (cliente, sistema, modo), agentes, herramientas con efecto real, modelos, voces, integraciones, conocimiento, huecos y normas propuestas.

El rastreo corre en segundo plano y guarda el progreso. Si no avanza en 10 minutos (reinicio del servidor), se marca como interrumpido.

Las normas propuestas por el cerebro van a la bandeja del flujo de cambios.

## Pruebas de cambios (flujo 1)

Tres entradas, combinables:

- **Manual:** se escribe la mejora y la IA la convierte en propuesta.
- **Tickets:** el planificador de retención (cada minuto) analiza los tickets nuevos del proyecto desde que se activó.
- **Repositorio:** cada cierto tiempo compara los commits nuevos. La primera vez solo toma la referencia.

Cada propuesta dice si es una norma nueva, modifica otra, ya existe o no es una norma, y con cuál choca. Al aprobar, la norma se registra con un código (`PREICO-001`…); si modifica otra, la anterior queda sustituida. Las pruebas de cada norma son la siguiente fase.

## Código

- `lib/retencion/qa/`: tipos, tablas (`store.ts`), araña (`spider.ts`), lector de repositorios, flujo 1 y formato de las respuestas de la IA.
- `pages/api/retencion/proyectos/[id]/cerebro.ts` y `flujo-cambios.ts`.
- `components/retencion/qa/`: `QaWorkspace` (lo monta `SistemaWorkspace`), mapas, hojas y tutorial.
- Tablas: `prisma/CREATE_RETENCION_QA.sql` (también se crean solas).
- Tests: `lib/retencion/qa/qa.test.ts`.

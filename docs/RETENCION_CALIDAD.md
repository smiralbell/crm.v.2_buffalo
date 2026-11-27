# Retención · Calidad de los agentes

Pestaña **Sistema** de cada proyecto de retención. En la barra de flujos, antes de «Informe del sistema» y de los flujos propios, hay cuatro fijos:

| Flujo | Qué hace | Cuándo se ejecuta |
|---|---|---|
| **Cerebro** | Una araña lee CRM, repositorio y MCP enteros y construye el mapa del sistema | A mano (se puede parar) |
| **Pruebas de cambios** | Convierte cada mejora hecha en una norma que espera aprobación | Al instante (manual), al pasar una tarea a Hecha, o cada cierto tiempo (repositorio) |
| **Conversaciones reales** | Revisa las conversaciones y llamadas reales contra las normas | A mano, cada día, cada semana o cada mes |
| **Mejoras** | Busca dónde se pierden leads y propone mejoras para superar las expectativas del cliente | A mano, cada día, cada semana o cada mes |

Los tres últimos terminan en un nodo **WhatsApp**, donde se activan y se eligen los móviles (con prefijo de país). Sale desde el número de WhatsApp del CRM (Evolution API, el mismo que el agente y los flujos de Sistema).

La primera vez sale un tutorial que guía paso a paso: fuentes → rastreo → cerebro listo → flujo de cambios. Se puede volver a abrir con **Tutorial**.

## Cerebro

Fases y peso en el progreso: CRM 5 %, repositorio 30 %, MCP 15 %, IA 50 %. Una fuente que falta se salta y no bloquea el resto.

- **Repositorio:** con `GITHUB_TOKEN` sale un desplegable con los repositorios y sus ramas. El token es uno para todo el CRM, de la cuenta de GitHub (Settings → Developer settings → Fine-grained tokens), con acceso a todos los repositorios y permiso **Contents: Read-only**. Va en las variables de Dokploy. Sin token se escribe `org/repo`, o una carpeta local con el CRM en local (o `QA_LOCAL_REPOS=1`). Por defecto usa el `repo_url` de Gestión de proyecto. Se lee todo lo útil (documentación, prompts, agentes, rutas y código), sin tests, dependencias ni binarios, hasta 2,5 millones de caracteres y 120.000 por archivo.
- **MCP:** los conectores conectados de la pestaña MCP. Lista sus herramientas, llama a las que describen el sistema sin argumentos (resumen, agentes, documentación) y después a las de detalle con los identificadores que devolvieron (por ejemplo el prompt de cada agente de voz). Nunca llama a herramientas de leads, conversaciones, llamadas o clientes.
- **Voz:** no hace falta la clave de Retell. El prompt de voz se lee del repositorio o del MCP del proyecto, si lo expone.
- **Parar:** el botón «Parar» (arriba, en la Araña o en el tutorial) detiene el rastreo en segundos. El cerebro anterior se queda como estaba.

### Cómo lee la IA sin perder información

1. **Extraer:** las fuentes se parten en trozos de 140.000 caracteres y cada trozo se lee entero. De cada uno salen los hechos con su detalle completo: condiciones, excepciones, horarios, límites, destinatarios y textos fijos.
2. **Juntar:** los hechos se fusionan sin IA. Lo repetido se une y el detalle se suma, sin recortarlo. La IA solo escribe el resumen, la identidad, los objetivos y los huecos, y consolida las normas. Si no consolida, se quedan todas las candidatas.
3. **Guardar:** el cerebro guarda el detalle completo de cada entrada, agente, herramienta, flujo, modelo, integración, modo y conocimiento. También guarda los hechos sin fusionar (`facts`) y el texto de todo lo leído (`retencion_qa_docs`, solo la última versión) para los siguientes flujos.

En pantalla sale primero el resumen. Debajo, «Todo el sistema» despliega cada apartado y cada elemento con su detalle y sus fuentes, y «Lo leído» lista los documentos guardados.

### Modelo y coste

- Por defecto, `anthropic/claude-haiku-5.5`: barato, bueno en español y con contexto largo. Se cambia con `QA_BRAIN_MODEL` (también lo usan el flujo de cambios y los informes).
- Antes de lanzar, la Araña muestra el **coste estimado**: tamaño de lo que se leerá, número de trozos y precio del modelo según OpenRouter. Al terminar guarda el **coste real**, que devuelve OpenRouter, junto con los tokens y las llamadas. Los informes también guardan su coste real.
- Referencia con Haiku 5.5: PREICO entero (157 archivos, 1,9 M caracteres, 14 trozos) ≈ 0,10 $; Vicente ≈ 0,03 $.

El rastreo corre en segundo plano y guarda el progreso. Si no avanza en 10 minutos (reinicio del servidor), se marca como interrumpido. Un trozo que falla dos veces se salta y queda anotado en los huecos del cerebro.

Las normas propuestas por el cerebro van a la bandeja del flujo de cambios.

## Pruebas de cambios

Tres entradas, combinables, cada una con su disparador:

| Entrada | Disparador |
|---|---|
| **Manual** | Al enviar la mejora escrita |
| **Tareas** | Cuando una tarea del proyecto pasa a **Hecha** (el planificador lo mira cada minuto). Se leen título, descripción y subtareas. Las tareas hechas antes de activarlo no cuentan |
| **Repositorio** | Cada hora, 6 h, 12 h, día o semana: compara los commits nuevos. La primera vez solo toma la referencia |

Cada propuesta dice si es una norma nueva, modifica otra, ya existe o no es una norma, y con cuál choca. Al aprobar, la norma se registra con un código (`PREICO-001`…); si modifica otra, la anterior queda sustituida. Las pruebas de cada norma son la siguiente fase.

**WhatsApp:** cuando entra en la bandeja algo que revisar (norma nueva, modificación o choque), llega un aviso con la lista y el enlace al proyecto. Lo que no es norma o ya existe no avisa.

## Informes: conversaciones reales y mejoras

Mapa: Disparador → MCP → Normas y cerebro → IA → Informe → WhatsApp.

- **Disparador:** solo a mano, cada día, cada semana o cada mes. Cada informe mira desde el anterior; el primero, el último periodo.
- **MCP:** imprescindible, porque las conversaciones se leen por él (solo lectura).
- **IA:** recibe el cerebro, los objetivos del cliente y las normas activas. Lista las conversaciones y llamadas del periodo, lee enteras hasta 40 (primero las que acabaron mal o no llegaron al objetivo) y escribe el informe. Nunca pone nombres, teléfonos, correos ni DNI: cita cada conversación por su id y su fecha. Tiene un tope de lectura por ejecución; lo que queda fuera se apunta en «Límites».
- **Conversaciones reales:** incumplimientos por norma y gravedad, casos dudosos, lo que funciona, métricas (revisadas, con incumplimientos, nota media de calidad) y límites.
- **Mejoras:** propuestas con impacto y esfuerzo, apoyadas en conversaciones reales. Las que son reglas de comportamiento entran en la bandeja del flujo de cambios (origen «Mejoras»).
- **WhatsApp:** al terminar, el PDF del informe con el estilo de Buffalo y el resumen y las métricas en el mensaje.

## Parar y seguir ejecuciones

Todos los flujos de Sistema se pueden parar con el botón **Parar** mientras corren: Cerebro, informes de calidad, Informe del sistema y flujos propios.

- Corren **en segundo plano** y la pantalla los sigue consultando su estado. El CRM va detrás de Cloudflare, que corta a los 100 s cualquier petición sin respuesta y devuelve una página HTML. Por eso ninguna ejecución espera dentro de la petición.
- La parada se marca en memoria (`lib/retencion/run-control.ts`). La ejecución la comprueba entre pasos y corta la espera de la IA o del MCP en cuanto se pide parar.
- Si la ejecución ya no corre en el proceso (el servidor se reinició), «Parar» la cierra directamente en la base.
- Un informe de calidad que lleva 5 minutos sin dar señales se cierra solo como interrumpido. El rastreo del cerebro, a los 10 minutos.

## Código

- `lib/retencion/qa/`: tipos, tablas (`store.ts`), araña, parada y estimación (`spider.ts`), IA con coste y herramientas (`llm.ts`), lector de repositorios y GitHub, flujo de cambios (`flow1.ts`), informes (`reports.ts`), WhatsApp (`notify.ts`), y prompts, troceado y fusión (`brain-format.ts`).
- API: `pages/api/retencion/proyectos/[id]/cerebro.ts`, `flujo-cambios.ts`, `calidad-informes.ts` y `pages/api/retencion/github.ts` (repositorios y ramas).
- `components/retencion/qa/`: `QaWorkspace` (lo monta `SistemaWorkspace`), mapas (`BrainPanel`, `Flow1Panel`, `ReportPanel`), editor de WhatsApp y tutorial.
- Planificador: `lib/retencion/watch-scheduler.ts` llama cada minuto a `runDueQa` (tareas, repositorio e informes).
- Tablas: `prisma/CREATE_RETENCION_QA.sql` (también se crean solas).
- Tests: `lib/retencion/qa/qa.test.ts`.

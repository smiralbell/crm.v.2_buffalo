# Onboarding developers — Buffalo CRM

Guía operativa para el rol **Developer** en el CRM Buffalo.  
Documento vivo: refleja el panel real (`/developer`, proyectos, tickets, retención y facturas).

---

## 1. Bienvenida: qué es este panel

El CRM Buffalo no es solo ventas: también es el **tablero de trabajo técnico** de Agencia Buffalo.

Como developer no verás finanzas de clientes, leads comerciales ni marketing. Verás **solo lo que te toca entregar**:

- Proyectos Buffalo (y tareas puntuales) que te asignemos  
- Tickets de soporte / incidencias asignados a ti  
- Retención: guía técnica + KPIs (sin precios)  
- Tus facturas a Agencia Buffalo  

**Regla de oro:** los **precios, mensualidades y datos comerciales del cliente son confidenciales**. El sistema los oculta a propósito. Si aparece algo que parezca dinero de cliente, avísanos.

---

## 2. Acceso: qué te damos nosotros

### Cuenta

1. Un admin crea tu usuario en **Usuarios** con rol **Developer**.  
2. Te pasamos **email + contraseña** (credenciales de acceso).  
3. Entras en la URL del CRM → `/login`.  
4. Usas **email y contraseña** (no el botón de Google: eso es solo admin).  
5. Tras el login caes en tu home: **`/developer`**.

### Qué te asignamos después

| Nosotros (Buffalo) | Tú recibes |
|--------------------|------------|
| Te vinculamos a uno o más **proyectos Buffalo** | Aparecen en **Proyectos** |
| Opcionalmente creamos **asignaciones puntuales** (tareas sin proyecto grande) | También en **Proyectos**, como “Tarea puntual” |
| Te asignamos **tickets** | Solo ves los tuyos |
| Si el proyecto tiene retención activa | Aparece en **Retención** |
| Documentación / brief técnico en Onboarding del proyecto | Lo lees en la pestaña **Onboarding** |

Sin asignación explícita, el panel estará vacío: es normal hasta que te metamos en un proyecto.

---

## 3. Mapa del menú (solo lo tuyo)

| Menú | Ruta | Para qué sirve |
|------|------|----------------|
| **Dashboard** | `/developer` | Resumen del día: proyectos, tareas, tickets, horas, facturación |
| **Proyectos → Proyectos abiertos** | `/gestion-proyecto` | Lista de proyectos y asignaciones |
| **Proyectos → Tickets** | `/tickets` | Incidencias / mensajes asignados |
| **Retención → Proyectos** | `/retencion` | Clientes en mantenimiento (vista técnica) |
| **Facturas → Mis facturas** | `/developer/facturas` | Facturar a Agencia Buffalo |
| **Facturas → Nueva factura** | `/developer/facturas/nueva` | Crear una factura |

No tienes acceso a: Dashboard admin, Leads, Finanzas, Pipelines, Marketing, Onboarding comercial, Calendario, Usuarios, Análisis IA, etc. Si intentas entrar, el CRM te redirige a `/developer`.

---

## 4. Dashboard (`/developer`)

Al entrar ves:

1. **Saludo** (“Tu panel”).  
2. **Proyectos asignados** — cuántos proyectos / asignaciones tienes.  
3. **Tareas abiertas** — tareas de desarrollo pendientes (y cuántas completadas).  
4. **Tickets pendientes** — abiertos + en progreso.  
5. **Retención** — proyectos de mantenimiento a tu cargo (y si hay revisiones del mes).  
6. **Horas estimadas** — en tareas abiertas vs hechas.  
7. **Facturación** — total de *tus* facturas a Buffalo (esto sí es tuyo: lo que cobras a la agencia).  
8. Gráficos de **actividad diaria** y **horas por proyecto** (últimos 30 días).

Úsalo como “¿qué tengo pendiente hoy?”. Desde cada tarjeta puedes saltar a la sección.

---

## 5. Proyectos: cómo funciona el día a día

### 5.1 Dos tipos de trabajo

**A) Proyecto Buffalo**  
Proyecto “de verdad” que salió de Onboarding (agente de voz, chat, dashboard, etc.) y se puso en marcha.  
- En la lista: *Proyecto Buffalo* o *En producción*.  
- Detalle: `/gestion-proyecto/proyectos/{id}`  
- Pestañas: **Dashboard** · **Onboarding** · **Tareas**

**B) Asignación puntual (tarea sin proyecto grande)**  
Encargo concreto que el admin te crea desde tu ficha de usuario.  
- En la lista: *Tarea puntual* / *Asignación interna*.  
- Detalle: `/gestion-proyecto/asignaciones/{id}`  
- Verás: qué hacer, entregables, enlaces, fechas.  
- Acciones típicas: **Empezar** → **Marcar como hecha**.

### 5.2 Qué verás en un proyecto Buffalo

**Dashboard del proyecto**  
Estado, contexto técnico, resumen operativo (sin precios).

**Onboarding (documentación del proyecto)**  
Brief técnico, alcance, stack, entregables, notas internas **ya filtradas**.  
El sistema quita líneas con precios (€, setup, mensualidad, IVA, etc.) y datos sensibles de cliente (emails, teléfonos, etc.).  
**Qué tienes que hacer:** leerlo, completar lo que te pidamos (stack, entregables, notas técnicas) y usarlo como fuente de verdad del proyecto.

**Tareas**  
Kanban con columnas:

| Columna | Significado |
|---------|-------------|
| **Pendiente** | Por hacer |
| **En curso** | Lo estás trabajando |
| **Validación por Buffalo** | Listo para que revisemos nosotros |
| **Hecho** | Cerrado |

Puedes crear tareas, moverlas, editarlas y adjuntar archivos.  
Cuando algo esté listo para review interno, muévelo a **Validación por Buffalo**.

### 5.3 Qué NO verás (y no debes buscar)

- Setup / precio del proyecto al cliente  
- Mensualidades / MRR / planes de mantenimiento  
- Totales de dinero de la cartera  
- Resumen contractual comercial (en retención la pestaña **Proyecto** es solo admin)  
- Finalizar / pasar a producción el proyecto (solo admin; aunque veas el botón, la API lo bloquea)

### 5.4 Flujo recomendado en un proyecto nuevo

1. Abre el proyecto desde **Proyectos**.  
2. Lee **Onboarding** completo.  
3. Revisa **Tareas** (o crea las que falten según el brief).  
4. Trabaja en **En curso**; cuando esté listo para Buffalo → **Validación por Buffalo**.  
5. Si hay incidencias de cliente → **Tickets**.  
6. Si el proyecto está en retención → también mira **Retención** (guía + KPIs).

---

## 6. Tickets

Rutas: `/tickets` y `/tickets/{id}`.

### Qué son
Mensajes / incidencias ligadas a un proyecto (a menudo desde webhooks o el panel admin). **Solo ves tickets asignados a ti** y de proyectos a los que tienes acceso.

### Qué haces tú
1. Filtrar por estado / proyecto.  
2. Abrir el ticket: leer el mensaje, datos del cliente del formulario, historial.  
3. Responder en el hilo.  
4. Cambiar estado: **Abierto** → **En progreso** → **Resuelto** / **Cerrado**.  
5. Prioridades: Baja, Media, Alta, Crítica.

### Qué no haces tú
- Ver estadísticas globales de todos los tickets (eso es admin).  
- Reasignar el ticket a otro developer (admin).  
- Eliminar tickets (admin).

Si un ticket no es tuyo o no tienes el proyecto, el CRM no te deja entrar.

*(Opcional técnico: en `/tickets/config` se puede configurar callback/token por proyecto para respuestas externas — solo si te lo pedimos.)*

---

## 7. Retención

Rutas: `/retencion` y `/retencion/proyectos/{id}`.

### Qué es
Proyectos con **mantenimiento activo** (clientes recurrentes). Tú no facturas al cliente desde aquí: das **soporte técnico continuo** y miras salud del servicio.

### Lista
Columnas para ti: **Cliente**, **Proyecto**, **Estado**.  
No hay columnas de plan, setup ni €/mes.

### Detalle — pestañas tuyas
| Pestaña | Uso |
|---------|-----|
| **Guía de desarrollo** | Cómo está montado el servicio, columnas de datos, criterios técnicos |
| **KPIs** | Métricas del periodo (salud operativa) |

La pestaña **Proyecto** (contrato, precios, resumen comercial) **no aparece** para developers.

---

## 8. Facturas (a Agencia Buffalo)

Esto **sí** lleva importes: es lo que **tú cobras a Buffalo**, no lo que Buffalo cobra al cliente.

| Ruta | Acción |
|------|--------|
| `/developer/facturas` | Listado: número, estado, PDF, total, fecha |
| `/developer/facturas/nueva` | Crear |
| `/developer/facturas/{id}` | Detalle |

### Cómo facturar
1. **Nueva factura**.  
2. Cliente fijo: **Agencia Buffalo**.  
3. Líneas: concepto, cantidad, precio sin IVA, % IVA.  
4. **Guardar borrador** o **Emitir**.  
5. Para **emitir** hace falta **adjuntar el PDF** de tu factura. Sin PDF no se emite.  
6. Estados: Borrador / Enviada / Anulada.

Solo ves **tus** facturas. El admin puede verlas también en el panel de facturas (origen developer).

---

## 9. Responsabilidades claras

### Buffalo (admin) se encarga de
- Crear tu usuario y darte acceso  
- Asignarte a proyectos y a tickets  
- Crear asignaciones puntuales cuando haga falta  
- Configurar el proyecto en Onboarding comercial y ponerlo en marcha  
- Validar entregas en la columna **Validación por Buffalo**  
- Decidir producción / finalización / pricing con el cliente  
- Resolver dudas de negocio y alcance comercial  

### Tú te encargas de
- Entregar el trabajo técnico según Onboarding + tareas  
- Mantener el tablero de tareas al día  
- Atender tickets asignados con criterio y tiempos razonables  
- Usar retención (guía + KPIs) en proyectos de mantenimiento  
- Facturar a Buffalo por tu trabajo (con PDF)  
- **No** preguntar ni compartir precios de cliente; si los necesitas para algo concreto, lo gestiona el admin  
- **No** depender de pantallas de ventas/finanzas: no existen en tu rol  

---

## 10. Buenas prácticas

1. **Empieza siempre por Onboarding + Tareas** del proyecto, no improvises alcance.  
2. Si el brief es ambiguo, pregunta **antes** de construir de más.  
3. Cuando algo esté listo para review: muévelo a **Validación por Buffalo** y comenta en la tarea si hace falta.  
4. Tickets: cambia a **En progreso** al cogerlo; no dejes hilos abiertos sin respuesta.  
5. Adjunta evidencias (capturas, logs, enlaces) en tareas o tickets.  
6. Factura con conceptos claros (proyecto / periodo / horas o hito).  
7. Si ves un precio de cliente o un dato que no deberías ver → avisa: es un bug de permisos.

---

## 11. Checklist del primer día

- [ ] Login con email/contraseña → llegas a `/developer`  
- [ ] Reconoces el menú: Dashboard, Proyectos, Retención, Facturas  
- [ ] Confirmas que **no** ves Leads / Finanzas / Marketing  
- [ ] Abres un proyecto asignado (si ya tienes) y lees **Onboarding**  
- [ ] Miras el tablero de **Tareas** y mueves o creas una tarea de prueba si te lo pedimos  
- [ ] Sabes dónde están **Tickets** y **Retención**  
- [ ] Sabes que las **Facturas** son a Agencia Buffalo + PDF obligatorio al emitir  
- [ ] Entiendes: **cero precios de cliente** en tu panel  

---

## 12. Dudas frecuentes

**¿Puedo entrar con Google?**  
No. Google login es admin. Tú: email + contraseña.

**¿Por qué no veo el dinero del proyecto?**  
Es confidencial. Solo admin. Tú trabajas con alcance técnico.

**¿Qué es “Validación por Buffalo”?**  
Cola de review interna: “ya está listo para que lo miremos nosotros”.

**¿Dónde facturo al cliente final?**  
No lo haces desde este panel. Tú facturas a **Agencia Buffalo**.

**No me sale ningún proyecto**  
Aún no estás asignado. Pide al admin que te vincule al proyecto o cree una asignación puntual.

**¿Puedo ver el contrato / mensualidad en Retención?**  
No. Solo guía técnica y KPIs.

---

## 13. Resumen en una frase

> Buffalo te da acceso, proyectos, tickets y contexto técnico; tú entregas, comunicas y facturas a la agencia — sin tocar la parte comercial del cliente.

Si algo de esta guía no coincide con lo que ves en pantalla, dínoslo: el producto evoluciona y actualizamos este documento.

# Tickets — Guía de integración para developers

Documento para el **developer del dashboard del cliente**. Explica qué implementar para sincronizar incidencias con el CRM Buffalo de forma **bidireccional**.

Buffalo os proporcionará:

| Dato | Descripción |
|------|-------------|
| **URL webhook** | Endpoint único para crear y eliminar tickets en Buffalo |
| **Token** | `Authorization: Bearer <token>` (mismo para todos los proyectos) |
| **`project_ref`** | Código de vuestro proyecto (ej. `BUF-2026-acme`) |

---

## 1. Modelo de sincronización

```
┌─────────────────────┐                      ┌─────────────────────┐
│  Dashboard cliente  │  POST webhook        │   CRM Buffalo       │
│                     │ ──────────────────►  │                     │
│  - crear ticket     │  action: create      │  - lista Tickets    │
│  - borrar ticket    │  action: delete      │  - responder        │
│                     │                      │  - borrar           │
│                     │  POST callback       │                     │
│                     │ ◄──────────────────  │                     │
│  - recibir update   │  ticket.updated      │                     │
│  - recibir delete   │  ticket.deleted      │                     │
└─────────────────────┘                      └─────────────────────┘
```

### Reglas importantes

1. **Siempre desde backend** — nunca expongáis el token en el frontend.
2. **Guardad dos IDs** al crear un ticket:
   - `external_id` — vuestro ID interno (obligatorio para sincronizar bien).
   - `ticket_id` — UUID que devuelve Buffalo (útil para operaciones directas).
3. **Eliminar en un lado → eliminar en el otro** (ver secciones 4 y 5).
4. **No re-notifiquéis** a Buffalo cuando recibáis un `ticket.deleted` por callback (evitáis bucles).

---

## 2. Credenciales y URLs

### Webhook Buffalo (vosotros → Buffalo)

```
POST https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/tickets
```

Local: `http://localhost:3000/api/webhooks/tickets`

```http
Authorization: Bearer <TICKETS_WEBHOOK_TOKEN>
Content-Type: application/json
```

### Callback vuestro (Buffalo → vosotros)

Debéis exponer un endpoint POST en **vuestro backend**, por ejemplo:

```
POST https://dashboard.cliente.com/api/webhooks/buffalo-tickets
```

Buffalo lo configura en su CRM (Tickets → Configuración). Validad el Bearer token que os indiquen.

---

## 3. Crear una incidencia

### Request

`action` puede omitirse (por defecto es crear).

```json
{
  "project_ref": "BUF-2026-acme",
  "title": "Error al exportar informe PDF",
  "description": "La pantalla se queda en blanco al pulsar Exportar.",
  "priority": "high",
  "external_id": "inc-2026-0042",
  "reporter": {
    "name": "María García",
    "email": "maria@cliente.com"
  },
  "fields": {
    "modulo": "informes",
    "url_pantalla": "/dashboard/informes",
    "version_app": "2.4.1"
  }
}
```

### Campos

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `project_ref` o `project_id` | Sí | Identifica vuestro proyecto en Buffalo |
| `title` o `description` | Sí* | Al menos uno con contenido |
| `external_id` | Muy recomendado | Vuestro ID — necesario para delete y callback |
| `priority` | No | `low`, `medium`, `high`, `critical` |
| `status` | No | Por defecto `open` |
| `reporter` | No | `{ "name", "email" }` |
| `fields` | No | Datos libres de contexto (módulo, URL, versión…) |

### Respuesta éxito (`201` nuevo / `200` duplicado)

```json
{
  "ok": true,
  "action": "create",
  "ticket_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "project_id": "...",
  "project_name": "Nombre del proyecto",
  "duplicate": false,
  "message": "Incidencia recibida correctamente"
}
```

**Guardad `ticket_id` y `external_id` en vuestra base de datos.**

### Ejemplo Node.js

```javascript
async function crearTicket(incidencia) {
  const res = await fetch(process.env.BUFFALO_TICKETS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.BUFFALO_TICKETS_WEBHOOK_TOKEN}`,
    },
    body: JSON.stringify({
      project_ref: process.env.BUFFALO_PROJECT_REF,
      title: incidencia.titulo,
      description: incidencia.descripcion,
      priority: incidencia.prioridad || 'medium',
      external_id: incidencia.id,
      reporter: {
        name: incidencia.usuario.nombre,
        email: incidencia.usuario.email,
      },
      fields: incidencia.contexto,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al crear ticket');

  await db.tickets.update(incidencia.id, {
    buffalo_ticket_id: data.ticket_id,
  });

  return data;
}
```

---

## 4. Eliminar una incidencia (desde vuestro dashboard)

Cuando el usuario borra un ticket en **vuestro panel**, debéis notificar a Buffalo para que también se elimine en el CRM.

### Request

```json
{
  "action": "delete",
  "project_ref": "BUF-2026-acme",
  "external_id": "inc-2026-0042"
}
```

Alternativa con el UUID de Buffalo:

```json
{
  "action": "delete",
  "ticket_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `action` | Sí | `"delete"` |
| `ticket_id` | Sí* | UUID devuelto por Buffalo al crear |
| `external_id` + `project_ref` | Sí* | Vuestro ID + proyecto |

\* Una de las dos opciones de identificación.

### Respuesta éxito (`200`)

```json
{
  "ok": true,
  "action": "delete",
  "ticket_id": "a1b2c3d4-...",
  "external_id": "inc-2026-0042",
  "project_id": "...",
  "message": "Incidencia eliminada en Buffalo"
}
```

### Ejemplo Node.js

```javascript
async function eliminarTicket(incidencia) {
  const res = await fetch(process.env.BUFFALO_TICKETS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.BUFFALO_TICKETS_WEBHOOK_TOKEN}`,
    },
    body: JSON.stringify({
      action: 'delete',
      project_ref: process.env.BUFFALO_PROJECT_REF,
      external_id: incidencia.id,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al eliminar en Buffalo');

  await db.tickets.delete(incidencia.id);
  return data;
}
```

> Buffalo **no** os reenvía callback al borrar desde vuestro lado — la eliminación la iniciáis vosotros.

---

## 5. Callback que debéis implementar (Buffalo → vosotros)

Buffalo llama a **vuestra URL** cuando:

- Responde o cambia el estado de un ticket → `ticket.updated`
- Elimina un ticket desde el CRM → `ticket.deleted`

### Autenticación

Validad la cabecera que Buffalo os configure:

```http
Authorization: Bearer <vuestro_token_callback>
Content-Type: application/json
```

### Evento `ticket.updated`

```json
{
  "event": "ticket.updated",
  "ticket_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "external_id": "inc-2026-0042",
  "project_ref": "BUF-2026-acme",
  "status": "in_progress",
  "message": "Estamos revisando el error de exportación.",
  "updated_by": "soporte@agenciabuffalo.es",
  "updated_at": "2026-06-25T14:30:00.000Z"
}
```

**Qué hacer:** localizar el ticket por `external_id` (o `ticket_id`), guardar el mensaje y actualizar el estado en vuestra UI.

### Evento `ticket.deleted`

```json
{
  "event": "ticket.deleted",
  "ticket_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "external_id": "inc-2026-0042",
  "project_ref": "BUF-2026-acme",
  "deleted_by": "soporte@agenciabuffalo.es",
  "deleted_at": "2026-06-25T15:00:00.000Z"
}
```

**Qué hacer:** eliminar el ticket de vuestra base de datos y de la UI. **No** llaméis al webhook de Buffalo de nuevo (evitáis bucle).

### Ejemplo handler (Express / Next.js API route)

```javascript
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== process.env.BUFFALO_CALLBACK_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  if (body.event === 'ticket.updated') {
    await db.tickets.upsertFromBuffalo({
      externalId: body.external_id,
      buffaloId: body.ticket_id,
      status: body.status,
      lastMessage: body.message,
      updatedAt: body.updated_at,
    });
    return Response.json({ ok: true });
  }

  if (body.event === 'ticket.deleted') {
    await db.tickets.deleteByExternalId(body.external_id);
  // o por buffalo_ticket_id: body.ticket_id
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Evento no soportado' }, { status: 400 });
}
```

Responded `200` con `{ "ok": true }` si procesáis correctamente.

---

## 6. Funciones que debe tener vuestro módulo de tickets

| Función | Cuándo | Acción |
|---------|--------|--------|
| **Crear incidencia** | Usuario abre ticket en dashboard | `POST` webhook sin `action` → guardar `ticket_id` |
| **Listar incidencias** | Vista del panel | Leer de vuestra BD (sincronizada) |
| **Ver detalle / mensajes** | Usuario abre un ticket | Mostrar hilo local + mensajes de callbacks |
| **Eliminar incidencia** | Usuario borra en dashboard | `POST` webhook `action: delete` → borrar en BD local |
| **Recibir actualización** | Callback `ticket.updated` | Actualizar estado y mensaje en BD |
| **Recibir eliminación** | Callback `ticket.deleted` | Borrar de BD sin llamar a Buffalo |

---

## 7. Prioridades y estados

### Prioridad

| Enviáis | En Buffalo |
|---------|------------|
| `low`, `baja` | Baja |
| `medium`, `media`, `normal` | Media |
| `high`, `alta`, `urgente` | Alta |
| `critical`, `critica` | Crítica |

### Estado

| Valor | Significado |
|-------|-------------|
| `open` | Abierto |
| `in_progress` | En progreso |
| `resolved` | Resuelto |
| `closed` | Cerrado |

Buffalo puede cambiar el estado y os lo notifica por callback.

---

## 8. Alias de campos aceptados

| Estándar | También válido |
|----------|----------------|
| `project_ref` | `config_ref`, `projectRef`, `configRef` |
| `project_id` | `projectId` |
| `external_id` | `externalId` |
| `ticket_id` | `ticketId` |
| `fields` | `custom_fields`, `metadata`, `extra` |
| `title` | `subject`, `titulo` |
| `description` | `descripcion`, `message`, `body` |
| `action: "delete"` | `eliminar`, `remove` |

---

## 9. Errores del webhook

| HTTP | Causa |
|------|--------|
| `401` | Token incorrecto o ausente |
| `400` | Body inválido, proyecto no encontrado, ticket no pertenece al proyecto |
| `404` | Ticket no encontrado (delete) |
| `500` | Error interno — reintentar con backoff |

Cuerpo: `{ "error": "mensaje" }`

---

## 10. Checklist de implementación

- [ ] Variables de entorno: `BUFFALO_TICKETS_WEBHOOK_URL`, `BUFFALO_TICKETS_WEBHOOK_TOKEN`, `BUFFALO_PROJECT_REF`
- [ ] Crear ticket → webhook → persistir `ticket_id` + `external_id`
- [ ] Eliminar ticket en dashboard → webhook `action: delete`
- [ ] Endpoint callback POST con validación Bearer
- [ ] Handler `ticket.updated` — actualizar estado y mensajes
- [ ] Handler `ticket.deleted` — borrar local sin re-llamar a Buffalo
- [ ] Token nunca en frontend
- [ ] Prueba completa: crear → ver en Buffalo → responder desde Buffalo → recibir callback
- [ ] Prueba delete: borrar en dashboard → desaparece en Buffalo
- [ ] Prueba delete inversa: borrar en Buffalo → recibir `ticket.deleted` → desaparece en dashboard

---

## 11. Contacto

Para obtener `project_ref`, token del webhook y configurar el callback en Buffalo, contactad con el equipo Buffalo.

---

*CRM Buffalo — módulo Tickets.*

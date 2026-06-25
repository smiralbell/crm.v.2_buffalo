# Integración de incidencias (Tickets) — Guía para desarrolladores

Esta guía explica cómo enviar incidencias desde el **dashboard de un cliente** al CRM Buffalo.

**Hay un único webhook para todos los proyectos.** Todos los dashboards envían al mismo endpoint. Lo que identifica a qué cliente/proyecto pertenece la incidencia es el campo `project_ref` (o `project_id`) en el body JSON.

---

## 1. Resumen del flujo

```
Dashboard del cliente  →  POST webhook único  →  CRM Buffalo  →  Vista Tickets
```

1. El usuario reporta una incidencia en el dashboard.
2. Vuestro backend hace `POST` al webhook de Buffalo (misma URL para todos).
3. En el JSON incluís `project_ref` para que Buffalo sepa de qué proyecto es.
4. El CRM guarda el ticket y muestra los campos dinámicos en la interfaz.

---

## 2. URL del webhook (única)

```
POST https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/tickets
```

- **Producción:** `https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/tickets`
- **Local (desarrollo):** `http://localhost:3000/api/webhooks/tickets`

**Esta URL es la misma para todos los proyectos.** No hay un webhook distinto por cliente.

Buffalo os proporcionará:
- La **URL** del webhook (siempre la misma).
- El **token de autorización** global (`TICKETS_WEBHOOK_TOKEN`).
- Vuestro **`project_ref`** (código único de vuestro proyecto en el CRM).

---

## 3. Autenticación

Enviar el token global en la cabecera `Authorization`:

```http
Authorization: Bearer <TICKETS_WEBHOOK_TOKEN>
Content-Type: application/json
```

El token es **el mismo para todos los proyectos**. Sin él válido, el CRM responde `401 Unauthorized`.

> **Importante:** el token es confidencial. No lo expongáis en el frontend público.  
> Llamad al webhook desde **vuestro backend** o desde una API route/serverless vuestra.

---

## 4. Identificar el proyecto

En cada request debéis indicar a qué proyecto pertenece la incidencia. Usad **una** de estas opciones:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `project_ref` | string | **Recomendado.** Código que Buffalo os asigna (campo `config_ref` en el CRM). |
| `project_id` | string (UUID) | ID interno del proyecto en el CRM (alternativa a `project_ref`). |

Si falta o no coincide con ningún proyecto, el CRM responde `400` con el mensaje `Proyecto no encontrado`.

---

## 5. Cuerpo del request (JSON)

### Campos del contrato

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `project_ref` | string | Sí* | Código de vuestro proyecto en Buffalo |
| `project_id` | string | Sí* | UUID del proyecto (alternativa a `project_ref`) |
| `title` | string | Sí** | Título corto de la incidencia |
| `description` | string | Sí** | Descripción detallada |
| `priority` | string | No | `low`, `medium`, `high`, `critical` (también acepta `alta`, `baja`, `urgente`…) |
| `status` | string | No | Por defecto `open`. Valores: `open`, `in_progress`, `resolved`, `closed` |
| `external_id` | string | Muy recomendado | ID de la incidencia en vuestro sistema (evita duplicados si reintentáis) |
| `reporter` | object | No | `{ "name": "...", "email": "..." }` |
| `fields` | object | No | **Campos libres** específicos de vuestro dashboard |

\* Obligatorio `project_ref` **o** `project_id`.  
\** Al menos uno de `title` o `description` debe tener contenido.

### El objeto `fields` (campos dinámicos)

Todo lo que sea **específico de vuestro dashboard** va aquí. El CRM lo mostrará automáticamente aunque otros proyectos usen claves distintas.

```json
{
  "modulo": "informes",
  "url_pantalla": "/dashboard/informes/exportar",
  "version_app": "2.4.1",
  "navegador": "Chrome 124"
}
```

**No hay schema fijo** para `fields`. Mandad lo que necesitéis para diagnosticar.

---

## 6. Ejemplo completo

### cURL

```bash
curl -X POST "https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/tickets" \
  -H "Authorization: Bearer TU_TICKETS_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_ref": "cliente-ejemplo-2026",
    "title": "Error al exportar informe PDF",
    "description": "Al pulsar Exportar la pantalla se queda en blanco durante 10 segundos y no descarga nada.",
    "priority": "high",
    "external_id": "inc-2026-0042",
    "reporter": {
      "name": "María García",
      "email": "maria@cliente.com"
    },
    "fields": {
      "modulo": "informes",
      "url_pantalla": "/dashboard/informes",
      "version_app": "2.4.1",
      "navegador": "Chrome 124",
      "user_role": "admin"
    }
  }'
```

### JavaScript (Node / backend)

```javascript
async function reportarIncidencia(incidencia) {
  const res = await fetch('https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/tickets', {
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
      fields: {
        modulo: incidencia.modulo,
        url_pantalla: incidencia.url,
        version_app: process.env.APP_VERSION,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al enviar incidencia');
  return data;
}
```

### Python

```python
import os
import requests

def reportar_incidencia(payload: dict) -> dict:
    url = "https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/tickets"
    headers = {
        "Authorization": f"Bearer {os.environ['BUFFALO_TICKETS_WEBHOOK_TOKEN']}",
        "Content-Type": "application/json",
    }
    body = {
        "project_ref": os.environ["BUFFALO_PROJECT_REF"],
        **payload,
    }
    r = requests.post(url, json=body, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()
```

---

## 7. Respuestas del webhook

### Éxito — ticket nuevo (`201`)

```json
{
  "ok": true,
  "ticket_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "project_id": "...",
  "project_name": "Nombre del proyecto",
  "duplicate": false,
  "message": "Incidencia recibida correctamente"
}
```

### Éxito — duplicado (`200`)

Si reenviáis el mismo `external_id` para el mismo proyecto:

```json
{
  "ok": true,
  "ticket_id": "a1b2c3d4-...",
  "duplicate": true,
  "message": "Ticket ya existía (mismo external_id)"
}
```

### Errores habituales

| HTTP | Causa |
|------|--------|
| `401` | Token de autorización incorrecto o ausente |
| `400` | Body inválido, sin título/descripción, o `project_ref`/`project_id` no encontrado |
| `500` | Error interno del CRM (reintentar con backoff) |

El cuerpo de error incluye `{ "error": "mensaje claro" }`.

---

## 8. Buenas prácticas

### Haced

- Incluir siempre **`project_ref`** en cada request.
- Usar **`external_id`** estable (vuestro ID de incidencia) para idempotencia.
- Enviar desde **backend**, no desde el navegador del usuario final.
- Incluir en `fields` contexto útil: módulo, URL, versión, IDs de negocio, capturas (URL), etc.
- Usar `reporter` con nombre y email para que Buffalo pueda contactar.
- Reintentar con backoff exponencial si recibís `5xx`.

### Evitad

- Hardcodear el token en código fuente commiteado (usar variables de entorno).
- Enviar datos personales innecesarios (PII) en `fields`.
- Payloads mayores de **1 MB** (límite del webhook).

---

## 9. Prioridades y estados

### Prioridad (`priority`)

| Valor enviado | Normalizado en CRM |
|---------------|-------------------|
| `low`, `baja` | Baja |
| `medium`, `media`, `normal` | Media |
| `high`, `alta`, `urgente` | Alta |
| `critical`, `critica` | Crítica |

### Estado (`status`)

Por defecto el ticket llega como **Abierto** (`open`). Buffalo actualiza el estado desde el CRM.

---

## 10. Alternativas de estructura (compatibles)

| En lugar de… | También válido |
|--------------|----------------|
| `project_ref` | `config_ref`, `projectRef`, `configRef` |
| `project_id` | `projectId` |
| `fields` | `custom_fields`, `metadata`, `extra` |
| `title` | `subject`, `titulo` |
| `description` | `descripcion`, `message`, `body` |
| `reporter.name` | `reporter_name`, `fields.usuario` |
| `reporter.email` | `reporter_email`, `fields.email` |
| `external_id` | `externalId`, `id` (si es vuestro ID de incidencia) |

---

## 11. Cómo probar la integración

1. Pedid a Buffalo el **`project_ref`** de vuestro proyecto y el **token** del webhook.
2. Enviad un POST de prueba con cURL (sección 6).
3. Entrad en el CRM → **Tickets** y comprobad que aparece la incidencia.
4. Verificad que los campos de `fields` se muestran en **Campos del cliente**.

---

## 12. Checklist de entrega

- [ ] Variable `BUFFALO_TICKETS_WEBHOOK_TOKEN` configurada en vuestro entorno.
- [ ] Variable `BUFFALO_PROJECT_REF` configurada con vuestro código de proyecto.
- [ ] Llamada al webhook desde backend (no desde el cliente).
- [ ] Cada request incluye `project_ref` + `title`/`description` + `reporter`.
- [ ] `external_id` generado y persistido en vuestra BD.
- [ ] `fields` con el contexto que Buffalo necesita para diagnosticar.
- [ ] Prueba en staging con un ticket real antes de producción.

---

## 13. Contacto

Para obtener vuestro **`project_ref`** y el **token del webhook**, contactad con el equipo Buffalo. El `project_ref` también aparece en la ficha del proyecto en Retención dentro del CRM.

---

*Documento generado para el CRM Buffalo — módulo Tickets.*

# Agente del CRM por WhatsApp (Evolution API)

Es el mismo agente que el de Telegram: consulta y cambia el CRM, usa los subagentes,
programa avisos, guarda instrucciones y manda exportaciones. Solo cambia el canal.
Telegram sigue funcionando igual.

## Cómo funciona

1. Un socio escribe (o manda una nota de voz) al número conectado a la instancia de Evolution.
2. Evolution avisa al CRM en `/api/webhooks/whatsapp?secret=…` (evento `MESSAGES_UPSERT`).
3. El CRM comprueba el secreto y que el móvil esté en `WHATSAPP_AGENT_NUMBERS`. A cualquier otro número no le contesta.
4. El agente responde por WhatsApp a través de Evolution.

Cada socio tiene su conversación con historial propio. Por dentro se guarda en las
mismas tablas que Telegram (`telegram_agent_*`) con un `chat_id` = 7·10^15 + móvil.

## Configuración

Variables en el servidor del CRM:

```
WHATSAPP_AGENT=1
EVOLUTION_API_URL=https://evolution.midominio.com
EVOLUTION_API_KEY=...                 # clave global o token de la instancia
EVOLUTION_INSTANCE=asistente-crm      # instancia con el número del agente
WHATSAPP_AGENT_NUMBERS=34600111222,34600333444
WHATSAPP_WEBHOOK_SECRET=...           # texto largo inventado
```

Además hacen falta las que ya usa Telegram: `OPENROUTER_API_KEY` y la dirección
pública del CRM (`NEXT_PUBLIC_BASE_URL`; si falta se usa la de Easypanel).

Al arrancar, el CRM configura el webhook en Evolution. Solo lo hace con una
dirección pública con https: un CRM en local nunca lo toca. Para no tocarlo nunca,
`WHATSAPP_AGENT_AUTO_WEBHOOK=0`.

## Requisitos de la instancia

- En el Manager de Evolution, la instancia tiene que estar conectada (estado `open`).
- Mejor un número dedicado al agente (no el personal de un socio): con Evolution,
  WhatsApp puede bloquear números que considera automatizados.
- Ningún socio puede usar como agente su propio número: los mensajes que escribe él
  mismo salen como «enviados por el agente» y se ignoran.

## Qué entiende

- Texto, notas de voz (se transcriben), fotos (se describen) y archivos de texto (csv, txt, json…).
- Stickers, ubicaciones o contactos: contesta que no los puede leer. Reacciones y mensajes editados o borrados se ignoran.
- Grupos de WhatsApp: no contesta (solo chats privados).
- Comandos: `/nuevo` (conversación nueva), `/pendientes` (borrados por confirmar), `/ayuda`.

## Borrados

WhatsApp no tiene botones, así que la doble confirmación es por escrito:

1. El agente manda la petición con un código: `BORRAR a1b2c3d4e5`
2. Luego: `ELIMINAR DEFINITIVAMENTE a1b2c3d4e5`
3. Para no borrar: `CANCELAR a1b2c3d4e5`

Un «sí» o «bórralo» no confirma nada. La petición caduca a los 15 minutos.

## Avisos programados

Los avisos que se piden por WhatsApp llegan por WhatsApp. Si son «para los socios»,
llegan a todos los números de `WHATSAPP_AGENT_NUMBERS`.

## Comprobar que funciona

1. Desde el móvil de un socio, escribe `/ayuda` al número del agente: debe contestar al momento (no usa IA).
2. Escribe una pregunta, por ejemplo «¿cuántos leads han entrado hoy?».
3. Si no contesta:
   - En Evolution, `GET /webhook/find/<instancia>` debe apuntar a `…/api/webhooks/whatsapp?secret=…` con `MESSAGES_UPSERT`.
   - En los logs del CRM, «mensaje ignorado de un número no autorizado» = el móvil no está (o está mal escrito) en `WHATSAPP_AGENT_NUMBERS`.
   - Un 401 en el webhook = el secreto de Evolution no coincide con `WHATSAPP_WEBHOOK_SECRET`. Reinicia el CRM y lo vuelve a configurar.

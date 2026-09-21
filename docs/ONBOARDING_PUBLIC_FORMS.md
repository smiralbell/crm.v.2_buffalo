## Dominio público (sin CRM / sin login)

Los links compartidos **no deben usar** el host del CRM
(`n8n-crmv2-buffalo…` o `crm.agenciabuffalo.es`), porque el cliente podría abrir `/login`.

### 1. Crea un subdominio solo para formularios

Ejemplo: `forms.agenciabuffalo.es` → apunta (CNAME/A) al **mismo** servicio EasyPanel del CRM.

### 2. Variables de entorno (EasyPanel)

```env
FORMS_PUBLIC_HOST=forms.agenciabuffalo.es
```

Basta con esa variable: se lee en **runtime**, así que cambiar el dominio solo
requiere reiniciar el servicio (no reconstruir la imagen). El panel de onboarding
recibe el dominio desde la API, no del bundle.

`NEXT_PUBLIC_FORMS_BASE_URL` sigue soportada pero es opcional: Next la incrusta
durante `npm run build`, que en este repo ocurre dentro del Dockerfile, por lo que
solo surte efecto si reconstruyes la imagen.

Con eso:
- Al copiar el link sale `https://forms.agenciabuffalo.es/f/delockos`
- En ese host, `/login` y el resto del CRM están **bloqueados** (middleware)
- Solo funcionan `/f/*` y `/api/f/*`

### 3. SQL en producción

Ejecuta `prisma/CREATE_ONBOARDING_PUBLIC_FORMS.sql` en la BD de producción si aún no está.

## Qué es

Desde la ficha de un onboarding (`/onboarding/proyectos/[id]`) puedes crear un formulario público:

1. Pegar el **HTML completo** (se muestra tal cual al cliente).
2. Elegir un **nombre de link** (slug), p. ej. `aic-onboarding`.
3. Compartir `https://forms.TU-DOMINIO/f/aic-onboarding`.

El cliente **no entra al CRM**: la página `/f/[slug]` no tiene sidebar, login ni sesión.
El HTML se sirve como **documento completo** (`Content-Type: text/html`), así que funcionan
`<!doctype html>`, `<head>`, CSS externos, fuentes y `<script>` (formularios SPA tipo Delokos).

## Tablas Postgres

- `onboarding_public_forms` — HTML + slug por lead
- `onboarding_form_submissions` — cada respuesta (`payload` JSONB)

Migración: `prisma/CREATE_ONBOARDING_PUBLIC_FORMS.sql`

## Cómo preparar el HTML

Puedes pegar:
- Un fragmento (`<form>…</form>`) — el CRM lo envuelve en un documento básico.
- Un HTML completo (`<!doctype html>…`) — se sirve tal cual, con CSS y JS incluidos.

### Envío al CRM

- Formularios nativos: campos con atributo **`name`**. No hace falta `action`/`method`: se intercepta el submit → `POST /api/f/{slug}`.
- SPAs / Web3Forms / `fetch` con `FormData`: también se guarda una copia en el CRM (script de captura inyectado al final del documento).

### Nombres recomendados

| `name` | Uso |
|--------|-----|
| `contacto_nombre` | Nombre |
| `contacto_email` | Email |
| `contacto_tel` / `telefono` | Teléfono |
| `empresa` / `contacto_empresa` | Empresa |
| `notas` / `mensaje` | Texto libre |

Puedes usar **cualquier** `name`: todo va al JSON `payload`.

### Ejemplo mínimo

```html
<form>
  <label>Nombre <input name="contacto_nombre" required /></label>
  <label>Email <input type="email" name="contacto_email" required /></label>
  <label>Empresa <input name="empresa" /></label>
  <button type="submit">Enviar</button>
</form>
```

## APIs

| Ruta | Auth | Uso |
|------|------|-----|
| `GET/POST/PATCH/DELETE /api/onboarding/projects/[leadId]/public-forms` | CRM | Admin CRUD |
| `GET /api/f/[slug]` | Público | Devuelve HTML activo |
| `POST /api/f/[slug]` | Público | Guarda envío |

## Seguridad

- Rutas públicas sin `requireAuth` y sin `Layout`.
- El slug solo resuelve ese formulario; no lista leads ni datos del CRM.
- Pausar el formulario (`is_active = false`) deja el link inaccesible.

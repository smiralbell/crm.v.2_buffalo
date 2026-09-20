# Formularios públicos de onboarding

## Qué es

Desde la ficha de un onboarding (`/onboarding/proyectos/[id]`) puedes crear un formulario público:

1. Pegar el **HTML completo** (se muestra tal cual al cliente).
2. Elegir un **nombre de link** (slug), p. ej. `aic-onboarding`.
3. Compartir `https://TU-DOMINIO/f/aic-onboarding`.

El cliente **no entra al CRM**: la página `/f/[slug]` no tiene sidebar, login ni sesión. Solo muestra el HTML y guarda el envío.

## Tablas Postgres

- `onboarding_public_forms` — HTML + slug por lead
- `onboarding_form_submissions` — cada respuesta (`payload` JSONB)

Migración: `prisma/CREATE_ONBOARDING_PUBLIC_FORMS.sql`

## Cómo preparar el HTML

- Debe haber un `<form>` con campos que tengan atributo **`name`**.
- Solo se guardan campos con `name` (input, select, textarea).
- No hace falta `action` ni `method`: el CRM intercepta el submit y hace `POST /api/f/{slug}`.

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

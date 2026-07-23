# MCP Buffalo CRM

Servidor MCP (stdio) con acceso total al Postgres del CRM Buffalo:
**leer, escribir y borrar**. Los borrados / SQL destructivo exigen **doble confirmación**.

## Tools

| Tool | Uso |
|------|-----|
| `crm_help` | Guía del MCP + modelo de negocio |
| `crm_list_tables` | Listar tablas |
| `crm_describe_table` | Columnas de una tabla |
| `crm_query` | SELECT (solo lectura) |
| `crm_search` | Buscar en contacts / leads / proyectos / tickets |
| `crm_get_row` | Fila por `id` |
| `crm_insert_row` | INSERT |
| `crm_update_row` | UPDATE |
| `crm_execute_sql` | SQL de escritura no destructiva |
| `crm_delete_rows` | DELETE con **doble confirmación** |
| `crm_execute_destructive` | DROP/TRUNCATE/DELETE crudo con **doble confirmación** |

## Doble confirmación (borrados)

1. Llama con `confirm_step: 1` → recibes `confirm_token` + preview (no se borra nada).
2. Llama otra vez con `confirm_step: 2`, `confirm: true`, el mismo `confirm_token` y los **mismos parámetros**.
3. En `crm_execute_destructive` el paso 2 también exige `acknowledge_irreversible: true`.

El token caduca a los 10 minutos. Si cambias los parámetros entre pasos, se rechaza.

## Arranque local

Desde la raíz del repo (usa el `.env` con `DATABASE_URL`):

```bash
npx tsx mcp/buffalo-crm/src/index.ts
```

O con el script npm:

```bash
npm run mcp:crm
```

## Cursor

El proyecto incluye `.cursor/mcp.json`. Tras abrirlo en Cursor:

1. Settings → MCP → comprueba que `buffalo-crm` esté enabled.
2. Reinicia MCP / Cursor si hace falta.
3. El agente puede usar las tools automáticamente.

Si `DATABASE_URL` no se hereda, añádela en el bloque `env` de `.cursor/mcp.json` (sin subir secretos a git: preferible dejar que cargue el `.env` del cwd).

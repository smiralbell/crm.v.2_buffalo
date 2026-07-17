# Prisma / SQL

Este proyecto **no usa** `prisma migrate` de forma habitual. El esquema vive en:

| Qué | Dónde |
|---|---|
| Modelos Prisma (client) | `schema.prisma` |
| Scripts para crear tablas (bootstrap) | `CREATE_*.sql` en esta carpeta |
| Parches ya aplicados en prod | `history/` (`ALTER_*`, `ADD_*`) |
| Limpieza de tablas muertas | `CLEANUP_UNUSED_TABLES.sql` |

## Uso

```bash
npx prisma generate   # regenerar client tras cambiar schema.prisma
```

Para una base nueva: ejecuta los `CREATE_*.sql` necesarios (y, si hace falta, los de `history/` en orden).

No hace falta tocar `history/` en el día a día: esos cambios ya están en la DB.

# Historial de parches SQL

Parches `ALTER_*` / `ADD_*` **ya aplicados** en producción.
Se conservan solo como referencia / por si hay que montar otra base desde cero.

No los ejecutes otra vez en la DB actual salvo que sepas lo que haces
(`IF NOT EXISTS` / columnas nuevas suelen ser idempotentes, pero no siempre).

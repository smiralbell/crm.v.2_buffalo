/**
 * Límites de «cada N días» de los avisos programados. Va en su propio archivo
 * (no en store.ts) para poder usarlo en las herramientas sin depender de la base de datos.
 * Lo importan personal-tools.ts y tools.ts (los avisos del equipo y de los socios).
 */

/** Lo diario ya existe como repetición; 2 días es lo mínimo útil para «cada N días». */
export const REMINDER_EVERY_MIN_DAYS = 2
/** Un año como máximo. */
export const REMINDER_EVERY_MAX_DAYS = 365

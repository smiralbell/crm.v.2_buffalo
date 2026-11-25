/** Emparejar el nombre de un cliente con su carpeta de Drive. Sin dependencias: se puede probar aislado. */

/** «AISF PARTNERS S.L.» → «aisf partners». Quita acentos, puntuación y sufijos de sociedad. */
export function normalizeClientName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .join(' ')
    .replace(/( (sl|sa|slu|s l|s a|s l u))+$/, '')
    .trim()
}

export type FolderRow = { id: string; name: string }

/**
 * Elige la carpeta del cliente entre las existentes.
 * - Coincidencia exacta de nombre normalizado. Si hay varias, no adivina: lanza error.
 * - Nombre truncado por Drive («MARTA…») si el prefijo coincide con una única carpeta.
 * - Sin coincidencia → null (habrá que crearla).
 */
export function pickClientFolder(
  clientName: string,
  folders: FolderRow[]
): { folder: FolderRow | null; matchedBy: 'exacto' | 'prefijo' | 'creada' } {
  const wanted = normalizeClientName(clientName)
  if (!wanted) return { folder: null, matchedBy: 'creada' }

  const exact = folders.filter((f) => normalizeClientName(f.name) === wanted)
  if (exact.length === 1) return { folder: exact[0], matchedBy: 'exacto' }
  if (exact.length > 1) {
    throw new Error(
      `Hay ${exact.length} carpetas con el nombre «${clientName}» en Drive. Renombra o une las duplicadas y vuelve a intentarlo.`
    )
  }

  const truncated = folders.filter((f) => /(…|\.\.\.)\s*$/.test(f.name))
  const prefixHits = truncated.filter((f) => {
    const prefix = normalizeClientName(f.name.replace(/(…|\.\.\.)\s*$/, ''))
    return prefix.length >= 4 && wanted.startsWith(prefix)
  })
  if (prefixHits.length === 1) return { folder: prefixHits[0], matchedBy: 'prefijo' }

  return { folder: null, matchedBy: 'creada' }
}

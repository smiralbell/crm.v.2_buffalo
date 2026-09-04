/**
 * Identidad fiscal de Buffalo — FUENTE ÚNICA.
 *
 * Antes estos datos estaban escritos a mano en 9 archivos y se habían
 * desincronizado en 8 variantes distintas: el contrato llegó a emitirse sin el
 * número de la calle. Si cambia el domicilio, se cambia AQUÍ y en ningún sitio más.
 *
 * La forma canónica es la de las facturas, que son el documento fiscal.
 */

export const BUFFALO = {
  legalName: 'Buffalo IA Global Digital Solutions, S.L.',
  brandName: 'Buffalo AI',
  cif: 'B22944599',

  /** Vía + número + escalera + puerta. Sin población ni CP. */
  street: 'C/ Provença 474, esc B, entr. 2ª',
  city: 'Barcelona',
  postalCode: '08025',
  province: 'Barcelona',
  country: 'España',

  phone: '658 571 087',

  representatives: ['D. Santiago Miralbell Costa', 'D. Sergi Masoliver López'],
} as const

/** «C/ Provença 474, esc B, entr. 2ª, 08025 Barcelona» — propuestas y firmas. */
export const BUFFALO_ADDRESS_SHORT =
  `${BUFFALO.street}, ${BUFFALO.postalCode} ${BUFFALO.city}`

/** «… Barcelona (08025), Barcelona, España» — facturas y contratos. */
export const BUFFALO_ADDRESS_FULL =
  `${BUFFALO.street}, ${BUFFALO.city} (${BUFFALO.postalCode}), ${BUFFALO.province}, ${BUFFALO.country}`

/** Línea de comparecencia para el contrato (cláusula «Reunidos»). */
export const BUFFALO_LEGAL_LINE =
  `${BUFFALO.legalName}, CIF ${BUFFALO.cif}, ${BUFFALO_ADDRESS_FULL}, ` +
  `${BUFFALO.representatives.join(' y ')}.`

/** Bloque :::signatures de la plantilla BRM (propuestas). */
export function buffaloSignatureLines(clientLabel: string): string[] {
  return [
    ':::signatures',
    `client: ${clientLabel}`,
    `provider: ${BUFFALO.legalName}`,
    `provider_cif: ${BUFFALO.cif}`,
    `provider_address: ${BUFFALO_ADDRESS_SHORT}`,
    `provider_phone: ${BUFFALO.phone}`,
    ':::',
  ]
}

/** Etiqueta del cliente a partir de empresa/nombre, con respaldo. */
export function clientDisplayLabel(opts?: {
  clientName?: string | null
  clientCompany?: string | null
}): string {
  return [opts?.clientCompany, opts?.clientName].filter(Boolean).join(' · ') || 'Cliente'
}

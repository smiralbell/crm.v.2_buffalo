/**
 * Cuenta de Google de la agencia. Es la que conecta Calendar, Gmail y Drive del
 * CRM, y la misma para todos los admins aunque cada uno entre con su Google.
 * También sirve para entrar como administrador general (p. ej. para dar de
 * alta a los socios en Usuarios).
 */
export const AGENCY_GOOGLE_EMAIL = 'agenciabuffaloo@gmail.com'

/** Clave de las conexiones de Google compartidas por los admins. */
export const AGENCY_GOOGLE_OWNER_KEY = `admin:${AGENCY_GOOGLE_EMAIL}`

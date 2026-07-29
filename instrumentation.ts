/**
 * Instrumentation desactivado a propósito.
 * El import del sync bancario (crypto/pg) rompía el bundle de Next en dev
 * (500 en /login, /leads, etc.). El scheduler arranca desde /api/auth/me.
 */
export async function register() {
  // no-op
}

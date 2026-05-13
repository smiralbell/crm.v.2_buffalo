/**
 * Límites de lectura para la tabla de historial del agente (evitar cargas pesadas en Postgres).
 */
export const AGENT_CHAT_DEFAULT_PAGE_SIZE = 12
export const AGENT_CHAT_MAX_PAGE_SIZE = 30
/** Máximo de filas de mensaje por sesión en una sola respuesta API */
export const AGENT_CHAT_MAX_MESSAGES_PER_REQUEST = 500

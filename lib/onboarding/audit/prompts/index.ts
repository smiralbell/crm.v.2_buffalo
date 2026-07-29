import { AUDIT_BASE_PROMPT } from './base'
import { AUDIT_MODE_PROMPTS } from './modes'
import { AUDIT_CONTEXT_EXTRACT_PROMPT, AUDIT_GAPS_PROMPT } from './extract-and-gaps'
import type { AuditMode } from '../types'

export function buildModeSystemPrompt(mode: AuditMode): string {
  const modePrompt = AUDIT_MODE_PROMPTS[mode] || AUDIT_MODE_PROMPTS.descubrimiento
  return `${AUDIT_BASE_PROMPT}\n\n${modePrompt}`
}

export function buildExtractSystemPrompt(): string {
  return `${AUDIT_BASE_PROMPT}\n\n${AUDIT_CONTEXT_EXTRACT_PROMPT}`
}

export function buildGapsSystemPrompt(): string {
  return `${AUDIT_BASE_PROMPT}\n\n${AUDIT_GAPS_PROMPT}`
}

export { AUDIT_BASE_PROMPT, AUDIT_MODE_PROMPTS, AUDIT_CONTEXT_EXTRACT_PROMPT, AUDIT_GAPS_PROMPT }

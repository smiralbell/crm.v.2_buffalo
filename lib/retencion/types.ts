import type { RetencionAuditStatus, RetencionChatMessage } from './report-prompt'
import type { AuditChecklist } from './knowledge/checklist'

export type RetencionAgentConfigPublic = {
  proyecto_id: string
  audit_status: RetencionAuditStatus
  audit_knowledge: string
  audit_messages: RetencionChatMessage[]
  schema_summary: string
  report_prompt: string
  report_prompt_buffalo: string
  audit_checklist: AuditChecklist
  db_connected: boolean
  db_host: string | null
  db_name: string | null
  db_connected_at: string | null
  updated_at: string
}

import { collectCrmKnowledge, pickCrmSection } from './collect-crm'
import { renderCrmKnowledgeMarkdown, upsertKnowledgeSection } from './render'
import { KNOWLEDGE_SECTIONS, type KnowledgeSectionId } from './template'
import { getOrCreateAgentConfig, toPublicConfig, updateAgentConfig } from '../agent-config-store'
import {
  checklistAllGreen,
  mergeChecklistPatch,
  type ChecklistItemId,
} from './checklist'

const SECTION_BY_ID = Object.fromEntries(
  KNOWLEDGE_SECTIONS.map((s) => [s.id, s.title])
) as Record<KnowledgeSectionId, string>

export async function toolLoadCrmKnowledge(
  proyectoId: string,
  args: { source?: string; as_markdown?: boolean }
): Promise<unknown> {
  const bundle = await collectCrmKnowledge(proyectoId)
  const source = (args.source || 'all').trim()
  if (args.as_markdown && (source === 'all' || source === 'bundle')) {
    return {
      ok: true,
      collected_at: bundle.collected_at,
      sources_ok: bundle.sources_ok,
      sources_missing: bundle.sources_missing,
      markdown: renderCrmKnowledgeMarkdown(bundle),
    }
  }
  return {
    ok: true,
    collected_at: bundle.collected_at,
    sources_ok: bundle.sources_ok,
    sources_missing: bundle.sources_missing,
    data: pickCrmSection(bundle, source),
  }
}

export async function toolSeedKnowledgeFromCrm(
  proyectoId: string,
  args: { overwrite?: boolean; mark_ready?: boolean }
): Promise<unknown> {
  const bundle = await collectCrmKnowledge(proyectoId)
  const markdown = renderCrmKnowledgeMarkdown(bundle)
  const cfg = await getOrCreateAgentConfig(proyectoId)
  const current = (cfg.audit_knowledge || '').trim()
  const overwrite = args.overwrite === true
  const tooShort = current.length < 200

  if (!overwrite && !tooShort) {
    return {
      ok: true,
      skipped: true,
      reason: 'Ya hay contexto guardado. Usa overwrite=true o merge_knowledge_section.',
      current_length: current.length,
      seed_length: markdown.length,
      sources_ok: bundle.sources_ok,
    }
  }

  const mark_ready = args.mark_ready === true || markdown.length >= 800
  await updateAgentConfig(proyectoId, {
    audit_knowledge: markdown,
    audit_status: mark_ready ? 'ready' : 'discovery',
  })

  return {
    ok: true,
    seeded: true,
    length: markdown.length,
    audit_status: mark_ready ? 'ready' : 'discovery',
    sources_ok: bundle.sources_ok,
    sources_missing: bundle.sources_missing,
  }
}

export async function toolMergeKnowledgeSection(
  proyectoId: string,
  args: { section_id?: string; content?: string; mark_ready?: boolean }
): Promise<unknown> {
  const sectionId = String(args.section_id || '').trim() as KnowledgeSectionId
  const content = String(args.content || '').trim()
  if (!sectionId || !content) {
    return { error: 'section_id y content son obligatorios' }
  }
  const title = SECTION_BY_ID[sectionId]
  if (!title) {
    return {
      error: `section_id inválido. Usa: ${Object.keys(SECTION_BY_ID).join(', ')}`,
    }
  }

  const cfg = await getOrCreateAgentConfig(proyectoId)
  let doc = cfg.audit_knowledge || ''
  if (!doc.trim()) {
    doc = `# Contexto del proyecto\n\n`
  }
  const next = upsertKnowledgeSection(doc, title, content)
  const mark_ready =
    args.mark_ready === true || next.trim().length >= 600

  await updateAgentConfig(proyectoId, {
    audit_knowledge: next,
    audit_status: mark_ready ? 'ready' : cfg.audit_status === 'pending' ? 'discovery' : undefined,
  })

  return {
    ok: true,
    section_id: sectionId,
    section_title: title,
    length: next.length,
    audit_status: mark_ready ? 'ready' : cfg.audit_status,
  }
}

export async function toolUpdateAuditChecklist(
  proyectoId: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const cfg = await getOrCreateAgentConfig(proyectoId)
  const patch: Partial<
    Record<ChecklistItemId, { ok: boolean; detail?: string }>
  > = {}

  for (const id of ['db_access', 'roi_resolved', 'project_understood'] as ChecklistItemId[]) {
    const raw = args[id]
    if (!raw || typeof raw !== 'object') continue
    const item = raw as { ok?: boolean; detail?: string }
    if (typeof item.ok !== 'boolean') continue
    patch[id] = { ok: item.ok, detail: item.detail }
  }

  if (!Object.keys(patch).length) {
    return {
      error:
        'Indica al menos un ítem: db_access, roi_resolved o project_understood con { ok, detail }',
    }
  }

  const merged = mergeChecklistPatch(cfg.audit_checklist, patch)
  await updateAgentConfig(proyectoId, { audit_checklist: merged })

  const publicCfg = toPublicConfig(await getOrCreateAgentConfig(proyectoId))
  return {
    ok: true,
    checklist: publicCfg.audit_checklist,
    all_green: checklistAllGreen(publicCfg.audit_checklist),
  }
}

/** Seed al iniciar auditoría (API). */
export async function seedKnowledgeOnAuditStart(proyectoId: string): Promise<{
  seeded: boolean
  length: number
}> {
  const result = (await toolSeedKnowledgeFromCrm(proyectoId, {
    overwrite: false,
    mark_ready: false,
  })) as { seeded?: boolean; skipped?: boolean; length?: number; seed_length?: number }

  return {
    seeded: Boolean(result.seeded),
    length: result.length || result.seed_length || 0,
  }
}

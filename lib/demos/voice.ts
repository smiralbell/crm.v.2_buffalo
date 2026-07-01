import {
  retellDeleteVoiceResources,
  retellProvisionVoiceDemo,
  retellUpdateAgentVoice,
  retellUpdateKnowledgeBase,
  retellUpdateLlm,
} from './retell'
import {
  createDemo,
  deleteDemo,
  getDemoById,
  updateDemo,
  updateDemoRetellIds,
} from './store'
import type { DemoInput, DemoListItem, DemoSaveOptions } from './types'

export async function createVoiceDemo(
  input: DemoInput,
  options?: DemoSaveOptions
): Promise<DemoListItem> {
  if (!input.voz_id?.trim()) {
    throw new Error('El Voice ID de Retell es obligatorio para demos de voz')
  }
  if (!input.direccion) {
    throw new Error('La dirección (inbound/outbound) es obligatoria para demos de voz')
  }

  const demo = await createDemo(
    {
      ...input,
      tipo: 'voz',
      voz_id: input.voz_id.trim(),
      direccion: input.direccion,
    },
    options
  )

  try {
    const retell = await retellProvisionVoiceDemo(
      {
        nombre_cliente: demo.nombre_cliente,
        prompt: demo.prompt,
        base_conocimiento: demo.base_conocimiento,
        voz_id: input.voz_id.trim(),
      },
      demo.id
    )

    await updateDemoRetellIds(demo.id, {
      retell_agent_id: retell.agent_id,
      retell_llm_id: retell.llm_id,
      retell_kb_id: retell.knowledge_base_id,
    })
  } catch (err) {
    await deleteDemo(demo.id)
    throw err
  }

  const updated = await getDemoById(demo.id)
  if (!updated) throw new Error('Demo no encontrada tras crear recursos Retell')
  return updated
}

export async function updateVoiceDemoInRetell(
  existing: DemoListItem,
  input: Partial<DemoInput>
): Promise<void> {
  if (existing.tipo !== 'voz') return

  const prompt = input.prompt ?? existing.prompt
  const base = input.base_conocimiento ?? existing.base_conocimiento
  const nombre = input.nombre_cliente ?? existing.nombre_cliente
  const vozId = input.voz_id ?? existing.voz_id

  const promptChanged = input.prompt !== undefined && input.prompt !== existing.prompt
  const baseChanged =
    input.base_conocimiento !== undefined && input.base_conocimiento !== existing.base_conocimiento
  const vozChanged = input.voz_id !== undefined && input.voz_id !== existing.voz_id

  if (!existing.retell_llm_id || !existing.retell_kb_id || !existing.retell_agent_id) {
    throw new Error('Esta demo de voz no tiene recursos Retell configurados')
  }

  if (baseChanged) {
    await retellUpdateKnowledgeBase(existing.retell_kb_id, nombre, base, existing.id)
  }

  if (promptChanged || baseChanged) {
    await retellUpdateLlm(existing.retell_llm_id, prompt, existing.retell_kb_id, existing.id)
  }

  if (vozChanged && vozId) {
    await retellUpdateAgentVoice(existing.retell_agent_id, vozId, existing.id)
  }
}

export async function deleteVoiceDemo(demoId: number): Promise<boolean> {
  const demo = await getDemoById(demoId)
  if (!demo) return false

  if (demo.tipo === 'voz') {
    await retellDeleteVoiceResources({
      agent_id: demo.retell_agent_id,
      llm_id: demo.retell_llm_id,
      knowledge_base_id: demo.retell_kb_id,
    })
  }

  return deleteDemo(demoId)
}

import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildDefaultContractAnnex } from '@/lib/onboarding/contract-annex-default'
import {
  formatContractDate,
  parseContractDraft,
  stringifyContract,
  type ContractParty,
  type ContractServiceDoc,
} from '@/lib/onboarding/contract-annex-types'
import {
  applyPatches,
  tryLocalPatches,
  type ContractPatch,
} from '@/lib/onboarding/contract-patches'
import {
  CONTRACT_EDIT_SYSTEM,
  CONTRACT_GENERATE_SYSTEM,
} from '@/lib/onboarding/contract-prompt'

export type ContractAnnexMeta = {
  context: string
  definition: string
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  clientCif?: string | null
  clientAddress?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  paymentSplit?: '50_50' | '100_upfront' | null
  extraInstructions?: string | null
}

function clientPartyFromMeta(meta: ContractAnnexMeta): ContractParty {
  const legal =
    (meta.clientCompany || '').trim() ||
    (meta.clientName || '').trim() ||
    'Cliente (a completar)'
  const rep = (meta.clientName || '').trim()
    ? `D. ${meta.clientName!.trim()}`
    : 'Representante legal (a completar)'
  return {
    legal_name: legal,
    cif: (meta.clientCif || '').trim() || 'A completar',
    address: (meta.clientAddress || '').trim() || 'A completar',
    representative: rep,
  }
}

function coerceDoc(raw: unknown, fallback: ContractServiceDoc): ContractServiceDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<ContractServiceDoc>
  if (!Array.isArray(d.clauses) || d.clauses.length < 8) return null
  return {
    ...fallback,
    ...d,
    version: 1,
    doc_type: 'service_contract',
    client: { ...fallback.client, ...(d.client || {}) },
    buffalo: { ...fallback.buffalo, ...(d.buffalo || {}) },
    signatures: { ...fallback.signatures, ...(d.signatures || {}) },
    exponen: Array.isArray(d.exponen) && d.exponen.length ? d.exponen : fallback.exponen,
    exponen_closing:
      typeof d.exponen_closing === 'string' && d.exponen_closing.trim()
        ? d.exponen_closing
        : fallback.exponen_closing ||
          'En virtud de lo anterior, las partes acuerdan las siguientes:',
    clauses: d.clauses as ContractServiceDoc['clauses'],
  }
}

function ensureClosing(doc: ContractServiceDoc): ContractServiceDoc {
  if (!doc.exponen_closing) {
    doc.exponen_closing = 'En virtud de lo anterior, las partes acuerdan las siguientes:'
  }
  return doc
}

/** Genera el contrato de prestación de servicios adaptado al cliente + proyecto. */
export async function generateContractAnnex(meta: ContractAnnexMeta): Promise<string> {
  const client = clientPartyFromMeta(meta)
  const fallback = ensureClosing(
    buildDefaultContractAnnex({
      client,
      placeDate: formatContractDate(),
      setupFeeEur: meta.setupFee,
      monthlyFeeEur: meta.monthlyFee,
      paymentSplit: meta.paymentSplit,
    })
  )

  if (!meta.definition.trim() && !meta.context.trim()) {
    return stringifyContract(fallback)
  }

  const user = [
    meta.projectName ? `Proyecto: ${meta.projectName}` : null,
    `Cliente CRM: ${[meta.clientCompany, meta.clientName].filter(Boolean).join(' · ') || '(sin nombre)'}`,
    meta.clientCif ? `CIF: ${meta.clientCif}` : null,
    meta.clientAddress ? `Dirección: ${meta.clientAddress}` : null,
    meta.setupFee != null && meta.setupFee > 0 ? `Setup (€): ${meta.setupFee}` : null,
    meta.monthlyFee != null && meta.monthlyFee > 0
      ? `Mensualidad (€): ${meta.monthlyFee}`
      : null,
    meta.paymentSplit ? `Forma de pago: ${meta.paymentSplit}` : null,
    meta.extraInstructions?.trim()
      ? `Instrucciones del comercial:\n${meta.extraInstructions.trim()}`
      : null,
    '---',
    'DEFINICIÓN DEL PROYECTO:',
    meta.definition.trim() || '(vacía)',
    '---',
    'CONTEXTO:',
    meta.context.trim() || '(vacío)',
    '---',
    'Plantilla base:',
    stringifyContract(fallback),
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const raw = await openRouterChatCompletion(
      [
        { role: 'system', content: CONTRACT_GENERATE_SYSTEM },
        { role: 'user', content: user },
      ],
      { temperature: 0.25, maxTokens: 12000 }
    )
    const parsed = parseJsonFromModelOutput(raw)
    const doc = coerceDoc(parsed, fallback)
    return stringifyContract(ensureClosing(doc || fallback))
  } catch {
    return stringifyContract(fallback)
  }
}

/** Edición por chat del contrato. */
export async function reviseContractAnnexWithChat(input: {
  draft: string
  instruction: string
  meta: ContractAnnexMeta
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{ content: string; note: string }> {
  const instruction = input.instruction.trim()
  if (!instruction) throw new Error('Instrucción vacía')

  const client = clientPartyFromMeta(input.meta)
  const fallback = ensureClosing(
    parseContractDraft(input.draft) ||
      buildDefaultContractAnnex({
        client,
        placeDate: formatContractDate(),
        setupFeeEur: input.meta.setupFee,
        monthlyFeeEur: input.meta.monthlyFee,
        paymentSplit: input.meta.paymentSplit,
      })
  )

  const before = stringifyContract(fallback)

  const local = tryLocalPatches(instruction, fallback)
  if (local) {
    const { doc, applied, errors } = applyPatches(fallback, local)
    const after = stringifyContract(ensureClosing(doc))
    if (applied > 0 && after !== before) {
      return {
        content: after,
        note:
          local[0]?.op === 'clear_exponen_red'
            ? 'He quitado el rojo.'
            : local[0]?.op === 'mark_red' || local[0]?.op === 'mark_exponen_red'
              ? 'He aplicado el rojo sobre el texto indicado.'
              : 'Cambio aplicado.',
      }
    }
    void errors
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: CONTRACT_EDIT_SYSTEM },
  ]
  for (const m of (input.history || []).slice(-6)) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({
    role: 'user',
    content: [
      `METADATOS:\n${[
        input.meta.projectName ? `Proyecto: ${input.meta.projectName}` : null,
        `Cliente: ${[input.meta.clientCompany, input.meta.clientName].filter(Boolean).join(' · ')}`,
        input.meta.definition?.trim()
          ? `Definición:\n${input.meta.definition.trim().slice(0, 2000)}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')}`,
      `Zonas editables: title, place_date, reunidos_closing, exponen (I/II/III), exponen_closing ("En virtud…"), clauses primera…decimocuarta, signatures.`,
      `MAPA:\n${fallback.clauses.map((c, i) => `${i + 1}. ${c.id} — ${c.title}`).join('\n')}`,
      `DOCUMENTO JSON:\n${before}`,
      `─────\nINSTRUCCIÓN:\n${instruction}`,
      `Usa mark_red / replace_text para cambios naturales. Preferible respuesta corta con patches.`,
    ].join('\n\n'),
  })

  const raw = await openRouterChatCompletion(messages, { temperature: 0.15, maxTokens: 8000 })

  let parsed: {
    note?: string
    patches?: ContractPatch[]
    doc?: unknown
    content?: unknown
  }
  try {
    parsed = parseJsonFromModelOutput(raw) as typeof parsed
  } catch {
    return {
      content: before,
      note: 'No pude leer la respuesta. Prueba pegando el texto exacto y la orden (ej. «en rojo»).',
    }
  }

  if (Array.isArray(parsed.patches) && parsed.patches.length > 0) {
    const { doc, applied, errors } = applyPatches(fallback, parsed.patches)
    const after = stringifyContract(ensureClosing(doc))
    if (applied === 0 || after === before) {
      return {
        content: before,
        note:
          errors[0] ||
          'No pude aplicar el cambio. Pega el fragmento exacto del contrato y di qué hacer (rojo / alargar / cambiar por …).',
      }
    }
    return {
      content: after,
      note: String(parsed.note || `Aplicados ${applied} cambio(s)`).trim(),
    }
  }

  const full = coerceDoc(parsed.doc ?? parsed.content ?? parsed, fallback)
  if (full) {
    const after = stringifyContract(ensureClosing(full))
    if (after === before) {
      return {
        content: before,
        note: 'Sin cambios detectados. Sé más concreto o pega el texto a editar.',
      }
    }
    return {
      content: after,
      note: String(parsed.note || 'Documento actualizado').trim(),
    }
  }

  return {
    content: before,
    note: 'No se pudo aplicar el cambio. Reformula en una frase clara.',
  }
}

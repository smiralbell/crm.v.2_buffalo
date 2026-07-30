/** Modelo del Contrato de prestación de servicios de IA (plantilla CONTRATO/). */

export type ContractBlock =
  | { type: 'p'; html: string }
  | { type: 'amount'; html: string }
  | { type: 'sublabel'; html: string }
  | { type: 'list'; style: 'numbered' | 'dash'; items: string[] }
  | {
      type: 'ins'
      blocks: Array<
        | { type: 'p'; html: string }
        | { type: 'sublabel'; html: string }
        | { type: 'list'; style: 'numbered' | 'dash'; items: string[] }
      >
    }

export type ContractClause = {
  id: string
  title: string
  blocks: ContractBlock[]
}

export type ContractParty = {
  legal_name: string
  cif: string
  address: string
  representative: string
}

export type ContractServiceDoc = {
  version: 1
  /** Distingue del antiguo Anexo DPA */
  doc_type: 'service_contract'
  title: string
  place_date: string
  client: ContractParty
  buffalo: ContractParty
  reunidos_closing: string
  reunidos_closing_red?: boolean
  /** Exponen I, II, III… (`red: true` = texto en rojo / enmienda) */
  exponen: Array<{ label: string; html: string; red?: boolean }>
  /** Cierre tras Exponen, p.ej. «En virtud de lo anterior…» */
  exponen_closing: string
  exponen_closing_red?: boolean
  clauses: ContractClause[]
  signatures: {
    client_name: string
    client_role: string
    client_cif: string
  }
  conformity_note?: string
}

export const BUFFALO_PARTY: ContractParty = {
  legal_name: 'Buffalo IA Global Digital Solutions, S.L.',
  cif: 'B22944599',
  address: 'Calle Provença, Pta. 2 Esc. B — 08025 (Barcelona)',
  representative: 'D. Santiago Miralbell Costa y D. Sergi Masoliver López',
}

/** Orden de páginas de la plantilla Contrato Buffalo (8 páginas). */
export const CONTRACT_PAGE_PACKS: Array<{ label: string; blocks: string[] }> = [
  { label: 'Reunidos · Exponen', blocks: ['reunidos'] },
  { label: 'Cláusulas', blocks: ['primera'] },
  { label: 'Cláusulas', blocks: ['segunda', 'tercera', 'cuarta'] },
  { label: 'Cláusulas', blocks: ['quinta'] },
  { label: 'Cláusulas', blocks: ['sexta', 'septima'] },
  { label: 'Cláusulas', blocks: ['octava', 'novena'] },
  { label: 'Cláusulas', blocks: ['decima', 'undecima', 'duodecima', 'decimotercera'] },
  { label: 'Firmas', blocks: ['decimocuarta', '__firmas'] },
]

export const CONTRACT_CLAUSE_IDS = [
  'primera',
  'segunda',
  'tercera',
  'cuarta',
  'quinta',
  'sexta',
  'septima',
  'octava',
  'novena',
  'decima',
  'undecima',
  'duodecima',
  'decimotercera',
  'decimocuarta',
] as const

export function formatContractDate(d = new Date()): string {
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Alias legacy para no romper imports antiguos. */
export const formatAnnexDate = formatContractDate

export function formatMoneyLine(amountEur: number): string {
  const n = Math.round(amountEur)
  const formatted = n.toLocaleString('es-ES')
  return `${formatted} € + IVA`
}

export function parseContractDraft(raw: string): ContractServiceDoc | null {
  const s = (raw || '').trim()
  if (!s) return null
  try {
    const parsed = JSON.parse(s) as Partial<ContractServiceDoc>
    if (
      parsed?.version === 1 &&
      parsed.doc_type === 'service_contract' &&
      Array.isArray(parsed.clauses)
    ) {
      const doc = parsed as ContractServiceDoc
      if (!doc.exponen_closing) {
        doc.exponen_closing =
          'En virtud de lo anterior, las partes acuerdan las siguientes:'
      }
      return doc
    }
  } catch {
    /* not JSON */
  }
  return null
}

/** @deprecated usar parseContractDraft */
export const parseContractAnnexDraft = parseContractDraft

export function stringifyContract(doc: ContractServiceDoc): string {
  return JSON.stringify(doc, null, 2)
}

/** @deprecated usar stringifyContract */
export const stringifyContractAnnex = stringifyContract

/** Tipos legacy (alias) */
export type AnnexBlock = ContractBlock
export type AnnexClause = ContractClause
export type AnnexParty = ContractParty
export type ContractAnnexDoc = ContractServiceDoc

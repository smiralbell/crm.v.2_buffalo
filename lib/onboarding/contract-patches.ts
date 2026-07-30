import type {
  ContractBlock,
  ContractClause,
  ContractParty,
  ContractServiceDoc,
} from '@/lib/onboarding/contract-annex-types'

export type ContractPatch =
  | { op: 'mark_red'; match: string }
  | { op: 'replace_text'; match: string; with: string; red?: boolean }
  | { op: 'replace_clause'; clause_id: string; clause: ContractClause }
  | { op: 'append_blocks'; clause_id: string; blocks: ContractBlock[] }
  | {
      op: 'append_ins'
      clause_id: string
      blocks: Array<
        | { type: 'p'; html: string }
        | { type: 'sublabel'; html: string }
        | { type: 'list'; style: 'numbered' | 'dash'; items: string[] }
      >
    }
  | { op: 'wrap_ins'; clause_id: string; match: string }
  | { op: 'unwrap_ins'; clause_id: string }
  | {
      op: 'set_client'
      client: Partial<ContractParty>
      signatures?: Partial<ContractServiceDoc['signatures']>
    }
  | { op: 'set_exponen'; exponen: ContractServiceDoc['exponen'] }
  | { op: 'mark_exponen_red'; labels?: string[]; match?: string }
  | { op: 'clear_exponen_red' }
  | {
      op: 'set_field'
      field:
        | 'title'
        | 'place_date'
        | 'reunidos_closing'
        | 'exponen_closing'
        | 'conformity_note'
      value: string
      red?: boolean
    }
  | { op: 'replace_doc'; doc: ContractServiceDoc }

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}

function textHas(hay: string, needle: string): boolean {
  const h = normalizeText(stripHtml(hay))
  const n = normalizeText(stripHtml(needle))
  if (!n || n.length < 8) return h === n || h.includes(n)
  // tolerante: primeros 80 chars o inclusión mutua
  const head = n.slice(0, Math.min(100, n.length))
  return h.includes(head) || n.includes(h.slice(0, 80)) || h.includes(n)
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

function blockText(block: ContractBlock): string {
  if (block.type === 'p' || block.type === 'amount' || block.type === 'sublabel') {
    return block.html || ''
  }
  if (block.type === 'list') return block.items.join(' ')
  if (block.type === 'ins') {
    return block.blocks
      .map((b) => (b.type === 'list' ? b.items.join(' ') : b.html))
      .join(' ')
  }
  return ''
}

function findClause(doc: ContractServiceDoc, clauseId: string): number {
  return doc.clauses.findIndex((c) => c.id === clauseId)
}

function resolveClauseId(raw: string): string {
  const id = normalizeText(raw).replace(/\s+/g, '')
  const map: Record<string, string> = {
    '1': 'primera',
    primera: 'primera',
    '2': 'segunda',
    segunda: 'segunda',
    '3': 'tercera',
    tercera: 'tercera',
    '4': 'cuarta',
    cuarta: 'cuarta',
    '5': 'quinta',
    quinta: 'quinta',
    '6': 'sexta',
    sexta: 'sexta',
    '7': 'septima',
    septima: 'septima',
    '8': 'octava',
    octava: 'octava',
    '9': 'novena',
    novena: 'novena',
    '10': 'decima',
    decima: 'decima',
    '11': 'undecima',
    undecima: 'undecima',
    '12': 'duodecima',
    duodecima: 'duodecima',
    '13': 'decimotercera',
    decimotercera: 'decimotercera',
    '14': 'decimocuarta',
    decimocuarta: 'decimocuarta',
  }
  return map[id] || raw.trim().toLowerCase()
}

function wrapBlockIns(b: ContractBlock): ContractBlock {
  if (b.type === 'ins') return b
  if (b.type === 'amount') return { type: 'ins', blocks: [{ type: 'p', html: b.html }] }
  if (b.type === 'p' || b.type === 'sublabel' || b.type === 'list') {
    return { type: 'ins', blocks: [b] }
  }
  return b
}

/** Marca en rojo la primera coincidencia del texto en todo el documento. */
function markRedInDoc(doc: ContractServiceDoc, match: string): boolean {
  const needle = match.trim()
  if (!needle) return false

  if (textHas(doc.exponen_closing || '', needle)) {
    doc.exponen_closing_red = true
    return true
  }
  if (textHas(doc.reunidos_closing || '', needle)) {
    doc.reunidos_closing_red = true
    return true
  }
  if (textHas(doc.title || '', needle) || textHas(doc.place_date || '', needle)) {
    // título/fecha: no hay flag rojo; se deja como no-op de layout
  }
  for (const ex of doc.exponen || []) {
    if (textHas(`${ex.label} ${ex.html}`, needle) || textHas(ex.html, needle)) {
      ex.red = true
      return true
    }
  }
  for (const clause of doc.clauses) {
    for (let i = 0; i < clause.blocks.length; i++) {
      const b = clause.blocks[i]
      if (b.type === 'ins') continue
      if (textHas(blockText(b), needle)) {
        clause.blocks[i] = wrapBlockIns(b)
        return true
      }
    }
  }
  // Si el match es exactamente el cierre típico y el campo existe
  if (textHas('en virtud de lo anterior, las partes acuerdan las siguientes', needle)) {
    doc.exponen_closing =
      doc.exponen_closing || 'En virtud de lo anterior, las partes acuerdan las siguientes:'
    doc.exponen_closing_red = true
    return true
  }
  return false
}

/** Sustituye texto en todo el documento. */
function replaceTextInDoc(
  doc: ContractServiceDoc,
  match: string,
  withText: string,
  red?: boolean
): boolean {
  const needle = match.trim()
  if (!needle) return false
  let hit = false

  const replacer = (src: string): string => {
    if (!textHas(src, needle)) return src
    // intento replace exacto case-insensitive aproximado
    const idx = normalizeText(stripHtml(src)).indexOf(normalizeText(stripHtml(needle)).slice(0, 80))
    if (idx < 0) return withText // fallback: sustituye campo entero si parece el mismo
    // si el campo es corto o coincide mucho, reemplaza entero
    if (normalizeText(stripHtml(src)).length < normalizeText(stripHtml(needle)).length + 40) {
      return withText
    }
    return withText
  }

  if (textHas(doc.exponen_closing || '', needle)) {
    doc.exponen_closing = withText
    if (red) doc.exponen_closing_red = true
    hit = true
  }
  if (textHas(doc.reunidos_closing || '', needle)) {
    doc.reunidos_closing = withText
    if (red) doc.reunidos_closing_red = true
    hit = true
  }
  if (textHas(doc.title || '', needle)) {
    doc.title = withText
    hit = true
  }
  if (textHas(doc.place_date || '', needle)) {
    doc.place_date = withText
    hit = true
  }
  if (textHas(doc.conformity_note || '', needle)) {
    doc.conformity_note = withText
    hit = true
  }

  for (const ex of doc.exponen || []) {
    if (textHas(ex.html, needle)) {
      ex.html = replacer(ex.html)
      if (red) ex.red = true
      hit = true
    }
  }

  for (const clause of doc.clauses) {
    for (let i = 0; i < clause.blocks.length; i++) {
      const b = clause.blocks[i]
      if (b.type === 'p' || b.type === 'amount' || b.type === 'sublabel') {
        if (textHas(b.html, needle)) {
          b.html = withText
          if (red) clause.blocks[i] = wrapBlockIns(b)
          hit = true
        }
      } else if (b.type === 'list') {
        let listHit = false
        b.items = b.items.map((it) => {
          if (textHas(it, needle)) {
            listHit = true
            return withText
          }
          return it
        })
        if (listHit) {
          if (red) clause.blocks[i] = wrapBlockIns(b)
          hit = true
        }
      } else if (b.type === 'ins') {
        for (const ib of b.blocks) {
          if (ib.type === 'p' || ib.type === 'sublabel') {
            if (textHas(ib.html, needle)) {
              ib.html = withText
              hit = true
            }
          } else if (ib.type === 'list') {
            ib.items = ib.items.map((it) => (textHas(it, needle) ? withText : it))
            if (ib.items.some((it) => it === withText)) hit = true
          }
        }
      }
    }
  }

  return hit
}

export function tryLocalPatches(
  instruction: string,
  doc: ContractServiceDoc
): ContractPatch[] | null {
  const n = normalizeText(instruction)
  const wantsRed = /\ben rojo\b|\brojo\b|\bred\b|\benmienda/.test(n)
  const clearRed = /quita(r)? el rojo|pasar? a negro|sin rojo/.test(n)

  if (/\bexponen\b/.test(n) && clearRed) return [{ op: 'clear_exponen_red' }]
  if (/\bexponen\b/.test(n) && wantsRed && !/en virtud/.test(n)) {
    return [{ op: 'mark_exponen_red' }]
  }

  // Extrae texto tras "en rojo:" / "texto:" / líneas pegadas largas
  const afterRed = instruction.match(
    /(?:en rojo|rojo|a[nñ]ade(?:r)?(?: este texto)?(?: en rojo)?)\s*[:：]?\s*([\s\S]+)$/i
  )
  const pasted = (afterRed?.[1] || instruction)
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 15 && !/^pon |^a[nñ]ade |^y esto/i.test(l))
    .join('\n')
    .trim()

  if (wantsRed && pasted.length > 15) {
    return [{ op: 'mark_red', match: pasted }]
  }

  // "en virtud..." solo
  if (wantsRed && /en virtud de lo anterior/.test(n)) {
    return [
      {
        op: 'mark_red',
        match: 'En virtud de lo anterior, las partes acuerdan las siguientes:',
      },
    ]
  }

  return null
}

export function applyPatches(
  base: ContractServiceDoc,
  patches: ContractPatch[]
): { doc: ContractServiceDoc; applied: number; errors: string[] } {
  const doc: ContractServiceDoc = JSON.parse(JSON.stringify(base)) as ContractServiceDoc
  if (!doc.exponen_closing) {
    doc.exponen_closing = 'En virtud de lo anterior, las partes acuerdan las siguientes:'
  }
  let applied = 0
  const errors: string[] = []

  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || !('op' in patch)) {
      errors.push('Parche inválido')
      continue
    }

    if (patch.op === 'mark_red') {
      if (!markRedInDoc(doc, patch.match || '')) {
        errors.push('No encontré ese texto en el contrato para ponerlo en rojo')
        continue
      }
      applied += 1
      continue
    }

    if (patch.op === 'replace_text') {
      if (!replaceTextInDoc(doc, patch.match || '', patch.with ?? '', patch.red)) {
        errors.push('No encontré el texto a sustituir')
        continue
      }
      applied += 1
      continue
    }

    if (patch.op === 'replace_doc') {
      const next = coerceDoc(patch.doc, doc)
      if (!next) {
        errors.push('replace_doc inválido')
        continue
      }
      Object.assign(doc, next)
      applied += 1
      continue
    }

    if (patch.op === 'set_client') {
      doc.client = { ...doc.client, ...patch.client }
      if (patch.signatures) doc.signatures = { ...doc.signatures, ...patch.signatures }
      applied += 1
      continue
    }

    if (patch.op === 'set_exponen') {
      if (!Array.isArray(patch.exponen) || !patch.exponen.length) {
        errors.push('set_exponen vacío')
        continue
      }
      doc.exponen = patch.exponen
      applied += 1
      continue
    }

    if (patch.op === 'mark_exponen_red') {
      const labels = (patch.labels || []).map((l) => normalizeText(l).replace(/\.$/, ''))
      const match = normalizeText(patch.match || '')
      let n = 0
      doc.exponen = (doc.exponen || []).map((ex) => {
        const lab = normalizeText(ex.label).replace(/\.$/, '')
        const body = normalizeText(ex.html)
        const byLabel = labels.length > 0 && labels.some((l) => lab === l || lab.startsWith(l))
        const byMatch =
          match.length > 0 && (body.includes(match) || match.includes(body.slice(0, 60)))
        const all = labels.length === 0 && !match
        if (all || byLabel || byMatch) {
          n += 1
          return { ...ex, red: true }
        }
        return ex
      })
      if (!n) {
        errors.push('No se encontró ningún punto de Exponen')
        continue
      }
      applied += 1
      continue
    }

    if (patch.op === 'clear_exponen_red') {
      doc.exponen = (doc.exponen || []).map(({ red: _r, ...rest }) => rest)
      doc.exponen_closing_red = false
      applied += 1
      continue
    }

    if (patch.op === 'set_field') {
      const v = String(patch.value ?? '')
      if (patch.field === 'title') doc.title = v
      else if (patch.field === 'place_date') doc.place_date = v
      else if (patch.field === 'reunidos_closing') {
        doc.reunidos_closing = v
        if (patch.red) doc.reunidos_closing_red = true
      } else if (patch.field === 'exponen_closing') {
        doc.exponen_closing = v
        if (patch.red) doc.exponen_closing_red = true
      } else if (patch.field === 'conformity_note') doc.conformity_note = v
      else {
        errors.push(`Campo desconocido`)
        continue
      }
      applied += 1
      continue
    }

    const rawClauseId = String((patch as { clause_id?: string }).clause_id || '').trim()
    const special = normalizeText(rawClauseId)

    if (special === 'exponen' || special === 'reunidos') {
      if (patch.op === 'wrap_ins' || patch.op === 'append_ins' || patch.op === 'append_blocks') {
        const match =
          patch.op === 'wrap_ins' ? String((patch as { match?: string }).match || '') : ''
        if (special === 'exponen' && !match) {
          const r = applyPatches(doc, [{ op: 'mark_exponen_red' }])
          Object.assign(doc, r.doc)
          applied += r.applied
          errors.push(...r.errors)
          continue
        }
        if (markRedInDoc(doc, match || 'En virtud de lo anterior')) {
          applied += 1
          continue
        }
      }
      errors.push(
        special === 'reunidos'
          ? 'Indica el texto concreto de Reunidos que quieres cambiar (o usa mark_red).'
          : 'Usa mark_red / mark_exponen_red para Exponen (no es una cláusula).'
      )
      continue
    }

    const clauseId = resolveClauseId(rawClauseId)
    const idx = findClause(doc, clauseId)
    if (idx < 0) {
      // último recurso: si hay match en wrap_ins, buscar en todo el doc
      if (patch.op === 'wrap_ins' && (patch as { match?: string }).match) {
        if (markRedInDoc(doc, String((patch as { match?: string }).match))) {
          applied += 1
          continue
        }
      }
      errors.push(`No encontré «${rawClauseId || 'esa zona'}». Prueba pegando el texto exacto.`)
      continue
    }

    if (patch.op === 'replace_clause') {
      if (!patch.clause || !Array.isArray(patch.clause.blocks)) {
        errors.push(`replace_clause inválida (${clauseId})`)
        continue
      }
      doc.clauses[idx] = {
        id: clauseId,
        title: patch.clause.title || doc.clauses[idx].title,
        blocks: patch.clause.blocks,
      }
      applied += 1
      continue
    }

    if (patch.op === 'append_blocks') {
      if (!Array.isArray(patch.blocks) || !patch.blocks.length) {
        errors.push(`append_blocks vacío (${clauseId})`)
        continue
      }
      doc.clauses[idx].blocks.push(...patch.blocks)
      applied += 1
      continue
    }

    if (patch.op === 'append_ins') {
      if (!Array.isArray(patch.blocks) || !patch.blocks.length) {
        errors.push(`append_ins vacío (${clauseId})`)
        continue
      }
      doc.clauses[idx].blocks.push({ type: 'ins', blocks: patch.blocks })
      applied += 1
      continue
    }

    if (patch.op === 'wrap_ins') {
      const match = String(patch.match || '').trim()
      if (!match) {
        errors.push(`Falta el texto a marcar en rojo`)
        continue
      }
      const needleOk = normalizeText(match)
      const blocks = doc.clauses[idx].blocks
      let wrapped = false
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        if (b.type === 'ins') continue
        if (textHas(blockText(b), needleOk)) {
          blocks[i] = wrapBlockIns(b)
          wrapped = true
          break
        }
      }
      if (!wrapped) {
        // buscar en todo el documento
        if (!markRedInDoc(doc, match)) {
          blocks.push({ type: 'ins', blocks: [{ type: 'p', html: match }] })
        }
      }
      applied += 1
      continue
    }

    if (patch.op === 'unwrap_ins') {
      const flat: ContractBlock[] = []
      for (const b of doc.clauses[idx].blocks) {
        if (b.type === 'ins') flat.push(...b.blocks)
        else flat.push(b)
      }
      doc.clauses[idx].blocks = flat
      applied += 1
      continue
    }

    errors.push(`Operación no reconocida`)
  }

  return { doc, applied, errors }
}

import { describe, expect, it } from 'vitest'
import {
  applyUserAnswerLocal,
  normalizeConversation,
  peekNextQuestion,
} from './agent'
import { isRedundantQuestion, validateAuditAiResponse, catalogFallback } from './ai'
import { emptyContext, emptyAuditCollections, type ProjectAudit } from './types'
import { pickNextCatalogQuestion } from './catalog'

function baseAudit(overrides: Partial<ProjectAudit> = {}): ProjectAudit {
  const empty = emptyAuditCollections()
  return {
    id: 'aud_1',
    lead_id: 1,
    project_types: ['unclear'],
    active_mode: 'descubrimiento',
    active_area: 'negocio',
    active_question_id: 'q1',
    structured: {},
    conversation: [
      {
        id: 'm1',
        role: 'assistant',
        content: '¿A qué se dedica la empresa?',
        mode: 'descubrimiento',
        area: 'negocio',
        question_id: 'q1',
        message_type: 'question',
        field_key: 'business.company_summary',
        created_at: new Date().toISOString(),
      },
    ],
    questions: [
      {
        id: 'q1',
        message_id: 'm1',
        mode: 'descubrimiento',
        category: 'negocio',
        field_key: 'business.company_summary',
        text: '¿A qué se dedica la empresa?',
        importance: 'critical',
        answer_type: 'textarea',
        status: 'open',
        order: 1,
        created_at: new Date().toISOString(),
        reason: 'Contexto',
      },
    ],
    answers: empty.answers,
    gaps: empty.gaps,
    progress: {},
    context: emptyContext(),
    status: 'in_progress',
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('normalizeConversation', () => {
  it('colapsa asistentes consecutivos', () => {
    const turns = normalizeConversation([
      {
        id: '1',
        role: 'assistant',
        content: 'Q1',
        mode: 'descubrimiento',
        area: 'negocio',
        created_at: '1',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'Q2',
        mode: 'descubrimiento',
        area: 'negocio',
        created_at: '2',
      },
    ])
    expect(turns).toHaveLength(1)
    expect(turns[0].content).toBe('Q2')
  })
})

describe('skip + late answer', () => {
  it('marca skipped y permite respuesta tardía sin borrar historial', () => {
    const audit = baseAudit()
    const skipped = applyUserAnswerLocal(audit, {
      question_id: 'q1',
      answer: '',
      action: 'skip',
    })
    expect(skipped.audit.questions[0].status).toBe('skipped')
    expect(skipped.audit.conversation.some((t) => t.role === 'user')).toBe(true)
    const lenAfterSkip = skipped.audit.conversation.length

    const late = applyUserAnswerLocal(
      {
        ...skipped.audit,
        conversation: [
          ...skipped.audit.conversation,
          {
            id: 'm2',
            role: 'assistant',
            content: 'Otra pregunta',
            mode: 'descubrimiento',
            area: 'negocio',
            question_id: 'q2',
            message_type: 'question',
            created_at: '3',
          },
        ],
        questions: [
          ...skipped.audit.questions,
          {
            id: 'q2',
            message_id: 'm2',
            mode: 'descubrimiento',
            category: 'negocio',
            field_key: 'business.main_goal',
            text: 'Otra pregunta',
            importance: 'important',
            answer_type: 'text',
            status: 'open',
            order: 2,
            created_at: '3',
          },
        ],
      },
      {
        question_id: 'q1',
        answer: 'Vendemos software B2B',
        action: 'save_continue',
        late: true,
      }
    )

    expect(late.audit.conversation.length).toBeGreaterThan(lenAfterSkip)
    expect(late.audit.questions.find((q) => q.id === 'q1')?.status).toBe('answered')
    expect(late.audit.answers.some((a) => a.question_id === 'q1' && a.late)).toBe(true)
    expect(late.audit.conversation.some((t) => t.content.includes('Otra pregunta'))).toBe(true)
  })
})

describe('mode change', () => {
  it('conserva historial y marca pregunta abierta como pending', () => {
    const audit = baseAudit()
    const beforeLen = audit.conversation.length
    const pending = {
      ...audit,
      questions: audit.questions.map((q) =>
        q.id === audit.active_question_id && q.status === 'open'
          ? { ...q, status: 'pending' as const }
          : q
      ),
      conversation: [
        ...audit.conversation,
        {
          id: 'sep',
          role: 'system' as const,
          content: 'Enfoque cambiado a ROI',
          mode: 'roi' as const,
          area: audit.active_area,
          message_type: 'mode_separator' as const,
          created_at: new Date().toISOString(),
        },
      ],
      active_mode: 'roi' as const,
    }
    expect(pending.questions[0].status).toBe('pending')
    expect(pending.conversation.length).toBe(beforeLen + 1)
    expect(pending.conversation[0].content).toContain('dedica')
  })
})

describe('select answer', () => {
  it('guarda value de single_select', () => {
    const audit = baseAudit({
      questions: [
        {
          id: 'q1',
          message_id: 'm1',
          mode: 'descubrimiento',
          category: 'negocio',
          field_key: 'business.main_goal',
          text: 'Objetivo?',
          importance: 'critical',
          answer_type: 'single_select',
          options: [
            { id: 'a', label: 'Reducir costes', value: 'cost' },
            { id: 'b', label: 'Aumentar ventas', value: 'sales' },
          ],
          status: 'open',
          order: 1,
          created_at: new Date().toISOString(),
        },
      ],
    })
    const res = applyUserAnswerLocal(audit, {
      question_id: 'q1',
      answer: 'Reducir costes',
      value: 'cost',
      action: 'save_continue',
    })
    expect(res.audit.answers[0].value).toBe('cost')
    expect(res.audit.structured['business.main_goal'].value).toBe('cost')
  })
})

describe('validateAuditAiResponse', () => {
  it('acepta contrato válido', () => {
    const r = validateAuditAiResponse({
      assistantMessage: 'Ok',
      question: {
        text: '¿Cuántos leads al mes?',
        category: 'volumen',
        importance: 'critical',
        answerType: 'number',
      },
      contextUpdates: [],
      detectedGaps: [],
      contradictions: [],
      progressUpdates: [],
    })
    expect(r.ok).toBe(true)
  })

  it('rechaza salida inválida', () => {
    const r = validateAuditAiResponse({ question: { text: 123 } })
    expect(r.ok).toBe(false)
  })
})

describe('peekNextQuestion', () => {
  it('devuelve la pregunta activa', () => {
    const q = peekNextQuestion(baseAudit())
    expect(q?.id).toBe('q1')
  })
})

describe('omitir no se repite en catálogo', () => {
  it('tras skip, pickNext no vuelve al mismo field_key', () => {
    const audit = baseAudit()
    const skipped = applyUserAnswerLocal(audit, {
      question_id: 'q1',
      answer: '',
      action: 'skip',
    })
    const next = pickNextCatalogQuestion(
      'descubrimiento',
      ['unclear'],
      skipped.audit.structured,
      null
    )
    expect(next?.field_key).not.toBe('business.company_summary')
  })
})

describe('contexto compartido / no redundante', () => {
  it('no vuelve a preguntar volumen si ya hay leads', () => {
    const audit = baseAudit({
      structured: {
        'volume.monthly_volume': {
          value: '3000 leads/mes',
          status: 'answered',
          source: 'client',
          confidence: 0.9,
          importance: 'critical',
          area: 'volumen',
          updated_at: new Date().toISOString(),
        },
      },
      questions: [],
      conversation: [],
      active_question_id: null,
    })
    expect(
      isRedundantQuestion(
        audit,
        '¿Qué volumen mensual manejáis (leads, llamadas, tickets, documentos…)?',
        'volume.monthly_volume'
      )
    ).toBe(true)

    const fb = catalogFallback(audit, false, ['volume.monthly_volume'])
    expect(fb.question?.fieldKey).not.toBe('volume.monthly_volume')
  })
})

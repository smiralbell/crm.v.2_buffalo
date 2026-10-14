export type InboundProcessorResult = {
  status: 'processed' | 'ignored'
  result?: Record<string, unknown>
}

export type InboundProcessor = (payload: unknown) => Promise<InboundProcessorResult>

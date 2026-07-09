const DEFAULT_HOURS: Record<string, number> = { low: 2, medium: 4, high: 8 }

export function taskEstimatedHours(priority: string, estimated: number | null | undefined): number {
  if (estimated != null && estimated > 0) return Number(estimated)
  return DEFAULT_HOURS[priority] ?? 4
}

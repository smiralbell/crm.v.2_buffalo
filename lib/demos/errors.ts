import type { PhoneConflict } from './types'

export class PhoneNumberConflictError extends Error {
  readonly code = 'PHONE_CONFLICT' as const
  readonly conflicts: PhoneConflict[]

  constructor(conflicts: PhoneConflict[]) {
    super('Uno o más números ya están asignados a otra demo')
    this.name = 'PhoneNumberConflictError'
    this.conflicts = conflicts
  }
}

export function isPhoneNumberConflictError(err: unknown): err is PhoneNumberConflictError {
  return err instanceof PhoneNumberConflictError
}

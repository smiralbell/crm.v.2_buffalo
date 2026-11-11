import { z } from 'zod'
import { MAX_SUBTASKS, MAX_SUBTASK_DESCRIPTION, MAX_SUBTASK_TITLE } from '@/lib/subtasks'

const statusSchema = z.enum(['pending', 'in_progress', 'buffalo_validation', 'done'])
const prioritySchema = z.enum(['low', 'medium', 'high'])
const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .nullable()
  .optional()

const subtasksSchema = z
  .array(
    z.object({
      id: z.string().max(40).optional(),
      title: z.string().max(MAX_SUBTASK_TITLE),
      done: z.boolean().optional(),
      description: z.string().max(MAX_SUBTASK_DESCRIPTION).optional(),
    })
  )
  .max(MAX_SUBTASKS, `Máximo ${MAX_SUBTASKS} subtareas`)

export const personalTaskCreateSchema = z.object({
  /** Solo lo usa admin: a quién se le pone la tarea */
  user_id: z.number().int().positive().optional(),
  title: z.string().trim().min(1, 'El título es obligatorio').max(500),
  description: z.string().max(20000).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  estimated_hours: z.number().positive().optional(),
  due_date: dueDateSchema,
  subtasks: subtasksSchema.optional(),
})

export const personalTaskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(20000).nullable().optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  estimated_hours: z.number().positive().nullable().optional(),
  due_date: dueDateSchema,
  position: z.number().int().optional(),
  subtasks: subtasksSchema.optional(),
  extend_stale: z.boolean().optional(),
  acknowledge_stale: z.boolean().optional(),
})

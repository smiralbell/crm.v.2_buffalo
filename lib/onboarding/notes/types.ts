/** Tipos del cuaderno (sin dependencias de DB — usable en cliente). */

export type NoteType = 'reunion' | 'libre' | 'definicion'

export type ProjectNote = {
  id: string
  lead_id: number
  note_date: string
  type: NoteType
  title: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectResearchData = {
  url: string
  host: string
  nombre: string
  sector: string
  hace: string
  servicios: string[]
  senales: string[]
  ganchos: string[]
  fuentes: string[]
  origen?: string
  at?: string
  [key: string]: unknown
}

export type ProjectResearch = {
  lead_id: number
  url: string
  data: ProjectResearchData
  created_at: string
  updated_at: string
}

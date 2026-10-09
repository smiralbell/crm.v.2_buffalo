import type { BlogRules, BlogSettings, Post, RunLog, Slot, Topic } from '@/lib/blog/types'

export type PostLite = Omit<Post, 'body' | 'brief' | 'history'> & {
  words: number
  gaps: number
  lastEvent?: Post['history'][number]
  demand?: string
}

export interface BlogState {
  settings: BlogSettings
  rules: BlogRules
  rulesHistory: { at: string; by?: string }[]
  posts: PostLite[]
  topics: Topic[]
  slots: Slot[]
  runs: RunLog[]
  status: { store: 'file' | 'postgres'; spend: number; keys: { openrouter: boolean; openai: boolean; cron: boolean } }
}

export interface TabProps {
  state: BlogState
  reload: () => Promise<void>
}

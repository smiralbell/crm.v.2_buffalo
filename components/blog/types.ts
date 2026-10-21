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
  status: { store: 'file' | 'postgres'; spend: number; keys: { openrouter: boolean; openai: boolean; cron: boolean; ftp: boolean } }
}

export type NewArticleOpts = { slotId?: string; date?: string }

export interface TabProps {
  state: BlogState
  reload: () => Promise<void>
  onNewArticle?: (opts?: NewArticleOpts) => void
}

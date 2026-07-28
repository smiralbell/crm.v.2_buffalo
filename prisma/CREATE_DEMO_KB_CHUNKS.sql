-- RAG chunks for WhatsApp demos (embeddings as JSONB — no pgvector required)
CREATE TABLE IF NOT EXISTS demo_kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (demo_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_demo_kb_chunks_demo_id ON demo_kb_chunks (demo_id);

CREATE TABLE IF NOT EXISTS demo_kb_meta (
  demo_id INTEGER PRIMARY KEY REFERENCES demos(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

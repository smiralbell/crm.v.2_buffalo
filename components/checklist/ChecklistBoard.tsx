'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CHECKLIST_COLUMNS,
  type ChecklistColumnId,
  type ChecklistItem,
} from '@/lib/checklist/types'
import { Check, GripVertical, Plus, Trash2 } from 'lucide-react'

interface ChecklistBoardProps {
  items: ChecklistItem[]
  onCreate: (title: string, column: ChecklistColumnId) => Promise<void>
  onToggle: (id: number, done: boolean) => Promise<void>
  onMove: (id: number, column: ChecklistColumnId, position: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  busyId?: number | null
}

export default function ChecklistBoard({
  items,
  onCreate,
  onToggle,
  onMove,
  onDelete,
  busyId,
}: ChecklistBoardProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({
    inbox: '',
    santi: '',
    sergi: '',
  })
  const [creatingCol, setCreatingCol] = useState<ChecklistColumnId | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const byColumn = useMemo(() => {
    const map: Record<ChecklistColumnId, ChecklistItem[]> = {
      inbox: [],
      santi: [],
      sergi: [],
    }
    for (const item of items) {
      const key = item.column_key in map ? item.column_key : 'inbox'
      map[key].push(item)
    }
    for (const col of CHECKLIST_COLUMNS) {
      map[col.id].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        return a.position - b.position || a.id - b.id
      })
    }
    return map
  }, [items])

  const submit = async (column: ChecklistColumnId) => {
    const title = (drafts[column] || '').trim()
    if (!title) return
    setCreatingCol(column)
    try {
      await onCreate(title, column)
      setDrafts((d) => ({ ...d, [column]: '' }))
    } finally {
      setCreatingCol(null)
    }
  }

  const handleDrop = async (column: ChecklistColumnId, position: number) => {
    if (draggingId == null) return
    const id = draggingId
    setDraggingId(null)
    await onMove(id, column, position)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {CHECKLIST_COLUMNS.map((col) => {
        const colItems = byColumn[col.id]
        const openCount = colItems.filter((i) => !i.done).length
        return (
          <div
            key={col.id}
            className="rounded-2xl border border-gray-200 bg-gray-50/60 flex flex-col min-h-[420px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void handleDrop(col.id, colItems.length)
            }}
          >
            <div className="px-4 pt-4 pb-3 border-b border-gray-200/80">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">{col.label}</h2>
                <span className="text-[11px] tabular-nums text-gray-400">{openCount} abiertas</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{col.hint}</p>
            </div>

            <div className="p-3 space-y-2 flex-1">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit(col.id)
                }}
              >
                <Input
                  value={drafts[col.id]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [col.id]: e.target.value }))}
                  placeholder="Nueva tarea…"
                  className="rounded-xl bg-white h-9 text-sm"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-xl h-9 w-9 shrink-0 bg-gray-900 hover:bg-gray-800"
                  disabled={creatingCol === col.id || !drafts[col.id]?.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </form>

              <div className="space-y-2 pt-1">
                {colItems.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8 px-2">
                    Arrastra tareas aquí o añade una nueva.
                  </p>
                )}
                {colItems.map((item, index) => {
                  const busy = busyId === item.id
                  return (
                    <div
                      key={item.id}
                      draggable={!busy}
                      onDragStart={() => setDraggingId(item.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        void handleDrop(col.id, index)
                      }}
                      className={`group flex items-start gap-2 rounded-xl border bg-white px-2.5 py-2 shadow-sm transition ${
                        draggingId === item.id
                          ? 'opacity-50 border-gray-300'
                          : 'border-gray-100 hover:border-gray-200'
                      } ${item.done ? 'opacity-70' : ''}`}
                    >
                      <span className="mt-1 text-gray-300 cursor-grab active:cursor-grabbing shrink-0">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onToggle(item.id, !item.done)}
                        className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                          item.done
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-gray-300 bg-white hover:border-gray-400'
                        }`}
                        title={item.done ? 'Marcar pendiente' : 'Marcar hecha'}
                      >
                        {item.done && <Check className="h-3 w-3" />}
                      </button>
                      <p
                        className={`flex-1 text-sm leading-snug pt-0.5 ${
                          item.done ? 'text-gray-400 line-through' : 'text-gray-900'
                        }`}
                      >
                        {item.title}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDelete(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-600 shrink-0 p-1 transition"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

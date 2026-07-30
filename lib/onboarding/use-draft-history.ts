import { useCallback, useRef, useState } from 'react'

const DEFAULT_MAX = 40

/**
 * Historial de borradores para deshacer / rehacer en editores de documentos.
 */
export function useDraftHistory(initial = '', maxEntries = DEFAULT_MAX) {
  const [draft, setDraftState] = useState(initial)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const pastRef = useRef<string[]>([])
  const futureRef = useRef<string[]>([])
  const draftRef = useRef(initial)

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  /** Carga inicial / reset sin meter en historial. */
  const resetDraft = useCallback(
    (value: string) => {
      draftRef.current = value
      pastRef.current = []
      futureRef.current = []
      setDraftState(value)
      syncFlags()
    },
    [syncFlags]
  )

  /** Cambia el borrador y guarda la versión anterior para deshacer. */
  const commitDraft = useCallback(
    (next: string) => {
      const prev = draftRef.current
      if (next === prev) return false
      pastRef.current = [...pastRef.current, prev].slice(-maxEntries)
      futureRef.current = []
      draftRef.current = next
      setDraftState(next)
      syncFlags()
      return true
    },
    [maxEntries, syncFlags]
  )

  const undo = useCallback((): string | null => {
    if (pastRef.current.length === 0) return null
    const prev = pastRef.current[pastRef.current.length - 1]
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [draftRef.current, ...futureRef.current].slice(0, maxEntries)
    draftRef.current = prev
    setDraftState(prev)
    syncFlags()
    return prev
  }, [maxEntries, syncFlags])

  const redo = useCallback((): string | null => {
    if (futureRef.current.length === 0) return null
    const next = futureRef.current[0]
    futureRef.current = futureRef.current.slice(1)
    pastRef.current = [...pastRef.current, draftRef.current].slice(-maxEntries)
    draftRef.current = next
    setDraftState(next)
    syncFlags()
    return next
  }, [maxEntries, syncFlags])

  return {
    draft,
    canUndo,
    canRedo,
    resetDraft,
    commitDraft,
    undo,
    redo,
  }
}

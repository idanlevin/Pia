/** The library of scanned pieces. There is no server, so this is all there is. */

import type { Score, StoredPiece } from './types'

const KEY = 'pia.library.v1'
const LIMIT = 24

export function loadLibrary(): StoredPiece[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredPiece[]) : []
  } catch {
    return []
  }
}

function persist(pieces: StoredPiece[]): StoredPiece[] {
  const trimmed = pieces.slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // Quota exhausted: drop the oldest and try once more before giving up.
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed.slice(0, Math.max(1, trimmed.length >> 1))))
    } catch {
      /* the library is a convenience, not the product */
    }
  }
  return trimmed
}

export function savePiece(score: Score, thumbnail: string): StoredPiece[] {
  const piece: StoredPiece = {
    id: score.id,
    title: score.title,
    createdAt: Date.now(),
    score,
    thumbnail,
  }
  const rest = loadLibrary().filter((p) => p.id !== score.id)
  return persist([piece, ...rest])
}

export function deletePiece(id: string): StoredPiece[] {
  return persist(loadLibrary().filter((p) => p.id !== id))
}

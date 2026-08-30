/**
 * The piece as a scrolling piano roll: time across, pitch up. This is both the
 * follow-along view and the editing surface — tap a note to select it, tap the
 * background to move the playhead there.
 */

import { useEffect, useMemo, useRef } from 'react'
import { isBlackKey } from '../lib/music'
import type { Note, Score } from '../lib/types'

interface Props {
  score: Score
  /** Live playhead in beats; read every frame, never stored in React state. */
  position: () => number
  selectedId: string | null
  loop: { start: number; end: number } | null
  onSelect: (note: Note | null) => void
  onSeek: (beat: number) => void
}

const ROW = 11
const BEAT = 48
const PAD = 14

export function PianoRoll({ score, position, selectedId, loop, onSelect, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // The draw loop runs outside React, so it reads the current props through a ref
  // rather than being torn down and rebuilt on every edit.
  const stateRef = useRef({ score, selectedId, loop })
  useEffect(() => {
    stateRef.current = { score, selectedId, loop }
  }, [score, selectedId, loop])

  const layout = useMemo(() => {
    const pitches = score.notes.map((n) => n.midi)
    const low = pitches.length ? Math.max(21, Math.min(...pitches) - 2) : 48
    const high = pitches.length ? Math.min(108, Math.max(...pitches) + 2) : 72
    return {
      low,
      high,
      height: (high - low + 1) * ROW + PAD * 2,
      width: Math.max(1, score.length) * BEAT + PAD * 2,
    }
  }, [score])

  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    let raf = 0

    const draw = () => {
      const { score: s, selectedId: sel, loop: lp } = stateRef.current
      const { low, high, height, width } = layout
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const viewW = box.clientWidth

      if (canvas.width !== Math.round(viewW * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(viewW * dpr)
        canvas.height = Math.round(height * dpr)
        canvas.style.height = `${height}px`
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Keep the playhead a third of the way in, so you can see what is coming.
      const beat = position()
      const scroll = Math.max(0, Math.min(width - viewW, beat * BEAT + PAD - viewW / 3))
      ctx.clearRect(0, 0, viewW, height)
      ctx.save()
      ctx.translate(-scroll, 0)

      // Pitch lanes: the black-key rows are shaded, which is what makes the
      // vertical axis readable as a keyboard at a glance.
      for (let midi = low; midi <= high; midi++) {
        const y = height - PAD - (midi - low + 1) * ROW
        ctx.fillStyle = isBlackKey(midi) ? '#101319' : '#161a22'
        ctx.fillRect(scroll, y, viewW, ROW)
        if (midi % 12 === 0) {
          ctx.fillStyle = '#232833'
          ctx.fillRect(scroll, y + ROW - 1, viewW, 1)
        }
      }

      // Bar lines, with the beats inside them a little fainter.
      const bars = Math.ceil(s.length / s.time.beats) + 1
      for (let b = 0; b <= bars * s.time.beats; b++) {
        const x = b * BEAT + PAD
        if (x < scroll - 2 || x > scroll + viewW + 2) continue
        const isBar = b % s.time.beats === 0
        ctx.fillStyle = isBar ? '#2b3140' : '#1c212a'
        ctx.fillRect(x, 0, 1, height)
      }

      if (lp) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.10)'
        ctx.fillRect(lp.start * BEAT + PAD, 0, (lp.end - lp.start) * BEAT, height)
      }

      for (const note of s.notes) {
        const x = note.start * BEAT + PAD
        const w = Math.max(6, note.duration * BEAT - 2)
        if (x + w < scroll || x > scroll + viewW) continue
        const y = height - PAD - (note.midi - low + 1) * ROW
        const live = beat >= note.start && beat < note.start + note.duration
        const dim = note.confidence < 0.8 && note.confidence > 0

        ctx.fillStyle = live
          ? note.hand === 'right' ? '#fbbf24' : '#d99a1f'
          : note.hand === 'right' ? '#3f4a5e' : '#333c4c'
        ctx.beginPath()
        ctx.roundRect(x, y + 1, w, ROW - 2, 2)
        ctx.fill()

        if (dim && !live) {
          // Anything the recogniser was unsure of is marked, not hidden.
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
        if (note.id === sel) {
          ctx.strokeStyle = '#38bdf8'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      const px = beat * BEAT + PAD
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(px - 1, 0, 2, height)
      ctx.restore()
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [layout, position])

  const hit = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    const rect = canvas.getBoundingClientRect()
    const { high, width } = layout
    const scroll = Math.max(
      0,
      Math.min(width - box.clientWidth, position() * BEAT + PAD - box.clientWidth / 3),
    )
    const x = event.clientX - rect.left + scroll
    const y = event.clientY - rect.top

    const midi = high - Math.floor((y - PAD) / ROW)
    const beat = (x - PAD) / BEAT
    const found = score.notes.find(
      (n) => n.midi === midi && beat >= n.start - 0.1 && beat <= n.start + n.duration,
    )
    if (found) {
      onSelect(found)
    } else {
      onSelect(null)
      onSeek(Math.max(0, beat))
    }
  }

  return (
    <div ref={boxRef} className="w-full overflow-hidden rounded-xl bg-ink-900 ring-1 ring-ink-700">
      <canvas ref={canvasRef} onPointerDown={hit} className="block w-full touch-manipulation" />
    </div>
  )
}

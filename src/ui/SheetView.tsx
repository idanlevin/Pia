/**
 * The page you photographed, straightened, with a box round every notehead the
 * recogniser found. It is the fastest way to see whether a reading is trustworthy —
 * a missing box explains a missing note better than any confidence number.
 */

import { useEffect, useRef } from 'react'
import type { Score } from '../lib/types'

interface Props {
  score: Score
  image: string | null
  position: () => number
  showBoxes: boolean
}

export function SheetView({ score, image, position, showBoxes }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const soundingRef = useRef<SVGGElement>(null)

  useEffect(() => {
    if (!showBoxes) return
    let raf = 0
    const tick = () => {
      const beat = position()
      const group = soundingRef.current
      if (group) {
        for (const child of Array.from(group.children) as SVGRectElement[]) {
          const start = Number(child.dataset.start)
          const end = Number(child.dataset.end)
          child.setAttribute('opacity', beat >= start && beat < end ? '1' : '0')
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [position, showBoxes])

  if (!image) {
    return (
      <p className="rounded-xl bg-ink-900 p-6 text-center text-sm text-ink-400 ring-1 ring-ink-700">
        This piece came with the app, so there is no page to show. Scan one to see it here.
      </p>
    )
  }

  const noteById = new Map(score.notes.map((n) => [n.id, n]))

  return (
    <div ref={ref} className="relative overflow-hidden rounded-xl bg-white ring-1 ring-ink-700">
      <img src={image} alt="The scanned page, straightened" className="block w-full" />
      {showBoxes && (
        <svg
          viewBox={`0 0 ${score.imageWidth} ${score.imageHeight}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {score.detections.map((d, i) => (
            <rect
              key={i}
              x={d.x}
              y={d.y}
              width={d.w}
              height={d.h}
              rx={2}
              fill="none"
              stroke="#0284c7"
              strokeWidth={1.6}
              opacity={0.75}
            />
          ))}
          <g ref={soundingRef}>
            {score.detections.map((d, i) => {
              const note = noteById.get(d.noteId)
              if (!note) return null
              return (
                <rect
                  key={i}
                  data-start={note.start}
                  data-end={note.start + note.duration}
                  x={d.x - 1.5}
                  y={d.y - 1.5}
                  width={d.w + 3}
                  height={d.h + 3}
                  rx={3}
                  fill="rgba(245, 158, 11, 0.3)"
                  stroke="#d97706"
                  strokeWidth={2.4}
                  opacity={0}
                />
              )
            })}
          </g>
        </svg>
      )}
    </div>
  )
}

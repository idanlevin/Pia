/** The keyboard you follow along on. Keys light while their note sounds. */

import { useMemo } from 'react'
import { isBlackKey, midiToName } from '../lib/music'
import type { Hand } from '../lib/types'

export interface KeyState {
  hand: Hand
  /** The hand is muted: this key is the player's to press, not the app's. */
  yours: boolean
}

interface Props {
  low: number
  high: number
  sounding: Map<number, KeyState>
  onPress?: (midi: number) => void
}

const WHITE_W = 100
const WHITE_H = 460
const BLACK_W = 60
const BLACK_H = 285

export function Keyboard({ low, high, sounding, onPress }: Props) {
  const keys = useMemo(() => {
    // Start and end on a white key, or the black ones have nothing to sit between.
    let from = low
    while (isBlackKey(from) && from > 21) from--
    let to = high
    while (isBlackKey(to) && to < 108) to++

    const white: { midi: number; x: number }[] = []
    const black: { midi: number; x: number }[] = []
    for (let midi = from; midi <= to; midi++) {
      if (isBlackKey(midi)) {
        black.push({ midi, x: white.length * WHITE_W - BLACK_W / 2 })
      } else {
        white.push({ midi, x: white.length * WHITE_W })
      }
    }
    return { white, black, width: white.length * WHITE_W }
  }, [low, high])

  const tint = (state: KeyState | undefined, black: boolean) => {
    if (!state) return black ? '#1b2029' : '#e9ecf1'
    // Amber is the app playing; sky is a muted hand, which is yours to play. Within
    // each, the two hands differ in lightness rather than hue, so they stay apart
    // without colour vision.
    if (state.yours) return state.hand === 'right' ? '#7dd3fc' : '#38bdf8'
    return state.hand === 'right'
      ? black ? '#fcd34d' : '#fbbf24'
      : black ? '#b07a12' : '#d99a1f'
  }

  return (
    <svg
      viewBox={`0 0 ${keys.width} ${WHITE_H}`}
      preserveAspectRatio="none"
      className="block h-full w-full"
      role="img"
      aria-label="Piano keyboard"
    >
      {keys.white.map(({ midi, x }) => {
        const state = sounding.get(midi)
        return (
          <g key={midi} onPointerDown={() => onPress?.(midi)} style={{ cursor: onPress ? 'pointer' : undefined }}>
            <rect
              x={x + 1}
              y={0}
              width={WHITE_W - 2}
              height={WHITE_H}
              rx={5}
              fill={tint(state, false)}
              stroke="#0d0f14"
              strokeWidth={2}
            />
            {midi % 12 === 0 && (
              <text
                x={x + WHITE_W / 2}
                y={WHITE_H - 22}
                textAnchor="middle"
                fontSize={38}
                fill={state ? '#3f3005' : '#9aa3b2'}
              >
                {midiToName(midi)}
              </text>
            )}
          </g>
        )
      })}
      {keys.black.map(({ midi, x }) => (
        <rect
          key={midi}
          x={x}
          y={0}
          width={BLACK_W}
          height={BLACK_H}
          rx={4}
          fill={tint(sounding.get(midi), true)}
          stroke="#08090c"
          strokeWidth={3}
          onPointerDown={() => onPress?.(midi)}
          style={{ cursor: onPress ? 'pointer' : undefined }}
        />
      ))}
    </svg>
  )
}

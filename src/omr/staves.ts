/** Finding the staves, grouping them into systems, and erasing the lines. */

import { type Bitmap, createBitmap, horizontalRun, verticalRun } from './image'

export interface Staff {
  /** y of each of the five lines, top to bottom. */
  lines: number[]
  top: number
  bottom: number
  left: number
  right: number
  staffSpace: number
  /** Index of the system this staff belongs to. */
  system: number
  /** Position within the system: 0 = upper (right hand), 1 = lower. */
  indexInSystem: number
}

interface LineBand {
  center: number
  thickness: number
  ink: number
  left: number
  right: number
}

/** Rows where ink spans a large part of the page are staff-line candidates. */
function findLineBands(b: Bitmap, lineThickness: number): LineBand[] {
  const rowInk = new Float64Array(b.height)
  const rowLeft = new Int32Array(b.height).fill(b.width)
  const rowRight = new Int32Array(b.height).fill(-1)

  for (let y = 0; y < b.height; y++) {
    let count = 0
    const row = y * b.width
    for (let x = 0; x < b.width; x++) {
      if (b.data[row + x]) {
        // Only count thin ink: a beam or a big blob is not a staff line.
        if (verticalRun(b, x, y) <= lineThickness * 2.5) {
          count++
          if (x < rowLeft[y]) rowLeft[y] = x
          if (x > rowRight[y]) rowRight[y] = x
        }
      }
    }
    rowInk[y] = count
  }

  let max = 0
  for (let y = 0; y < b.height; y++) max = Math.max(max, rowInk[y])
  if (max === 0) return []
  const threshold = Math.max(max * 0.33, b.width * 0.15)

  const bands: LineBand[] = []
  let y = 0
  while (y < b.height) {
    if (rowInk[y] < threshold) {
      y++
      continue
    }
    let end = y
    let weighted = 0
    let total = 0
    let left = b.width
    let right = -1
    while (end < b.height && rowInk[end] >= threshold) {
      weighted += end * rowInk[end]
      total += rowInk[end]
      left = Math.min(left, rowLeft[end])
      right = Math.max(right, rowRight[end])
      end++
    }
    bands.push({
      center: weighted / total,
      thickness: end - y,
      ink: total / (end - y),
      left,
      right,
    })
    y = end
  }
  return bands
}

/** Walk the bands looking for runs of five that are evenly spaced. */
function groupIntoStaves(bands: LineBand[], staffSpace: number): Staff[] {
  const staves: Staff[] = []
  let i = 0
  while (i + 4 < bands.length) {
    const group = bands.slice(i, i + 5)
    const gaps = []
    for (let k = 1; k < 5; k++) gaps.push(group[k].center - group[k - 1].center)
    const mean = gaps.reduce((a, c) => a + c, 0) / gaps.length
    const even = gaps.every((g) => Math.abs(g - mean) < mean * 0.35)
    const plausible = mean > staffSpace * 0.55 && mean < staffSpace * 2.2

    if (even && plausible) {
      staves.push({
        lines: group.map((g) => g.center),
        top: group[0].center,
        bottom: group[4].center,
        left: Math.min(...group.map((g) => g.left)),
        right: Math.max(...group.map((g) => g.right)),
        staffSpace: mean,
        system: 0,
        indexInSystem: 0,
      })
      i += 5
    } else {
      i++
    }
  }
  return staves
}

/**
 * Pair staves into systems. On piano music the gap inside a grand staff is markedly
 * smaller than the gap between systems, so a split at the midpoint of the observed
 * gap range separates them. With a single gap we fall back on an absolute threshold.
 */
function assignSystems(staves: Staff[]): number {
  if (staves.length === 0) return 0
  const gaps: number[] = []
  for (let i = 1; i < staves.length; i++) gaps.push(staves[i].top - staves[i - 1].bottom)

  let splitAt: number
  if (gaps.length === 0) {
    splitAt = Infinity
  } else if (gaps.length === 1) {
    splitAt = staves[0].staffSpace * 9 // ≈ 2.2 staff heights
  } else {
    const min = Math.min(...gaps)
    const max = Math.max(...gaps)
    splitAt = max > min * 1.6 ? (min + max) / 2 : Infinity
  }

  let system = 0
  let indexInSystem = 0
  staves[0].system = 0
  staves[0].indexInSystem = 0
  for (let i = 1; i < staves.length; i++) {
    if (gaps[i - 1] > splitAt || indexInSystem >= 1) {
      system++
      indexInSystem = 0
    } else {
      indexInSystem++
    }
    staves[i].system = system
    staves[i].indexInSystem = indexInSystem
  }
  return system + 1
}

export function detectStaves(
  b: Bitmap,
  lineThickness: number,
  staffSpace: number,
): { staves: Staff[]; systemCount: number } {
  const bands = findLineBands(b, lineThickness)
  const staves = groupIntoStaves(bands, staffSpace)
  const systemCount = assignSystems(staves)
  return { staves, systemCount }
}

/**
 * Erase the staff lines. A pixel on a line row goes only if its vertical ink run is
 * thin *and* its horizontal run is long — the first test keeps stems and noteheads
 * that cross a line, the second keeps the small symbols that sit on one. Without
 * that second test an augmentation dot or the crossbar of a sharp is indistinguishable
 * from the line underneath it, and vanishes with it.
 */
export function removeStaffLines(b: Bitmap, staves: Staff[], lineThickness: number): Bitmap {
  const out = createBitmap(b.width, b.height)
  out.data.set(b.data)
  const tolerance = Math.max(1, Math.round(lineThickness * 0.8))
  const maxRun = lineThickness * 2 + 1

  for (const staff of staves) {
    const minSpan = staff.staffSpace * 1.2
    for (const line of staff.lines) {
      const y0 = Math.max(0, Math.round(line - tolerance))
      const y1 = Math.min(b.height - 1, Math.round(line + tolerance))
      for (let x = 0; x < b.width; x++) {
        for (let y = y0; y <= y1; y++) {
          if (!b.data[y * b.width + x]) continue
          if (verticalRun(b, x, y) <= maxRun && horizontalRun(b, x, y) >= minSpan) {
            out.data[y * b.width + x] = 0
          }
        }
      }
    }
  }
  return out
}

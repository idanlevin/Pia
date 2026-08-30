/** A tiny engraver, so the recogniser can be tested against pages we know the answer to. */

export interface Canvas {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function blank(width: number, height: number): Canvas {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  return { width, height, data }
}

export function ink(c: Canvas, x: number, y: number, value = 20) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return
  const i = (y * c.width + x) * 4
  c.data[i] = c.data[i + 1] = c.data[i + 2] = value
}

export function rect(c: Canvas, x: number, y: number, w: number, h: number) {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) ink(c, xx, yy)
  }
}

/** A thick straight line between two points. */
export function stroke(c: Canvas, x0: number, y0: number, x1: number, y1: number, w: number) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2
  const r = Math.max(1, w / 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = x0 + (x1 - x0) * t
    const cy = y0 + (y1 - y0) * t
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) ink(c, Math.round(cx + dx), Math.round(cy + dy))
    }
  }
}

export function ellipse(c: Canvas, cx: number, cy: number, rx: number, ry: number, filled: boolean) {
  for (let yy = Math.round(cy - ry); yy <= cy + ry; yy++) {
    for (let xx = Math.round(cx - rx); xx <= cx + rx; xx++) {
      const dx = (xx - cx) / rx
      const dy = (yy - cy) / ry
      const d = dx * dx + dy * dy
      if (d > 1) continue
      if (!filled) {
        const inner = (dx / 0.5) * (dx / 0.5) + (dy / 0.45) * (dy / 0.45)
        if (inner < 1) continue
      }
      ink(c, xx, yy)
    }
  }
}

export interface StaffSpec {
  top: number
  left: number
  right: number
  space: number
  thickness?: number
}

export function staff(c: Canvas, s: StaffSpec) {
  const t = s.thickness ?? 2
  for (let i = 0; i < 5; i++) rect(c, s.left, s.top + i * s.space, s.right - s.left, t)
}

export interface NoteSpec {
  /** Diatonic steps above the staff's bottom line. */
  step: number
  x: number
  /** 4 = whole, 2 = half, 1 = quarter, 0.5 = eighth. */
  value: number
  dotted?: boolean
}

/** Draw a note on a staff. Stems go up below the middle line, down above it. */
export function note(c: Canvas, s: StaffSpec, n: NoteSpec) {
  const bottom = s.top + 4 * s.space
  const cy = bottom - (n.step * s.space) / 2
  const rx = s.space * 0.65
  const ry = s.space * 0.48
  ledgers(c, s, n.step, n.x)
  ellipse(c, n.x, cy, rx, ry, n.value <= 1)

  if (n.dotted) {
    // Engraved convention: a dot never sits on a line, so a note on a line takes
    // its dot in the space above.
    const dotY = n.step % 2 === 0 ? cy - s.space / 2 : cy
    const r = s.space * 0.2
    ellipse(c, n.x + s.space * 1.15, dotY, r, r, true)
  }
  if (n.value >= 4) return
  const up = n.step < 4
  const stemH = s.space * 3.3
  const stemW = Math.max(2, Math.round(s.space * 0.14))
  const stemX = up ? n.x + rx - stemW : n.x - rx
  const tip = up ? cy - stemH : cy + stemH
  rect(c, stemX, Math.min(cy, tip), stemW, stemH)

  if (n.value <= 0.5) {
    // A flag: one solid hook off the tip, on the stem's outer side.
    const hookY = up ? tip : tip - s.space * 0.45
    rect(c, up ? stemX + stemW : stemX - s.space * 0.9, hookY, s.space * 0.9, s.space * 0.45)
  }
}

/** Ledger lines for notes that sit off the staff. */
function ledgers(c: Canvas, s: StaffSpec, step: number, x: number) {
  const bottom = s.top + 4 * s.space
  const t = Math.max(2, Math.round(s.space * 0.14))
  if (step > 8) {
    for (let k = 10; k <= step + (step % 2); k += 2) {
      rect(c, x - s.space * 0.95, bottom - (k * s.space) / 2, s.space * 1.9, t)
    }
  } else if (step < 0) {
    for (let k = -2; k >= step - (Math.abs(step) % 2); k -= 2) {
      rect(c, x - s.space * 0.95, bottom - (k * s.space) / 2, s.space * 1.9, t)
    }
  }
}

/** A chord: several heads sharing one stem. */
export function chord(c: Canvas, s: StaffSpec, steps: number[], x: number, value: number) {
  const bottom = s.top + 4 * s.space
  const rx = s.space * 0.65
  const ry = s.space * 0.48
  for (const step of steps) {
    ledgers(c, s, step, x)
    ellipse(c, x, bottom - (step * s.space) / 2, rx, ry, value <= 1)
  }
  if (value >= 4) return
  // One stem spanning the whole chord: from the head at the near end, past the head
  // at the far end, and on for three and a bit spaces.
  const up = Math.min(...steps) < 4
  const stemW = Math.max(2, Math.round(s.space * 0.14))
  const near = up ? Math.min(...steps) : Math.max(...steps)
  const far = up ? Math.max(...steps) : Math.min(...steps)
  const y0 = bottom - (near * s.space) / 2
  const y1 = bottom - (far * s.space) / 2 + (up ? -s.space * 3.3 : s.space * 3.3)
  rect(c, up ? x + rx - stemW : x - rx, Math.min(y0, y1), stemW, Math.abs(y1 - y0))
}

/** A beamed run of equal notes, all stems up, joined by one or two beams. */
export function beamed(
  c: Canvas,
  s: StaffSpec,
  notes: { step: number; x: number }[],
  beams: number,
) {
  const bottom = s.top + 4 * s.space
  const rx = s.space * 0.65
  const ry = s.space * 0.48
  const stemW = Math.max(2, Math.round(s.space * 0.14))
  const beamTop = bottom - (Math.max(...notes.map((n) => n.step)) * s.space) / 2 - s.space * 3.3

  for (const n of notes) {
    ledgers(c, s, n.step, n.x)
    const cy = bottom - (n.step * s.space) / 2
    ellipse(c, n.x, cy, rx, ry, true)
    rect(c, n.x + rx - stemW, beamTop, stemW, cy - beamTop)
  }
  const x0 = notes[0].x + rx - stemW
  const x1 = notes[notes.length - 1].x + rx
  for (let b = 0; b < beams; b++) {
    rect(c, x0, beamTop + b * s.space * 0.75, x1 - x0, s.space * 0.45)
  }
}

/** Glyphs standing in for a sharp and a flat, drawn left of a note. */
export function accidental(c: Canvas, s: StaffSpec, step: number, x: number, kind: 'sharp' | 'flat') {
  const bottom = s.top + 4 * s.space
  const cy = bottom - (step * s.space) / 2
  const t = Math.max(2, Math.round(s.space * 0.16))
  if (kind === 'sharp') {
    rect(c, x, cy - s.space, t, s.space * 2)
    rect(c, x + s.space * 0.38, cy - s.space, t, s.space * 2)
    rect(c, x, cy - s.space * 0.35, s.space * 0.5, t)
    rect(c, x, cy + s.space * 0.3, s.space * 0.5, t)
  } else {
    rect(c, x, cy - s.space * 1.3, t, s.space * 2.1)
    rect(c, x, cy + s.space * 0.2, s.space * 0.45, t)
    rect(c, x + s.space * 0.35, cy - s.space * 0.3, t, s.space * 0.6)
    rect(c, x, cy - s.space * 0.35, s.space * 0.4, t)
  }
}

/** A natural: two staggered verticals joined by two crossbars. */
export function natural(c: Canvas, s: StaffSpec, step: number, x: number) {
  const cy = s.top + 4 * s.space - (step * s.space) / 2
  const t = Math.max(2, Math.round(s.space * 0.16))
  const w = s.space * 0.36
  rect(c, x, cy - s.space * 1.1, t, s.space * 1.7)
  rect(c, x + w, cy - s.space * 0.6, t, s.space * 1.7)
  rect(c, x, cy - s.space * 0.5, w + t, t)
  rect(c, x, cy + s.space * 0.2, w + t, t)
}

/** Rests. Whole hangs under the fourth line, half sits on the middle one. */
export function rest(c: Canvas, s: StaffSpec, x: number, value: number) {
  const line = (i: number) => s.top + i * s.space
  if (value === 4 || value === 2) {
    const y = value === 4 ? line(1) + 2 : line(2) - s.space * 0.45
    rect(c, x, y, s.space * 1.2, s.space * 0.45)
    return
  }
  if (value === 1) {
    // One connected zigzag, standing in for the quarter-rest glyph.
    const points = [0, 1, 2, 3].map((i) => ({
      x: x + (i % 2 === 0 ? 0 : s.space * 0.6),
      y: line(1) + i * s.space * 0.7,
    }))
    for (let i = 0; i + 1 < points.length; i++) {
      stroke(c, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, s.space * 0.28)
    }
    return
  }
  rect(c, x, line(1) + s.space * 0.3, s.space * 0.5, s.space * 1.3)
  rect(c, x + s.space * 0.05, line(1) + s.space * 0.2, s.space * 0.35, s.space * 0.35)
}

export function barline(c: Canvas, s: StaffSpec, x: number) {
  rect(c, x, s.top, Math.max(2, Math.round(s.space * 0.16)), 4 * s.space + 2)
}

/** A stand-in for a clef: tall enough to be recognised as one and skipped. */
export function clefMark(c: Canvas, s: StaffSpec, treble: boolean) {
  const x = s.left + s.space * 0.5
  if (treble) {
    rect(c, x, s.top - s.space * 1.6, s.space * 0.9, s.space * 7.2)
  } else {
    rect(c, x, s.top, s.space * 0.9, s.space * 2.6)
  }
}

export function toImageData(c: Canvas): ImageData {
  return { data: c.data, width: c.width, height: c.height, colorSpace: 'srgb' } as ImageData
}

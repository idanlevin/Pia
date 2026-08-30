/** 8-connected component labelling, with the per-blob geometry the rest of the
 *  pipeline asks questions of. */

import { type Bitmap, createBitmap, integralImage, rectSum } from './image'

export interface Blob {
  id: number
  x0: number
  y0: number
  x1: number
  y1: number
  width: number
  height: number
  area: number
  /** Mask cropped to the bounding box, 1 = belongs to this blob. */
  mask: Bitmap
  /** Summed-area table over `mask`, for fast window fill queries. */
  integral: Float64Array
}

/** Ink count and pixel count of a window centred on the blob, clipped to it. */
export function rectStats(
  blob: Blob,
  cx: number,
  cy: number,
  w: number,
  h: number,
): { sum: number; area: number } {
  const x0 = Math.max(0, Math.round(cx - w / 2) - blob.x0)
  const y0 = Math.max(0, Math.round(cy - h / 2) - blob.y0)
  const x1 = Math.min(blob.width, Math.round(cx + w / 2) - blob.x0)
  const y1 = Math.min(blob.height, Math.round(cy + h / 2) - blob.y0)
  if (x1 <= x0 || y1 <= y0) return { sum: 0, area: 0 }
  return {
    sum: rectSum(blob.integral, blob.width, x0, y0, x1, y1),
    area: (x1 - x0) * (y1 - y0),
  }
}

export function fillRatio(blob: Blob, cx: number, cy: number, w: number, h: number): number {
  const { sum, area } = rectStats(blob, cx, cy, w, h)
  return area === 0 ? 0 : sum / area
}

export function labelComponents(b: Bitmap, minArea: number): Blob[] {
  const { width, height, data } = b
  const labels = new Int32Array(width * height).fill(-1)
  const blobs: Blob[] = []
  const stack = new Int32Array(width * height)

  for (let seed = 0; seed < data.length; seed++) {
    if (!data[seed] || labels[seed] !== -1) continue
    const id = blobs.length
    let top = 0
    stack[top++] = seed
    labels[seed] = id

    let x0 = width
    let y0 = height
    let x1 = -1
    let y1 = -1
    let area = 0
    const pixels: number[] = []

    while (top > 0) {
      const p = stack[--top]
      const px = p % width
      const py = (p / width) | 0
      pixels.push(p)
      area++
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py

      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          if (nx < 0 || nx >= width) continue
          const q = ny * width + nx
          if (data[q] && labels[q] === -1) {
            labels[q] = id
            stack[top++] = q
          }
        }
      }
    }

    if (area < minArea) {
      blobs.push(null as unknown as Blob) // keep ids aligned; filtered below
      continue
    }

    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    const mask = createBitmap(bw, bh)
    for (const p of pixels) {
      const px = p % width
      const py = (p / width) | 0
      mask.data[(py - y0) * bw + (px - x0)] = 1
    }
    blobs.push({
      id,
      x0,
      y0,
      x1,
      y1,
      width: bw,
      height: bh,
      area,
      mask,
      integral: integralImage(mask.data, bw, bh),
    })
  }

  return blobs.filter(Boolean)
}

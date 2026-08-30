/** Binary image type plus the preprocessing steps that produce one from a photo. */

export interface Bitmap {
  width: number
  height: number
  /** 1 = ink, 0 = paper. */
  data: Uint8Array
}

export function createBitmap(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(width * height) }
}

export function at(b: Bitmap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return 0
  return b.data[y * b.width + x]
}

/** Downscale so the long edge is at most `maxSize`, and convert to greyscale. */
export function toGrey(
  image: ImageData,
  maxSize: number,
): { grey: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const grey = new Uint8ClampedArray(width * height)
  const src = image.data

  // Box-filter downscale: averaging kills the sensor noise that would otherwise
  // survive thresholding and litter the page with speckles.
  const sx = image.width / width
  const sy = image.height / height
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      let sum = 0
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        let row = yy * image.width * 4
        for (let xx = x0; xx < x1; xx++) {
          const i = row + xx * 4
          sum += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
          n++
        }
      }
      grey[y * width + x] = sum / n
    }
  }
  return { grey, width, height }
}

/** Summed-area table over a Uint8 buffer, for O(1) window means. */
export function integralImage(src: ArrayLike<number>, width: number, height: number): Float64Array {
  const out = new Float64Array((width + 1) * (height + 1))
  const w1 = width + 1
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += src[y * width + x]
      out[(y + 1) * w1 + x + 1] = out[y * w1 + x + 1] + rowSum
    }
  }
  return out
}

/** Inclusive-exclusive rectangle sum from a summed-area table. */
export function rectSum(
  ii: Float64Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const w1 = width + 1
  return ii[y1 * w1 + x1] - ii[y0 * w1 + x1] - ii[y1 * w1 + x0] + ii[y0 * w1 + x0]
}

/**
 * Adaptive threshold. A phone photo has a lighting gradient across the page, so a
 * global threshold either loses the staff lines in the shadow or floods the highlight.
 * Comparing each pixel to the mean of a window a bit wider than a bar of music
 * tracks the gradient without smearing the symbols.
 */
export function adaptiveThreshold(
  grey: Uint8ClampedArray,
  width: number,
  height: number,
  windowSize?: number,
  offset = 9,
): Bitmap {
  const win = Math.max(15, (windowSize ?? Math.round(Math.min(width, height) / 12)) | 1)
  const half = win >> 1
  const ii = integralImage(grey, width, height)
  const out = createBitmap(width, height)

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const area = (x1 - x0) * (y1 - y0)
      const mean = rectSum(ii, width, x0, y0, x1, y1) / area
      out.data[y * width + x] = grey[y * width + x] < mean - offset ? 1 : 0
    }
  }
  return out
}

/**
 * Salt-and-pepper removal by majority vote: a pixel takes the value most of its 3x3
 * neighbourhood has. Unlike blurring the greyscale this does not thicken strokes or
 * close the hole in a half note — a two-pixel line or stem sees six ink neighbours
 * and survives, while a speck sees one or two and does not.
 *
 * Only worth doing on a grainy photo, so it is gated on actually finding loose ink.
 */
export function denoise(b: Bitmap): Bitmap {
  let ink = 0
  let loose = 0
  for (let y = 1; y < b.height - 1; y += 2) {
    for (let x = 1; x < b.width - 1; x += 2) {
      if (!b.data[y * b.width + x]) continue
      ink++
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) n += b.data[(y + dy) * b.width + x + dx]
      }
      if (n <= 2) loose++
    }
  }
  if (ink === 0 || loose / ink < 0.06) return b

  const out = createBitmap(b.width, b.height)
  for (let y = 1; y < b.height - 1; y++) {
    for (let x = 1; x < b.width - 1; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) n += b.data[(y + dy) * b.width + x + dx]
      }
      out.data[y * b.width + x] = n >= 5 ? 1 : 0
    }
  }
  return out
}

/**
 * Most common vertical run lengths. In music notation the commonest black run is a
 * staff line's thickness and the commonest white run is the gap between two staff
 * lines — which gives us the one scale factor the whole pipeline is expressed in.
 */
export function runLengthScale(b: Bitmap): { lineThickness: number; staffSpace: number } {
  const blackHist = new Uint32Array(64)
  const whiteHist = new Uint32Array(128)

  for (let x = 0; x < b.width; x++) {
    let run = 0
    let value = 0
    for (let y = 0; y < b.height; y++) {
      const v = b.data[y * b.width + x]
      if (v === value) {
        run++
      } else {
        if (value === 1 && run < blackHist.length) blackHist[run]++
        else if (value === 0 && run < whiteHist.length) whiteHist[run]++
        value = v
        run = 1
      }
    }
    if (value === 1 && run < blackHist.length) blackHist[run]++
  }

  const modeOf = (hist: Uint32Array, from: number) => {
    let best = from
    let bestCount = -1
    for (let i = from; i < hist.length; i++) {
      if (hist[i] > bestCount) {
        bestCount = hist[i]
        best = i
      }
    }
    return best
  }

  const lineThickness = Math.max(1, modeOf(blackHist, 1))
  // Ignore very short white runs: they are gaps inside symbols, not staff spaces.
  const staffSpace = Math.max(3, modeOf(whiteHist, Math.max(3, lineThickness + 1)))
  return { lineThickness, staffSpace }
}

/**
 * Correct a small rotation by shearing rows. Staff lines are the strongest horizontal
 * structure on the page, so the shear that makes the row-ink profile spikiest is the
 * one that makes them level. Cheaper than a real rotation and accurate to ~0.2°.
 */
export function deskew(b: Bitmap, maxDegrees = 6): { bitmap: Bitmap; degrees: number } {
  const cx = b.width >> 1
  const step = 0.25
  let bestSlope = 0
  let bestScore = -Infinity

  const profile = new Float64Array(b.height)
  for (let deg = -maxDegrees; deg <= maxDegrees; deg += step) {
    const slope = Math.tan((deg * Math.PI) / 180)
    profile.fill(0)
    // Sample every 3rd column and row: the score is a statistic, not an image.
    for (let x = 0; x < b.width; x += 3) {
      const shift = Math.round(slope * (x - cx))
      for (let y = 0; y < b.height; y++) {
        if (b.data[y * b.width + x]) {
          const ty = y - shift
          if (ty >= 0 && ty < b.height) profile[ty]++
        }
      }
    }
    let score = 0
    for (let y = 1; y < b.height; y++) {
      const d = profile[y] - profile[y - 1]
      score += d * d
    }
    if (score > bestScore) {
      bestScore = score
      bestSlope = slope
    }
  }

  if (Math.abs(bestSlope) < 1e-4) return { bitmap: b, degrees: 0 }

  const out = createBitmap(b.width, b.height)
  for (let x = 0; x < b.width; x++) {
    const shift = Math.round(bestSlope * (x - cx))
    for (let y = 0; y < b.height; y++) {
      if (b.data[y * b.width + x]) {
        const ty = y - shift
        if (ty >= 0 && ty < b.height) out.data[ty * b.width + x] = 1
      }
    }
  }
  return { bitmap: out, degrees: (Math.atan(bestSlope) * 180) / Math.PI }
}

/** Length of the contiguous ink run through (x, y), vertically. */
export function verticalRun(b: Bitmap, x: number, y: number): number {
  if (!at(b, x, y)) return 0
  let n = 1
  for (let yy = y - 1; yy >= 0 && b.data[yy * b.width + x]; yy--) n++
  for (let yy = y + 1; yy < b.height && b.data[yy * b.width + x]; yy++) n++
  return n
}

/** Length of the contiguous ink run through (x, y), horizontally. */
export function horizontalRun(b: Bitmap, x: number, y: number): number {
  if (!at(b, x, y)) return 0
  let n = 1
  for (let xx = x - 1; xx >= 0 && b.data[y * b.width + xx]; xx--) n++
  for (let xx = x + 1; xx < b.width && b.data[y * b.width + xx]; xx++) n++
  return n
}

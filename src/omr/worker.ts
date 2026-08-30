/** Recognition runs off the main thread: the pipeline takes a second or two on a
 *  phone, and the progress bar has to keep moving while it does. */

import { recognize, type RecognizeOptions } from './recognize'

export interface WorkerRequest {
  data: Uint8ClampedArray
  width: number
  height: number
  options: Omit<RecognizeOptions, 'onProgress'>
}

export type WorkerResponse =
  | { type: 'progress'; stage: string; fraction: number }
  | { type: 'done'; score: import('../lib/types').Score; preview: { data: Uint8ClampedArray; width: number; height: number } }
  | { type: 'error'; message: string }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { data, width, height, options } = event.data
  try {
    const image = { data, width, height, colorSpace: 'srgb' } as ImageData
    const result = recognize(image, {
      ...options,
      onProgress: (stage, fraction) =>
        (self as unknown as Worker).postMessage({ type: 'progress', stage, fraction }),
    })
    ;(self as unknown as Worker).postMessage(
      { type: 'done', score: result.score, preview: result.preview },
      [result.preview.data.buffer],
    )
  } catch (error) {
    ;(self as unknown as Worker).postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

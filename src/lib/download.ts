/**
 * Handing a file to the person using the app.
 *
 * On an ordinary web host an anchor with `download` is all it takes. Inside the
 * claude.ai artifact viewer the page is sandboxed and cannot start a download itself:
 * the host mediates saves, and its allowlist of extensions has no entry for `.mid`.
 * So there the export is withheld rather than offered and silently doing nothing —
 * a control that says what it does, or is not shown.
 */

/**
 * Whether this page can save a file at all. The artifact viewer is the one host that
 * puts a `claude` object on the window, framed or not, which makes it the signal.
 */
export function canSaveFiles(): boolean {
  return typeof (window as { claude?: unknown }).claude === 'undefined'
}

export function saveFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

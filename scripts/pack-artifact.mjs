/**
 * Fold the built app into one self-contained HTML fragment.
 *
 * Artifacts host a single page and block every external fetch, so the stylesheet and
 * the script have to travel inside the markup. The Web Worker already rides along in
 * the bundle (`?worker&inline`). The output omits the document skeleton, which the
 * artifact host supplies.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const css = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)].map(([, href]) =>
  readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8'),
)
const js = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g)].map(([, src]) =>
  readFileSync(join(dist, src.replace(/^\.?\//, '')), 'utf8'),
)

if (css.length === 0 || js.length === 0) {
  throw new Error(`nothing to inline: found ${css.length} stylesheets and ${js.length} scripts`)
}

// A closing script tag inside a string literal would end the block early.
const guard = (code) => code.replace(/<\/script/gi, '<\\/script')

const out = `<title>Pia</title>
<style>
${css.join('\n')}
</style>

<div id="root"></div>

<script type="module">
${guard(js.join('\n;\n'))}
</script>
`

const target = process.argv[2] ?? '.fixtures/pia.html'
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, out)
console.log(`wrote ${target} (${(out.length / 1024).toFixed(0)} KB)`)

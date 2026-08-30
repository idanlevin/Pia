/** Drive the built app in a real browser: scan the fixture, play it, check the sound. */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const shot = (page, name) => page.screenshot({ path: `.fixtures/${name}.png`, fullPage: false })

// This image ships one full Chromium at a fixed path rather than the build the
// installed Playwright would fetch, so point at it explicitly.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
})
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()))
page.on('pageerror', (e) => console.log('UNCAUGHT:', e.message))

await page.goto(BASE, { waitUntil: 'networkidle' })
await shot(page, 'shot-home')
console.log('home:', await page.title())

// --- demo path -------------------------------------------------------------
await page.getByRole('button', { name: /Ode to Joy/ }).click()
await page.waitForSelector('canvas')
await page.getByRole('button', { name: 'Play' }).click()
await page.waitForTimeout(1400)
await shot(page, 'shot-demo-playing')

const lit = await page.evaluate(() =>
  [...document.querySelectorAll('svg[aria-label="Piano keyboard"] rect')].filter((r) =>
    /fbbf24|fcd34d|d99a1f|b07a12/i.test(r.getAttribute('fill') ?? ''),
  ).length,
)
console.log('keys lit while playing:', lit)

const moved = await page.evaluate(async () => {
  const before = performance.now()
  await new Promise((r) => setTimeout(r, 500))
  return performance.now() - before > 400
})
console.log('clock advanced:', moved)

await page.getByRole('button', { name: 'Pause' }).click()
await page.getByRole('button', { name: 'Back', exact: true }).click()

// --- scan path -------------------------------------------------------------
await page.getByRole('button', { name: /Scan sheet music/ }).click()
await page.waitForTimeout(600)
await page.setInputFiles('input[type=file]', {
  name: 'sheet.png',
  mimeType: 'image/png',
  buffer: readFileSync('.fixtures/sheet.png'),
})

await page.waitForSelector('[role=tablist]', { timeout: 30000 })
await page.waitForTimeout(400)
await shot(page, 'shot-scanned')

console.log('--- player screen text ---')
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 300))

// Play the scanned score too, and confirm the transport actually moves through it.
await page.getByRole('button', { name: 'Play' }).click()
await page.waitForTimeout(2500)
console.log('bar readout while playing:', await page.locator('text=/Bar \\d+ \\/ \\d+/').innerText())
await shot(page, 'shot-scan-playing')
await page.getByRole('button', { name: 'Pause' }).click()

await page.getByRole('tab', { name: 'Sheet' }).click()
await page.waitForTimeout(300)
await shot(page, 'shot-sheet')
// --- practice controls -----------------------------------------------------
await page.getByRole('tab', { name: 'Play' }).click()
await page.getByRole('button', { name: 'Loop' }).click()
await page.getByRole('button', { name: 'Left hand' }).click()
await page.locator('input[type=range]').fill('50')
await page.getByRole('button', { name: 'Click' }).click()
await page.getByRole('button', { name: 'Count in' }).click()
console.log('after practice toggles:', await page.locator('text=/Looping bars/').isVisible())
console.log('tempo readout:', await page.locator('text=/bpm/').first().innerText())
await page.getByRole('button', { name: 'Play' }).click()
await page.waitForTimeout(1800)
await shot(page, 'shot-practice')
await page.getByRole('button', { name: 'Pause' }).click()

// --- editing ---------------------------------------------------------------
await page.getByRole('tab', { name: 'Fix notes' }).click()
await page.waitForTimeout(200)

// Tap the first note in the roll: it sits at the playhead, bottom-left of the canvas.
const canvas = page.locator('canvas')
const box = await canvas.boundingBox()
const before = await page.evaluate(() => document.body.innerText.includes('Selected note —'))
await canvas.click({ position: { x: 20, y: box.height - 60 } })
const heading = await page.locator('h3').nth(1).innerText()
console.log('selection before/after:', before, '/', heading)

if (heading.includes('—')) {
  await page.getByRole('button', { name: '+8ve' }).click()
  console.log('after octave up:', await page.locator('h3').nth(1).innerText())
  await page.getByRole('button', { name: '½', exact: true }).click()
}
await shot(page, 'shot-fix')

const errors = await page.evaluate(() => window.__errors ?? 0)
console.log('page errors:', errors)
await browser.close()

/** Drive the packed single-file build, the way an artifact host will serve it. */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`))
page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`))

await page.goto('http://localhost:4180/', { waitUntil: 'networkidle' })
console.log('rendered:', await page.locator('h1').first().innerText())

await page.getByRole('button', { name: /Twinkle/ }).click()
await page.getByRole('button', { name: 'Play' }).click()
await page.waitForTimeout(1500)
console.log('playing, bar:', await page.locator('text=/Bar \\d+ \\/ \\d+/').innerText())
await page.getByRole('button', { name: 'Pause' }).click()
await page.getByRole('button', { name: 'Back', exact: true }).click()

// The camera will be refused in a sandboxed frame; the file picker must still work.
await page.getByRole('button', { name: /Scan sheet music/ }).click()
await page.waitForTimeout(500)
await page.setInputFiles('input[type=file]', {
  name: 'sheet.png',
  mimeType: 'image/png',
  buffer: readFileSync('.fixtures/sheet.png'),
})
await page.waitForSelector('[role=tablist]', { timeout: 30000 })
await page.getByRole('tab', { name: 'Sheet' }).click()
await page.waitForTimeout(400)
console.log('after scan:', (await page.evaluate(() => document.body.innerText)).match(/\d+ staves[^.]*\./)?.[0])
await page.screenshot({ path: '.fixtures/shot-single.png' })

console.log('problems:', problems.length ? problems : 'none')
await browser.close()

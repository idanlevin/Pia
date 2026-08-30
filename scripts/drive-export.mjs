/** The export control must appear on a normal host and be withheld in the viewer. */
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

for (const viewer of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } })
  if (viewer) {
    // What the artifact host puts on the window before any page script runs.
    await page.addInitScript(() => {
      window.claude = { use: async () => null }
    })
  }
  await page.goto('http://localhost:4180/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Twinkle/ }).click()
  await page.waitForSelector('[role=tablist]')
  const midi = await page.getByRole('button', { name: 'MIDI' }).count()
  console.log(`${viewer ? 'artifact viewer' : 'ordinary host'}: MIDI button count = ${midi}`)
  await page.close()
}

await browser.close()

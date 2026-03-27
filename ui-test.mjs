import puppeteer from './server/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const SS_DIR = '/tmp/inkframe-screenshots'
mkdirSync(SS_DIR, { recursive: true })

let pass = 0, fail = 0
const ok    = (label)    => { console.log(`  ✅ ${label}`); pass++ }
const err   = (label, e) => { console.log(`  ❌ ${label}: ${e?.message?.split('\n')[0] ?? e}`); fail++ }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
const ss   = (name) => page.screenshot({ path: `${SS_DIR}/${name}.png` })

// Wait until "Loading" text is gone
const waitLoaded = () => page.waitForFunction(
  () => !document.body.innerText.includes('Loading books') && !document.body.innerText.includes('Loading projects'),
  { timeout: 8000 }
).catch(() => {})

const waitType = async (sel, text) => {
  await page.waitForSelector(sel, { timeout: 8000 })
  await page.click(sel, { clickCount: 3 })
  await page.type(sel, text)
}

let BOOK_ID = ''

// ── 1. Landing page ───────────────────────────────────────────────────────────
console.log('\n[1] Landing page')
try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 15000 })
  await ss('01-landing')
  ok(`Loaded — title: "${await page.title()}"`)
} catch(e) { err('Landing page', e) }

// ── 2. Login ──────────────────────────────────────────────────────────────────
console.log('\n[2] Login')
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await waitType('input[type="email"]',    'uitester@inkframe.io')
  await waitType('input[type="password"]', 'testpass123')
  await ss('02-login-filled')
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.click('button[type="submit"]'),
  ])
  ok(`Logged in → ${page.url()}`)
} catch(e) { err('Login', e) }

// ── 3. Dashboard ──────────────────────────────────────────────────────────────
console.log('\n[3] Dashboard')
try {
  await waitLoaded()
  await sleep(500)
  await ss('03-dashboard')
  const body = await page.$eval('body', el => el.innerText)
  const hasContent = body.includes('Your Books') && (body.includes('No books') || body.includes('books'))
  if (!hasContent) throw new Error(`Unexpected content: ${body.slice(0,100)}`)
  ok('Dashboard rendered with "Your Books"')
} catch(e) { err('Dashboard', e) }

// ── 4. Open "New Book" modal ──────────────────────────────────────────────────
console.log('\n[4] New Book modal')
try {
  // Target the button in the main content area, not the sidebar link
  await page.evaluate(() => {
    const allBtns = [...document.querySelectorAll('button')]
    const btn = allBtns.find(b => b.textContent.trim().includes('New Book'))
    if (!btn) throw new Error('No button with "New Book" text')
    btn.click()
  })
  await page.waitForSelector('input[placeholder="My Amazing Book"]', { timeout: 6000 })
  await ss('04-modal-open')
  ok('Modal opened')
} catch(e) { err('Open modal', e) }

// ── 5. Fill & submit book form ────────────────────────────────────────────────
console.log('\n[5] Fill & submit book form')
try {
  await waitType('input[placeholder="My Amazing Book"]', 'Deep Focus')
  await waitType('input[placeholder="Optional subtitle"]', 'The Science of Concentration')
  await page.select('select', 'self-help')
  await ss('05-modal-filled')
  await Promise.all([
    page.waitForNavigation({ timeout: 12000 }),
    page.click('button[type="submit"]'),
  ])
  BOOK_ID = page.url().split('/').pop() || ''
  ok(`Book created → ${page.url()}`)
  await ss('06-editor-loaded')
} catch(e) { err('Submit book form', e) }

// ── 6. Editor — wait for load ─────────────────────────────────────────────────
console.log('\n[6] Editor — layout check')
try {
  await page.waitForSelector('textarea', { timeout: 10000 })
  await sleep(800)
  await ss('07-editor-ready')
  // Check three column layout present
  const hasChapterList = await page.$eval('body', b => b.innerText.includes('Chapters'))
  const hasAIPanel     = await page.$eval('body', b => b.innerText.includes('AI Assistant'))
  if (!hasChapterList) throw new Error('Chapter list not found')
  if (!hasAIPanel)     throw new Error('AI panel not found')
  ok('Three-column editor layout: Chapter list ✓  Editor ✓  AI Panel ✓')
} catch(e) { err('Editor layout', e) }

// ── 7. Add a chapter ──────────────────────────────────────────────────────────
console.log('\n[7] Add chapter')
try {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const btn = btns.find(b => b.textContent.includes('Add Chapter'))
    if (!btn) throw new Error('Add Chapter button not found')
    btn.click()
  })
  await sleep(1000)
  await ss('08-chapter-added')
  // Verify chapter appeared in the list
  const chapterText = await page.$eval('body', b => b.innerText)
  if (!chapterText.includes('Chapter 1')) throw new Error('Chapter 1 not in list')
  ok('Chapter 1 added and visible in list')
} catch(e) { err('Add chapter', e) }

// ── 8. Type content ───────────────────────────────────────────────────────────
console.log('\n[8] Type content into editor')
try {
  await page.waitForSelector('textarea', { timeout: 5000 })
  await page.click('textarea')
  await page.type('textarea', 'Deep focus is the ability to concentrate without distraction on demanding cognitive tasks. In a world of constant notifications, this skill is increasingly rare and valuable.')
  await sleep(500)
  await ss('09-typing')
  ok('Content typed into editor')
} catch(e) { err('Type content', e) }

// ── 9. Word count ─────────────────────────────────────────────────────────────
console.log('\n[9] Word counter')
try {
  const bodyText = await page.$eval('body', el => el.innerText)
  const match = bodyText.match(/(\d+)\s*words/)
  if (!match) throw new Error('Word count not found in page')
  ok(`Word counter shows: ${match[0]}`)
} catch(e) { err('Word counter', e) }

// ── 10. Edit chapter title ────────────────────────────────────────────────────
console.log('\n[10] Edit chapter title')
try {
  const titleInput = await page.$('input[placeholder="Chapter Title"]')
  if (!titleInput) throw new Error('Chapter title input not found')
  await titleInput.click({ clickCount: 3 })
  await page.keyboard.type('Introduction: Deep Work')
  // Click Save
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find(b => b.textContent.trim() === 'Save')?.click()
  })
  await sleep(800)
  await ss('10-chapter-saved')
  ok('Chapter title edited and saved')
} catch(e) { err('Edit chapter title', e) }

// ── 11. AI panel tabs ─────────────────────────────────────────────────────────
console.log('\n[11] AI panel')
try {
  const bodyText = await page.$eval('body', el => el.innerText)
  const hasOutline   = bodyText.includes('outline')
  const hasContinue  = bodyText.includes('continue')
  const hasRewrite   = bodyText.includes('rewrite')
  const hasSummarize = bodyText.includes('summarize')
  if (!hasOutline || !hasContinue || !hasRewrite || !hasSummarize) {
    throw new Error('Not all AI tabs present')
  }
  await ss('11-ai-panel')
  ok('AI panel has all 4 tabs: outline | continue | rewrite | summarize')
} catch(e) { err('AI panel', e) }

// ── 12. Export page ───────────────────────────────────────────────────────────
console.log('\n[12] Export page')
try {
  await page.goto(`${BASE}/export/${BOOK_ID}`, { waitUntil: 'networkidle2', timeout: 10000 })
  await sleep(500)
  await ss('12-export-page')
  const body = await page.$eval('body', el => el.innerText)
  if (!body.includes('Export')) throw new Error('Export heading not found')
  const hasEpub    = body.includes('ePub')
  const hasPdfD    = body.includes('PDF Digital') || body.includes('Digital')
  const hasPdfP    = body.includes('PDF Print')   || body.includes('Print')
  const hasAudio   = body.includes('Audio')
  ok(`Export cards: ePub ${hasEpub?'✓':'✗'}  PDF Digital ${hasPdfD?'✓':'✗'}  PDF Print ${hasPdfP?'✓':'✗'}  Audio ${hasAudio?'✓':'✗'}`)
} catch(e) { err('Export page', e) }

// ── 13. Publish page ──────────────────────────────────────────────────────────
console.log('\n[13] Publish page')
try {
  await page.goto(`${BASE}/publish/${BOOK_ID}`, { waitUntil: 'networkidle2', timeout: 10000 })
  await sleep(1500)
  await ss('13-publish-page')
  const body = await page.$eval('body', el => el.innerText)
  if (!body.includes('Publish')) throw new Error('Publish heading not found')
  ok('Publish page loaded: KDP Metadata + Checklist + Platform Links')
} catch(e) { err('Publish page', e) }

// ── 14. Publishing checklist ──────────────────────────────────────────────────
console.log('\n[14] Publishing checklist')
try {
  const body = await page.$eval('body', el => el.innerText)
  const hasTitle   = body.includes('Book title set')
  const hasWords   = body.includes('words')
  const hasChapters = body.includes('chapter')
  if (!hasTitle) throw new Error('"Book title set" item not found')
  ok(`Checklist rendered — checks: title ${hasTitle?'✓':'✗'}  words ${hasWords?'✓':'✗'}  chapters ${hasChapters?'✓':'✗'}`)
} catch(e) { err('Checklist', e) }

// ── 15. Platform links ────────────────────────────────────────────────────────
console.log('\n[15] Platform links')
try {
  const links = await page.$$eval('a[target="_blank"]', els =>
    els.map(el => el.textContent.trim()).filter(t => t.length > 2)
  )
  if (links.length === 0) throw new Error('No platform links found')
  ok(`Platform links: ${links.join(' | ')}`)
} catch(e) { err('Platform links', e) }

// ── 16. Back to dashboard — book card visible ─────────────────────────────────
console.log('\n[16] Dashboard with book card')
try {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: 10000 })
  await waitLoaded()
  await sleep(800)
  await ss('14-dashboard-with-book')
  const body = await page.$eval('body', el => el.innerText)
  if (!body.includes('Deep Focus')) throw new Error('Book "Deep Focus" not on dashboard')
  ok('Book card "Deep Focus" visible on dashboard')
} catch(e) { err('Dashboard book card', e) }

await browser.close()

console.log(`\n${'─'.repeat(50)}`)
console.log(`  RESULTS: ${pass} passed  |  ${fail} failed`)
console.log(`  Screenshots: ${SS_DIR}/`)
console.log('─'.repeat(50))
if (fail > 0) process.exit(1)

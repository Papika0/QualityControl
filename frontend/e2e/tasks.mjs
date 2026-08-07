// Drives the real app in Chromium: logs in as each role, walks a request all
// the way to დასრულებული, and shots the board at three viewports.
//
// Usage: node tasks.mjs <baseUrl> <outDir>

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? './shots'
mkdirSync(OUT, { recursive: true })

let failures = 0
const check = (label, cond, detail = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : `  ← ${detail}`))
  if (!cond) failures++
}

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
}

let browser
let page
/** Console noise for the page, reset at the start of each step. */
let errors = []

/**
 * One browser context for the whole run, because a Playwright context owns its
 * own IndexedDB — a fresh one per role would hand every step a freshly seeded
 * database and quietly undo the step before it. Switching role is what the app
 * itself does: rewrite the stored session and reload.
 *
 * The session goes straight into localStorage; the login form is not what is
 * under test, and every switch would otherwise cost a round of clicks.
 */
async function open(role, person = null, viewport = VIEWPORTS.desktop) {
  errors = []
  const current = page.viewportSize()
  if (current.width !== viewport.width || current.height !== viewport.height) {
    await page.setViewportSize(viewport)
  }
  await page.evaluate(
    ([r, p]) =>
      localStorage.setItem('qc-session', JSON.stringify({ role: r, project: 'NTB', person: p })),
    [role, person],
  )
  await page.goto(`${BASE}/tasks`)
  // Seeding three projects takes a moment on a cold database; the board is the
  // signal, not the nav link that shares its name.
  await page.waitForSelector('[data-testid="task-board"]', { timeout: 60000, state: 'attached' })
  await page.waitForTimeout(250)
  return { page, errors }
}

/** Closes the open ticket so the next step starts from the board. */
async function closeDialog() {
  if (await page.locator('[data-testid="task-dialog"]').count()) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

const columns = (page) =>
  page.$$eval('[data-testid="task-column"]', (els) => els.map((e) => e.dataset.col))
const cards = (page) =>
  page.$$eval('[data-testid="task-card"]', (els) => els.map((e) => e.dataset.id))

const openCard = async (page, id) => {
  await page.click(`[data-testid="task-card"][data-id="${id}"]`)
  await page.waitForSelector('[data-testid="task-dialog"]')
}
const action = (page) => page.locator('[data-testid="task-action"]')
const blocked = async (page) => {
  const el = page.locator('[data-testid="task-blocked"]')
  return (await el.count()) ? (await el.textContent()).trim() : ''
}
const dialogText = (page) => page.locator('[data-testid="task-dialog"]').textContent()
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop })
page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

try {
  // Start from the seed so the walkthrough is reproducible.
  await page.goto(BASE)
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.deleteDatabase('qc-platform')
        r.onsuccess = r.onerror = r.onblocked = res
      }),
  )

  console.log('\n=== board per role (desktop) ===')
  const seen = {}
  for (const [label, role, person] of [
    ['pmdir', 'pmdir', null],
    ['pfm', 'pfm', null],
    ['pm', 'pm', null],
    ['qa/guji', 'qa', 'guji'],
    ['qa/paata', 'qa', 'paata'],
    ['techdir', 'techdir', null],
    ['techsup/daniel', 'techsup', 'daniel'],
    ['admin', 'admin', null],
  ]) {
    await open(role, person)
    const cols = await columns(page)
    const ids = await cards(page)
    seen[label] = { cols, ids }
    console.log(`  ${label.padEnd(15)} cols=${cols.length} [${cols.join('|')}]  cards=${ids.length}`)
    check(`${label}: no console errors`, errors.length === 0, errors[0] ?? '')
    check(`${label}: cards rendered`, ids.length > 0)
    await shot(page, `board-${label.replace('/', '-')}`)
    await closeDialog()
  }

  check('pmdir sees the request column', seen['pmdir'].cols.includes('req'))
  check('pfm sees the request column', seen['pfm'].cols.includes('req'))
  check('pm sees the request column', seen['pm'].cols.includes('req'))
  check('supervisor gets 4 columns, no request',
    !seen['qa/guji'].cols.includes('req') && seen['qa/guji'].cols.length === 4, seen['qa/guji'].cols.join('|'))
  check('techdir has no request column', !seen['techdir'].cols.includes('req'))
  check('guji and paata see different work',
    JSON.stringify(seen['qa/guji'].ids) !== JSON.stringify(seen['qa/paata'].ids))
  check('supervisor sees only their own',
    seen['qa/guji'].ids.every((id) => !seen['qa/paata'].ids.includes(id)))
  check('pm sees more than a supervisor', seen['pm'].ids.length > seen['qa/guji'].ids.length)
  check('tech task hidden from pm', !seen['pm'].ids.includes('T-2110'), seen['pm'].ids.join(','))
  check('tech task hidden from pmdir', !seen['pmdir'].ids.includes('T-2110'))
  check('tech task visible to techdir', seen['techdir'].ids.includes('T-2110'))
  check('tech task visible to its techsup', seen['techsup/daniel'].ids.includes('T-2110'))
  check('admin sees everything', seen['admin'].ids.length >= seen['pm'].ids.length)

  console.log('\n=== responsive ===')
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    await open('pm', null, viewport)
    await shot(page, `responsive-${name}`)

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    check(`${name}: page does not scroll sideways`, !sideways)

    // A wrapped pipeline is the bug this layout exists to prevent.
    const tops = await page.$$eval('[data-testid="task-column"]', (els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    )
    check(`${name}: all 5 columns on one row`, new Set(tops).size === 1, `tops=${[...new Set(tops)]}`)

    const widths = await page.$$eval('[data-testid="task-column"]', (els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().width)),
    )
    check(`${name}: columns are usable width`, Math.min(...widths) >= 150, `widths=${widths}`)
    check(`${name}: no console errors`, errors.length === 0, errors[0] ?? '')
    await closeDialog()
  }

  console.log('\n=== ticket dialog layout ===')
  for (const [name, viewport, wantStacked] of [
    ['phone', VIEWPORTS.phone, true],
    ['desktop', VIEWPORTS.desktop, false],
  ]) {
    await open('pm', null, viewport)
    await openCard(page, 'T-2105')
    await shot(page, `dialog-${name}`)
    const box = (sel) =>
      page.$eval(sel, (e) => {
        const r = e.getBoundingClientRect()
        return { top: Math.round(r.top), width: Math.round(r.width) }
      })
    const left = await box('[data-testid="task-col-left"]')
    const right = await box('[data-testid="task-col-right"]')
    const stacked = left.top !== right.top
    check(`${name}: dialog ${wantStacked ? 'stacks' : 'is two columns'}`, stacked === wantStacked,
      `left=${JSON.stringify(left)} right=${JSON.stringify(right)}`)
    check(`${name}: columns wide enough to use`, Math.min(left.width, right.width) >= 280,
      `left=${left.width} right=${right.width}`)
    const dlgSideways = await page.$eval('[data-testid="task-dialog"]', (d) => d.scrollWidth > d.clientWidth + 1)
    check(`${name}: dialog does not scroll sideways`, !dlgSideways)
    await closeDialog()
  }

  console.log('\n=== workflow, clicked end to end ===')
  {
    await open('pm')
    await openCard(page, 'T-2101')
    check('publish blocked, and says why', (await blocked(page)).includes('დანიშნეთ შემსრულებელი'), await blocked(page))
    check('publish button disabled', await action(page).isDisabled())
    await shot(page, 'flow-1-blocked')

    await page.getByRole('button', { name: /რედაქტირება/ }).first().click()
    await page.waitForSelector('[data-testid="task-dialog"] select')
    await page.locator('[data-testid="task-dialog"] select').first().selectOption('guji')
    await page.getByPlaceholder('პუნქტი 1').fill('ვიზუალური დათვალიერება')
    await page.getByRole('button', { name: /^შენახვა$/ }).click()
    await page.waitForTimeout(900)

    check('publish enabled once assigned and broken down', await action(page).isEnabled(), await blocked(page))
    check('action is publish', (await action(page).getAttribute('data-kind')) === 'publish')
    await shot(page, 'flow-2-ready-to-publish')
    await action(page).click()
    await page.waitForTimeout(900)
    check('landed in ახალი', (await dialogText(page)).includes('ახალი'))
    check('no console errors', errors.length === 0, errors[0] ?? '')
    await closeDialog()
  }
  {
    await open('qa', 'guji')
    check('the published task reached its supervisor', (await cards(page)).includes('T-2101'))
    await openCard(page, 'T-2101')
    check('supervisor has no edit button', (await page.getByRole('button', { name: /რედაქტირება/ }).count()) === 0)
    check('action is start', (await action(page).getAttribute('data-kind')) === 'start')
    await shot(page, 'flow-3-supervisor')
    await action(page).click()
    await page.waitForTimeout(900)

    const cb = page.locator('[role="checkbox"]').first()
    check('checklist unlocks once started', await cb.isEnabled())
    await cb.click()
    await page.waitForTimeout(800)
    check('tick persisted', (await cb.getAttribute('aria-checked')) === 'true')
    check('tick is attributed', (await dialogText(page)).includes('გუჯი გვენცაძე'))

    check('action is ready', (await action(page).getAttribute('data-kind')) === 'ready')
    await action(page).click()
    await page.waitForTimeout(900)
    check('ready stamp shown', (await dialogText(page)).includes('მზადაა —'))
    await shot(page, 'flow-4-ready')
    check('no console errors', errors.length === 0, errors[0] ?? '')
    await closeDialog()
  }
  {
    await open('qa', 'paata')
    check("another supervisor cannot see guji's task", !(await cards(page)).includes('T-2101'))
    await closeDialog()
  }
  {
    await open('pm')
    await openCard(page, 'T-2101')
    check('manager sees the sign-off', (await dialogText(page)).includes('მზადაა —'))
    check('action is confirm', (await action(page).getAttribute('data-kind')) === 'confirm')
    await action(page).click()
    await page.waitForTimeout(900)
    check('moved to შემოწმებაზე', (await dialogText(page)).includes('შემოწმებაზე'))
    check('ready stamp cleared on the move', !(await dialogText(page)).includes('მზადაა —'))
    await closeDialog()
  }
  {
    await open('qa', 'guji')
    await openCard(page, 'T-2101')
    await action(page).click() // sign off again
    await page.waitForTimeout(900)
    await closeDialog()
  }
  {
    await open('pm')
    await openCard(page, 'T-2101')
    check('close is gated on the technical sign-off',
      (await blocked(page)).includes('ტექნიკური დადასტურება') && (await action(page).isDisabled()),
      await blocked(page))
    await shot(page, 'flow-5-tech-gate')
    await closeDialog()
  }
  {
    await open('techdir')
    await openCard(page, 'T-2101')
    check('techdir is offered the vouch', (await action(page).getAttribute('data-kind')) === 'techok')
    await action(page).click()
    await page.waitForTimeout(900)
    check('vouch recorded', (await dialogText(page)).includes('ტექნიკურად დადასტურებული'))
    await closeDialog()
  }
  {
    await open('pm')
    await openCard(page, 'T-2101')
    check('close now open to the manager', await action(page).isEnabled(), await blocked(page))
    await action(page).click()
    await page.waitForTimeout(1000)
    check('task closed', (await dialogText(page)).includes('დასრულებულია'))
    await shot(page, 'flow-6-done')
    await closeDialog()
  }
  {
    // The tech track closes on its own authority.
    await open('techsup', 'daniel')
    await openCard(page, 'T-2110')
    check('techsup signs off their own tech task', (await action(page).getAttribute('data-kind')) === 'ready')
    await action(page).click()
    await page.waitForTimeout(900)
    await closeDialog()
  }
  {
    await open('techdir')
    await openCard(page, 'T-2110')
    check('techdir confirms the tech track', (await action(page).getAttribute('data-kind')) === 'confirm')
    check('no tech gate on the tech track', await action(page).isEnabled(), await blocked(page))
    await closeDialog()
  }

  console.log('\n=== create dialog ===')
  {
    await open('pmdir', null, VIEWPORTS.phone)
    await page.getByRole('button', { name: /ახალი დავალება/ }).click()
    await page.waitForSelector('text=სათაური')
    await shot(page, 'create-phone')
    const body = await page.locator('[role="dialog"]').textContent()
    check('director gets no assignee picker', !body.includes('შემსრულებელი'))
    check('director gets no checklist', !body.includes('პუნქტის დამატება'))
    check('floors offered', /მე-21|მე-14/.test(body))
    const sideways = await page.$eval('[role="dialog"]', (d) => d.scrollWidth > d.clientWidth + 1)
    check('create dialog fits a phone', !sideways)
    check('no console errors', errors.length === 0, errors[0] ?? '')
    await closeDialog()
  }
  {
    await open('pm', null, VIEWPORTS.desktop)
    await page.getByRole('button', { name: /ახალი დავალება/ }).click()
    await page.waitForSelector('text=სათაური')
    const body = await page.locator('[role="dialog"]').textContent()
    check('manager gets assignee and checklist',
      body.includes('შემსრულებელი') && body.includes('პუნქტის დამატება'))
    await shot(page, 'create-desktop')
    await closeDialog()
  }
  {
    await open('qa', 'guji')
    check('supervisor cannot create', (await page.getByRole('button', { name: /ახალი დავალება/ }).count()) === 0)
    await closeDialog()
  }
} finally {
  await browser.close()
}

console.log(failures === 0 ? '\nALL BROWSER CHECKS PASSED\n' : `\n${failures} BROWSER CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

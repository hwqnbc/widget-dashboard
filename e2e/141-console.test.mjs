/**
 * In-app console viewer suite: the capture store's pure contract plus the
 * app-bar dialog that renders it.
 *
 * Pure half (bundled `utils/consoleLog`): argument formatting (bare top-level
 * strings, quoted nested ones, Error stacks, circular guards, depth cap,
 * truncation), the ring (cap, eviction, monotonic ids), consecutive-repeat
 * collapsing, the warn+error issue tally, filtering and the clipboard export.
 *
 * Live half: the app-bar button opens the dialog on any page, messages logged
 * in page context show up with the right level, repeats collapse into one row
 * with a count, the badge tracks warn+error only, uncaught errors and
 * unhandled rejections are captured (the whole point on a phone), level +
 * text filters narrow the list, Clear empties it, the buffer survives route
 * changes but not a reload, and the dialog fits a phone viewport.
 */
import { BASE_URL, launch, reporter } from './helpers.mjs'
import {
  LOG_LIMIT,
  TEXT_LIMIT,
  clearEntries,
  countLevels,
  filterEntries,
  formatArgs,
  formatEntries,
  getEntries,
  getIssueCount,
  recordLog,
} from './.bundle/consoleLog.js'

const { check, finish } = reporter('console')

// ------------------------------------------------------------ pure: formatting

check('top-level string prints bare', formatArgs(['hello']) === 'hello')
check('args join with a space', formatArgs(['a', 1, true]) === 'a 1 true')
check(
  'nested strings are quoted',
  formatArgs([{ a: 'x' }]) === '{ a: "x" }',
  formatArgs([{ a: 'x' }]),
)
check('null and undefined survive', formatArgs([null, undefined]) === 'null undefined')
const errText = formatArgs([new Error('boom')])
check('Error renders name + message', errText.startsWith('Error: boom'), errText.slice(0, 40))

const circular = { name: 'root' }
circular.self = circular
const circularText = formatArgs([circular])
check('circular reference is guarded', circularText.includes('[Circular]'), circularText)

const deep = { a: { b: { c: { d: { e: 1 } } } } }
check('depth is capped', formatArgs([deep]).includes('{...}'), formatArgs([deep]))

const long = formatArgs(['x'.repeat(TEXT_LIMIT * 2)])
check('long text is truncated', long.length < TEXT_LIMIT + 60 && long.includes('chars)'))
check('arrays render inline', formatArgs([[1, 2, 3]]) === '[1, 2, 3]')
check(
  'a long array is elided',
  formatArgs([Array.from({ length: 30 }, (_, i) => i)]).includes('more'),
)

// ----------------------------------------------------------------- pure: ring

clearEntries()
recordLog('log', ['first'], 1000)
recordLog('warn', ['second'], 2000)
let entries = getEntries()
check('entries append in order', entries.length === 2 && entries[0].text === 'first')
check('level is recorded', entries[1].level === 'warn')
check('timestamp is recorded', entries[1].time === 2000)
check('a fresh entry has count 1', entries[0].count === 1)

recordLog('warn', ['second'], 3000)
recordLog('warn', ['second'], 4000)
entries = getEntries()
check('identical consecutive messages collapse', entries.length === 2, `len ${entries.length}`)
check('the repeat count climbs', entries[1].count === 3)
check('the collapsed row keeps the newest time', entries[1].time === 4000)
recordLog('log', ['second'], 5000)
check('a different level does not collapse', getEntries().length === 3)

check('issues count warn+error only', getIssueCount() === 3, `issues ${getIssueCount()}`)
recordLog('error', ['bad'], 6000)
check('an error bumps the issue count', getIssueCount() === 4)

clearEntries()
check('clear empties the ring', getEntries().length === 0)
check('clear resets the issue count', getIssueCount() === 0)

for (let i = 0; i < LOG_LIMIT + 20; i++) recordLog('log', [`msg ${i}`], 1000 + i)
entries = getEntries()
check('the ring is capped', entries.length === LOG_LIMIT, `len ${entries.length}`)
check('the oldest messages are evicted', entries[0].text === 'msg 20', entries[0].text)
check('the newest message is kept', entries[entries.length - 1].text === `msg ${LOG_LIMIT + 19}`)
check(
  'ids stay monotonic across eviction',
  entries.every((entry, i) => i === 0 || entry.id > entries[i - 1].id),
)
check('getEntries snapshot identity is stable', getEntries() === getEntries())

// ------------------------------------------------------------- pure: filtering

clearEntries()
recordLog('log', ['plain message'], 1000)
recordLog('warn', ['careful now'], 2000)
recordLog('error', ['exploded badly'], 3000)
recordLog('info', ['just saying'], 4000)
entries = getEntries()

const counts = countLevels(entries)
check('per-level counts tally', counts.log === 1 && counts.warn === 1 && counts.error === 1)
check('issues bucket is warn+error', counts.issues === 2)
check('all filter passes everything', filterEntries(entries, 'all', '').length === 4)
check(
  'issues filter keeps warn+error only',
  filterEntries(entries, 'issues', '').every((e) => e.level === 'warn' || e.level === 'error') &&
    filterEntries(entries, 'issues', '').length === 2,
)
check('level filter is exact', filterEntries(entries, 'error', '')[0].text === 'exploded badly')
check('text filter is a substring match', filterEntries(entries, 'all', 'plain').length === 1)
check('text filter ignores case', filterEntries(entries, 'all', 'EXPLODED').length === 1)
check('filters compose', filterEntries(entries, 'issues', 'careful').length === 1)
check('a non-matching query yields nothing', filterEntries(entries, 'all', 'zzz').length === 0)

const exported = formatEntries(entries)
check('export has one line per entry', exported.split('\n').length === 4)
check('export carries the level', exported.includes('ERROR: exploded badly'))
recordLog('info', ['just saying'], 5000)
check('export marks repeats', formatEntries(getEntries()).includes('(x2)'))

// -------------------------------------------------------------------- live app

const { browser, page } = await launch()
await page.goto(BASE_URL, { waitUntil: 'networkidle' })

const button = page.locator('[data-testid="console-log-button"]')
const dialog = page.locator('[data-testid="console-log-dialog"]')
const rows = page.locator('[data-testid="console-log-entry"]')
const issues = async () => parseInt(await button.getAttribute('data-issues'), 10)
const total = async () => parseInt(await dialog.getAttribute('data-total'), 10)
/** The store notifies on a 150 ms coalescing timer — wait past it. */
const settle = () => page.waitForTimeout(350)
const openConsole = async () => {
  await button.click()
  await dialog.waitFor()
  await settle()
}
const closeConsole = async () => {
  await page.locator('[data-testid="console-log-close"]').click()
  await page.waitForTimeout(300) // dialog exit transition
}
const rowWith = (text) => rows.filter({ hasText: text })

check('the app bar carries a console button', (await button.count()) === 1)
check('the dialog is closed until asked for', (await dialog.count()) === 0)

// A dev build logs its own noise (React/Vite), so work off a baseline rather
// than an absolute zero.
const baseIssues = await issues()
await page.evaluate(() => console.log('e2e-plain-message'))
await settle()
check('an ordinary log does not raise the badge', (await issues()) === baseIssues)

await openConsole()
const baseTotal = await total()
check('the dialog opens on the button', await dialog.isVisible())
check('a page-context log was captured', (await rowWith('e2e-plain-message').count()) === 1)
check(
  'the captured log carries its level',
  (await rowWith('e2e-plain-message').first().getAttribute('data-level')) === 'log',
)
check('the default filter is all', (await dialog.getAttribute('data-filter')) === 'all')

// Logging while the dialog is open must stream in live.
await page.evaluate(() => {
  console.warn('e2e-warned')
  console.error('e2e-errored')
})
await settle()
check('new messages stream in with the dialog open', (await total()) === baseTotal + 2)
check(
  'a warn is captured as warn',
  (await rowWith('e2e-warned').first().getAttribute('data-level')) === 'warn',
)
check(
  'an error is captured as error',
  (await rowWith('e2e-errored').first().getAttribute('data-level')) === 'error',
)
check('warn+error raise the badge', (await issues()) === baseIssues + 2, `${await issues()}`)

// Object arguments — the reason a naive String(arg) capture is useless.
await page.evaluate(() => console.log('e2e-object', { widget: 'drone', hp: 3 }))
await settle()
check(
  'object arguments are formatted, not [object Object]',
  (await rowWith('e2e-object').first().textContent()).includes('widget: "drone"'),
)

// Repeat collapsing (a per-frame logger must not flood the list).
await page.evaluate(() => {
  for (let i = 0; i < 5; i++) console.log('e2e-repeat')
})
await settle()
check('a repeated message occupies one row', (await rowWith('e2e-repeat').count()) === 1)
check(
  'the row shows the repeat count',
  (await rowWith('e2e-repeat').first().getAttribute('data-repeat')) === '5',
)

// The whole point on mobile: errors nobody called console.error for.
await page.evaluate(() => {
  setTimeout(() => {
    throw new Error('e2e-uncaught-boom')
  }, 0)
})
await settle()
check('an uncaught error is captured', (await rowWith('e2e-uncaught-boom').count()) >= 1)
check(
  'the uncaught error is filed as an error',
  (await rowWith('e2e-uncaught-boom').first().getAttribute('data-level')) === 'error',
)

await page.evaluate(() => {
  void Promise.reject(new Error('e2e-rejected-promise'))
})
await settle()
check('an unhandled rejection is captured', (await rowWith('e2e-rejected-promise').count()) >= 1)

// Filters.
await page.locator('[data-testid="console-log-filter-error"]').click()
await settle()
check('picking a filter publishes it', (await dialog.getAttribute('data-filter')) === 'error')
const levels = await rows.evaluateAll((nodes) => nodes.map((n) => n.dataset.level))
check('the error filter shows errors only', levels.length > 0 && levels.every((l) => l === 'error'))
check('the shown count matches the rows', (await dialog.getAttribute('data-count')) === String(levels.length))

await page.locator('[data-testid="console-log-filter-all"]').click()
await page.locator('[data-testid="console-log-search"]').fill('e2e-warned')
await settle()
check('the text filter narrows to one row', (await rows.count()) === 1)
check('the surviving row is the searched one', (await rows.first().textContent()).includes('e2e-warned'))
await page.locator('[data-testid="console-log-search"]').fill('')
await settle()

// The buffer is app-lifetime state, not per-page state.
await closeConsole()
await page.getByRole('link', { name: 'Settings' }).click()
await page.waitForURL(/settings/)
await openConsole()
check('the console is reachable from another page', await dialog.isVisible())
check('messages survive a route change', (await rowWith('e2e-warned').count()) === 1)

// Clear.
await page.locator('[data-testid="console-log-clear"]').click()
await settle()
check('clear empties the list', (await total()) === 0, `${await total()}`)
check('clear shows the empty state', await page.locator('[data-testid="console-log-empty"]').isVisible())
check('clear resets the badge', (await issues()) === 0)
await closeConsole()

// Session-scoped by design: a reload starts a fresh buffer.
await page.evaluate(() => console.log('e2e-before-reload'))
await settle()
await page.reload({ waitUntil: 'networkidle' })
await openConsole()
check('a reload starts a fresh buffer', (await rowWith('e2e-before-reload').count()) === 0)
await closeConsole()

// Phone viewport: the dialog is the only error readout there, so it must fit.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const phonePage = await phone.newPage()
await phonePage.goto(BASE_URL, { waitUntil: 'networkidle' })
await phonePage.evaluate(() => console.error('e2e-phone-error'))
await phonePage.locator('[data-testid="console-log-button"]').click()
const phoneDialog = phonePage.locator('[data-testid="console-log-dialog"]')
await phoneDialog.waitFor()
await phonePage.waitForTimeout(400)
const box = await phoneDialog.boundingBox()
check('the dialog goes full-screen on a phone', box.width >= 380 && box.height >= 700, JSON.stringify(box))
check('the dialog does not overflow the viewport', box.x >= 0 && box.x + box.width <= 390)
const phoneRow = phonePage.locator('[data-testid="console-log-entry"]').filter({ hasText: 'e2e-phone-error' })
check('the error is readable on the phone', (await phoneRow.count()) === 1)
const rowBox = await phoneRow.first().boundingBox()
check('the message stays inside the viewport', rowBox.x + rowBox.width <= 391, JSON.stringify(rowBox))
await phone.close()

await finish(browser)

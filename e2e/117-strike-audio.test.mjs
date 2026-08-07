/**
 * Drone Strike audio suite. AudioContext is stubbed with a recorder before
 * the app loads (headless Chromium has no audio device — we assert the
 * dispatch path, not real sound). The widget publishes a monotonic
 * `data-sfx-*` counter per effect (on the HUD tick) and `data-audio` on the
 * root — the audio contract. Firing bumps sfx-fire and reaches the
 * (gesture-unlocked) engine; kills bump sfx-pop; clearing a wave plays the
 * sting (sfx-clear). Muting from settings freezes both the counters and the
 * engine while the gun still fires, and the setting persists across reload.
 * Finally, a browser with no Web Audio at all still runs the widget.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  setStrikeAssist,
  launch,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'

const { check, finish } = reporter('strike-audio')
const { browser, context, page } = await launch()

// Recorder stub: count context resumes and oscillator creations. Installed
// before any page script so webAudio.ts captures it at module-eval time.
await page.addInitScript(() => {
  window.__audio = { osc: 0, resumed: 0, ctx: 0 }
  const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended'
      this.currentTime = 0
      this.sampleRate = 44100
      this.destination = {}
      window.__audio.ctx++
    }
    resume() {
      this.state = 'running'
      window.__audio.resumed++
      return Promise.resolve()
    }
    createGain() {
      return { gain: { ...param }, connect: (d) => d }
    }
    createOscillator() {
      window.__audio.osc++
      return { type: '', frequency: { ...param }, connect: (d) => d, start() {}, stop() {} }
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(16) }
    }
    createBufferSource() {
      return { buffer: null, connect: (d) => d, start() {}, stop() {} }
    }
    createBiquadFilter() {
      return { type: '', frequency: { value: 0 }, connect: (d) => d }
    }
  }
  window.AudioContext = FakeAudioContext
  window.webkitAudioContext = FakeAudioContext
})

await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false) // steady closed-loop flying
const { hud, combat } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')
const sfx = async (k) => parseInt(await hud.getAttribute(`data-sfx-${k}`), 10)
const audioState = () => page.evaluate(() => window.__audio)

check('wave 1 goes active', await waitForWaveState(page, 'active'))
check('audio on by default', (await root.getAttribute('data-audio')) === 'on')
check('sfx counters start at zero', (await sfx('fire')) === 0 && (await sfx('pop')) === 0)

// Clear wave 1 closed-loop: bolts fire (sfx-fire), targets pop (sfx-pop),
// and the last kill plays the wave-clear sting (sfx-clear). Strong aim assist
// so the pilot can lead the wave-1 movers.
await setStrikeAssist(page, 'strong')
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
let cleared = true
const start = Date.now()
while ((await combat()).targetsLeft > 0) {
  if (Date.now() - start > 240000) {
    cleared = false
    break
  }
  if (!(await pilot.engage({ timeout: 60000 }))) {
    cleared = false
    break
  }
}
await pilot.touchEnd()
check('wave 1 cleared closed-loop', cleared, `targetsLeft=${(await combat()).targetsLeft}`)
check('firing bumped sfx-fire', (await sfx('fire')) > 0, `fire=${await sfx('fire')}`)
check('kills bumped sfx-pop', (await sfx('pop')) > 0, `pop=${await sfx('pop')}`)
check('wave-clear sting played', (await sfx('clear')) >= 1, `clear=${await sfx('clear')}`)
const unlocked = await audioState()
check('context unlocked on a gesture', unlocked.resumed >= 1, JSON.stringify(unlocked))
check('engine reached Web Audio (oscillators created)', unlocked.osc > 0, JSON.stringify(unlocked))

// --- mute: gun still fires, but the SFX path is frozen ---
check('wave 2 active for the mute run', await waitForWaveState(page, 'active'))
await setStrikeSwitch(page, 'strike-audio-toggle', false)
check('audio off after mute', (await root.getAttribute('data-audio')) === 'off')
const fireBefore = await sfx('fire')
const oscBefore = (await audioState()).osc
const shotsBefore = (await combat()).shots
await pilot.touchStart()
await pilot.engage({ timeout: 25000 })
await pilot.touchEnd()
check('muted run still fired the gun', (await combat()).shots > shotsBefore, `${shotsBefore} -> ${(await combat()).shots}`)
check('muted: sfx-fire stayed flat', (await sfx('fire')) === fireBefore, `${fireBefore} -> ${await sfx('fire')}`)
check('muted: no new oscillators', (await audioState()).osc === oscBefore, `${oscBefore} -> ${(await audioState()).osc}`)

// --- persistence ---
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('mute persists across reload', (await root.getAttribute('data-audio')) === 'off')
// Re-enable so the persisted state for the no-API page below is "on".
await waitForWaveState(page, 'active')
await setStrikeSwitch(page, 'strike-audio-toggle', true)

// --- no Web Audio at all (older browsers): widget still runs ---
const page2 = await context.newPage()
await page2.addInitScript(() => {
  window.__audio = { osc: 0 }
  Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true })
  Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true })
})
await page2.goto(page.url(), { waitUntil: 'networkidle' })
await page2.waitForSelector('[data-testid="drone-strike-root"]')
await page2.waitForTimeout(700)
const alt = parseFloat(await page2.locator('[data-testid="strike-hud"]').getAttribute('data-alt'))
check('audio setting restored on', (await page2.locator('[data-testid="drone-strike-root"]').getAttribute('data-audio')) === 'on')
check('widget runs without AudioContext', Number.isFinite(alt), `alt=${alt}`)
check('no oscillators without the API', (await page2.evaluate(() => window.__audio.osc)) === 0)

await finish(browser)

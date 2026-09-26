import { loadThemes } from './lib/themes.js'
import { startScreensaver } from './lib/screensaver.js'
import { createI18n } from './lib/i18n.js'
import './widgets/clock.js'
import './widgets/countdown.js'
import './widgets/agenda.js'
import './widgets/next-event.js'
import './widgets/bitcoin.js'
import './widgets/fx.js'
import './widgets/weather.js'
import './widgets/onchain.js'

const LANGS = ['pt-BR', 'en']
const strings = Object.fromEntries(await Promise.all(LANGS.map(async lang => [lang, await (await fetch(`i18n/${lang}.json`)).json()])))
const saved = key => { try { return localStorage.getItem(`vitral.${key}`) } catch { return null } }
const save = (key, value) => { try { localStorage.setItem(`vitral.${key}`, value) } catch { /* private browsing can deny storage */ } }
// T and L are this screen's own choice, kept with the configured value they replaced: once the
// settings menu sets a different theme or language, that choice is over and the screen follows.
const choose = (key, value, configured) => { save(key, value); save(`${key}.over`, configured ?? '') }
const chosen = (key, configured) => saved(`${key}.over`) === (configured ?? '') ? saved(key) : null
// Before the configuration arrives (or offline), the screen's last choice is the best guess.
const pickLang = configLang => [configLang === undefined ? saved('lang') : chosen('lang', configLang), configLang, navigator.language?.startsWith('en') ? 'en' : 'pt-BR'].find(lang => LANGS.includes(lang))

export async function bootstrap() {
  let config = {}, lang = pickLang(), i18n
  const i18nFor = forLang => createI18n(forLang, strings[forLang], config.timezone)
  const themePromise = loadThemes()
  let stopScreensaver = () => {}
  const scheduleFit = () => {
    let attempts = 0
    const check = () => {
      const widgets = [...document.querySelectorAll('[data-poll]')]
      if (widgets.every(widget => widget.dataset.rendered === 'true') || attempts++ > 10) document.documentElement.dataset.fitted = 'true'
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }
  function apply() {
    document.documentElement.dataset.fitted = 'false'
    document.documentElement.lang = lang
    i18n = createI18n(lang, strings[lang], config.timezone)
    document.querySelector('vitral-clock').start(i18n)
    document.querySelector('vitral-countdown').start(i18n, config.countdowns)
    for (const button of document.querySelectorAll('[data-action]')) button.textContent = i18n.t(`controls.${button.dataset.action}`)
    for (const el of document.querySelectorAll('[data-poll]')) if (el.i18n) el.setLanguage(i18n)
    dispatchEvent(new CustomEvent('vitral:lang', { detail: { i18n } }))
    scheduleFit()
  }
  apply()
  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout(5000) })
    if (response.ok) config = await response.json()
  } catch { /* clock already works while configuration is unavailable */ }
  const themes = await themePromise
  function setTheme(name) {
    const selected = themes.includes(name) ? name : themes[0]
    document.documentElement.dataset.theme = selected
    return selected
  }
  setTheme(chosen('theme', config.theme) ?? config.theme ?? 'terminal')
  lang = pickLang(config.language)
  apply()
  for (const el of document.querySelectorAll('[data-poll]')) el.start(i18n, config)
  stopScreensaver()
  stopScreensaver = startScreensaver({ ...config.screensaver, timezone: config.timezone, root: document.querySelector('.vitral-grid') })

  async function action(name) {
    if (name === 'theme') { choose('theme', setTheme(themes[(themes.indexOf(document.documentElement.dataset.theme) + 1) % themes.length]), config.theme); scheduleFit() }
    if (name === 'language') { lang = lang === 'pt-BR' ? 'en' : 'pt-BR'; choose('lang', lang, config.language); apply(); scheduleFit() }
    if (name === 'fullscreen') {
      try { await (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) } catch { /* kiosk policies may deny fullscreen */ }
    }
    if (name === 'settings') {
      if (document.getElementById('vitral-settings')) return
      const { openSettings } = await import('./settings/menu.js')
      void openSettings({ i18n, i18nFor })
    }
  }
  addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target.matches('input,textarea,select,[contenteditable]')) return
    // a dialog on top handles its own keys; a panel shortcut must not reach the screen behind it
    if (document.querySelector('#vitral-settings, #vitral-setup')) return
    const name = { l: 'language', f: 'fullscreen', t: 'theme', s: 'settings' }[event.key.toLowerCase()]
    if (name) void action(name)
  })
  for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', () => void action(button.dataset.action))
  const controls = document.querySelector('.controls')
  let controlsTimer
  const revealControls = () => {
    controls.classList.add('is-visible')
    controls.setAttribute('aria-hidden', 'false')
    clearTimeout(controlsTimer)
    controlsTimer = setTimeout(() => {
      controls.classList.remove('is-visible')
      controls.setAttribute('aria-hidden', 'true')
    }, 4000)
  }
  addEventListener('pointermove', revealControls, { passive: true })
  addEventListener('touchstart', revealControls, { passive: true })
  if (location.hash === '#settings') {
    history.replaceState(null, '', location.pathname + location.search)
    void action('settings')
  }
  document.documentElement.dataset.ready = 'true'
  scheduleFit()

  if (config.setupDone === false) {
    const { openSetup } = await import('./settings/setup.js')
    void openSetup({ i18nFor })
  }

  // A save from the settings menu, on this screen or any other, bumps the
  // revision; every open screen notices within 30 s and starts over with it.
  const revision = config.revision
  // An update to the panel itself changes version.txt, written when the image is built; a
  // screen left on for weeks picks the new code up by itself. Not while a dialog is open:
  // a reload would throw away what the person is typing, and the next check comes soon.
  const readVersion = async () => {
    const response = await fetch('/version.txt', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    return response.ok ? (await response.text()).trim() : null
  }
  const version = await readVersion().catch(() => null)
  const followRevision = async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      if (response.ok && (await response.json()).revision !== revision) { location.reload(); return }
      const current = version && await readVersion()
      if (current && current !== version && !document.querySelector('#vitral-settings, #vitral-setup')) location.reload()
    } catch { /* offline: the panel keeps showing what it has */ }
  }
  setInterval(followRevision, 30_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void followRevision() })
}
void bootstrap()

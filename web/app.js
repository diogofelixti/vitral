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
const pickLang = configLang => [saved('lang'), configLang, navigator.language?.startsWith('en') ? 'en' : 'pt-BR'].find(lang => LANGS.includes(lang))

export async function bootstrap() {
  let config = {}, lang = pickLang(), i18n
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
    save('theme', selected)
  }
  setTheme(saved('theme') ?? config.theme ?? 'terminal')
  lang = pickLang(config.language)
  apply()
  for (const el of document.querySelectorAll('[data-poll]')) el.start(i18n, config)
  stopScreensaver()
  stopScreensaver = startScreensaver({ ...config.screensaver, timezone: config.timezone, root: document.querySelector('.vitral-grid') })

  async function action(name) {
    if (name === 'theme') { setTheme(themes[(themes.indexOf(document.documentElement.dataset.theme) + 1) % themes.length]); scheduleFit() }
    if (name === 'language') { lang = lang === 'pt-BR' ? 'en' : 'pt-BR'; save('lang', lang); apply(); scheduleFit() }
    if (name === 'fullscreen') {
      try { await (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) } catch { /* kiosk policies may deny fullscreen */ }
    }
  }
  addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target.matches('input,textarea,select,[contenteditable]')) return
    const name = { l: 'language', f: 'fullscreen', t: 'theme' }[event.key.toLowerCase()]
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
  document.documentElement.dataset.ready = 'true'
  scheduleFit()
}
void bootstrap()

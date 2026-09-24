import { h } from './dom.js'
import { openDialog } from './dialog.js'
import { settingsApi } from './client.js'
import { field, showErrors } from './fields.js'
import { cityPicker } from './city.js'
import { calendarEditor } from './calendar-editor.js'

// The step each config path is asked on, so a 422 opens the right one.
const STEP_OF = [['language', 0], ['location', 1], ['timezone', 1], ['calendars', 2]]

export async function openSetup({ i18nFor }) {
  const loaded = await settingsApi.load()
  if (!loaded.ok) return
  const view = loaded.data
  const draft = structuredClone(view.config)
  for (const calendar of Object.values(draft.calendars)) if (calendar.urlSet) calendar.urlKept = true
  draft.language = navigator.language?.startsWith('en') ? 'en' : draft.language
  let step = 0
  let shell
  const usesGoogle = () => Object.values(draft.calendars).some(c => c.provider === 'google')
  const steps = () => usesGoogle() ? ['language', 'city', 'calendars', 'google'] : ['language', 'city', 'calendars']

  async function finish() {
    const i18n = i18nFor(draft.language)
    const saved = await settingsApi.save(draft)
    if (!saved.ok) {
      if (saved.status === 422) {
        const first = saved.data.errors[0]?.path ?? ''
        step = STEP_OF.find(([prefix]) => first.startsWith(prefix))?.[1] ?? 0
        await render()
        showErrors(shell.dialog, saved.data.errors, i18n)
      } else shell.footer.querySelector('.form-error').textContent = i18n.t(`errors.${saved.data?.error ?? 'INTERNAL_ERROR'}`)
      return
    }
    await settingsApi.finishSetup()
    location.reload()
  }

  async function skip() {
    await settingsApi.finishSetup()
    shell.close()
  }

  async function content(i18n, name) {
    if (name === 'language') {
      const choice = (value, text) => h('label', { class: 'settings-row' },
        h('input', { type: 'radio', name: 'setup-language', value, checked: draft.language === value, onchange: () => { draft.language = value; render() } }), text)
      return h('div', {}, h('p', { text: i18n.t('setup.language.intro') }),
        h('div', { role: 'radiogroup', 'aria-label': i18n.t('setup.language.title') }, choice('pt-BR', 'Português'), choice('en', 'English')))
    }
    if (name === 'city') return h('div', {}, h('p', { text: i18n.t('setup.city.intro') }), cityPicker({ i18n, draft }))
    if (name === 'calendars') {
      const editors = ['work', 'personal'].map(profile => calendarEditor({ i18n, profile, draft }))
      for (const editor of editors) editor.addEventListener('change', () => render({ keep: true }))
      return h('div', {}, h('p', { text: i18n.t('setup.calendars.intro') }), ...editors)
    }
    if (name === 'google') {
      const { googlePanel } = await import('./google.js')
      return googlePanel({ i18n, view, draft, inWizard: true })
    }
  }

  async function render({ keep = false } = {}) {
    const i18n = i18nFor(draft.language)
    const names = steps()
    step = Math.min(step, names.length - 1)
    if (!shell) shell = openDialog({ id: 'vitral-setup', title: i18n.t('setup.title'), i18n, onRequestClose: skip })
    shell.dialog.querySelector('h2').textContent = i18n.t('setup.title')
    if (!keep) {
      shell.body.replaceChildren(
        h('p', { class: 'setup-progress', text: i18n.t('setup.progress', { n: step + 1, total: names.length }) }),
        h('h3', { text: i18n.t(`setup.${names[step]}.title`) }),
        await content(i18n, names[step]))
    }
    const last = step === names.length - 1
    shell.footer.replaceChildren(
      h('p', { class: 'form-error', role: 'alert' }),
      h('button', { type: 'button', text: i18n.t('setup.skip'), onclick: skip }),
      step > 0 && h('button', { type: 'button', text: i18n.t('setup.back'), onclick: () => { step--; render() } }),
      h('button', { type: 'button', class: 'settings-primary', text: i18n.t(last ? 'setup.finish' : 'setup.next'), onclick: () => { if (last) void finish(); else { step++; render() } } }))
  }

  await render()
}

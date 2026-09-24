import { h } from './dom.js'
import { openDialog } from './dialog.js'
import { settingsApi } from './client.js'
import { showErrors, clearErrors } from './fields.js'
import * as general from './sections/general.js'
import * as calendars from './sections/calendars.js'
import * as market from './sections/market.js'
import * as sources from './sections/sources.js'
import * as countdowns from './sections/countdowns.js'
import * as screen from './sections/screen.js'
import * as about from './sections/about.js'

// A calendar whose address the api kept back is sent as "keep it" unless the owner types a new one.
function keepStoredUrls(config) {
  for (const calendar of Object.values(config.calendars)) {
    if (calendar.urlSet) { calendar.urlKept = true }
  }
  return config
}

// Each section module exports { id, render(context) → Node }.
export const SECTIONS = [general, calendars, market, sources, countdowns, screen, about]

export async function openSettings({ i18n, i18nFor, section }) {
  const loaded = await settingsApi.load()
  const view = loaded.ok ? loaded.data : null
  let draft = view ? keepStoredUrls(structuredClone(view.config)) : null
  let saved = JSON.stringify(draft)
  const dirty = () => JSON.stringify(draft) !== saved

  const shell = openDialog({ id: 'vitral-settings', title: i18n.t('settings.title'), i18n, onRequestClose: () => (dirty() ? confirmDiscard() : shell.close()) })
  const nav = h('nav', { class: 'settings-nav', 'aria-label': i18n.t('settings.title') })
  const panel = h('section', { class: 'settings-section' })
  const formError = h('p', { class: 'form-error', role: 'alert' })
  const saveButton = h('button', { type: 'button', class: 'settings-primary', text: i18n.t('settings.save') })
  const discardBar = h('div', { class: 'settings-discard', hidden: true },
    h('span', { text: i18n.t('settings.unsaved') }),
    h('button', { type: 'button', text: i18n.t('settings.discard'), onclick: () => shell.close() }),
    h('button', { type: 'button', text: i18n.t('settings.keepEditing'), onclick: () => { discardBar.hidden = true } }))
  shell.body.append(nav, panel)
  shell.footer.append(discardBar, formError, saveButton)
  function confirmDiscard() { discardBar.hidden = false }

  if (!view) { panel.append(h('p', { class: 'form-error', text: i18n.t(`errors.${loaded.data?.error ?? 'NETWORK_ERROR'}`) })); saveButton.hidden = true; return shell }

  const context = { i18n, i18nFor, view, get draft() { return draft }, set draft(next) { draft = next }, api: settingsApi, reopen: id => show(id) }
  function show(id) {
    const current = SECTIONS.find(s => s.id === id) ?? SECTIONS[0]
    for (const link of nav.children) link.setAttribute('aria-current', String(link.dataset.section === current.id))
    clearErrors(shell.body)
    panel.replaceChildren(current.render(context))
    saveButton.hidden = current.saves === false
  }
  for (const s of SECTIONS) nav.append(h('button', { type: 'button', 'data-section': s.id, text: i18n.t(`settings.sections.${s.id}`), onclick: () => show(s.id) }))

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true
    const result = await settingsApi.save(draft)
    saveButton.disabled = false
    if (result.ok) { saved = JSON.stringify(draft); location.reload(); return }
    if (result.status === 422) showErrors(shell.body, result.data.errors, i18n)
    else formError.textContent = i18n.t(`errors.${result.data?.error ?? 'INTERNAL_ERROR'}`)
  })
  show(section)
  return shell
}

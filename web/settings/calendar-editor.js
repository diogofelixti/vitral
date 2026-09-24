import { h } from './dom.js'
import { field } from './fields.js'
import { settingsApi } from './client.js'

/**
 * One calendar: none, an iCal address, or Google. "None" is an ics-url
 * calendar with no url, which the panel shows as "not set up".
 */
export function calendarEditor({ i18n, profile, draft, withLabels = false }) {
  const calendar = draft.calendars[profile]
  const mode = calendar.provider === 'google' ? 'google' : calendar.url || calendar.urlSet ? 'ics' : 'none'
  const name = `calendar-${profile}`
  // The stored address never comes back from the api: an empty field keeps it.
  const kept = Boolean(calendar.urlSet)
  const url = h('input', { type: 'url', inputmode: 'url', value: calendar.url ?? '',
    placeholder: kept ? i18n.t('setup.calendars.kept', { host: calendar.urlHost || '…' }) : 'https://…/basic.ics' })
  const testLine = h('p', { class: 'calendar-test', 'aria-live': 'polite' })
  const icsBox = h('div', { class: 'calendar-ics' },
    field({ label: i18n.t('setup.calendars.url'), path: `calendars.${profile}.url`, input: url }),
    h('div', { class: 'settings-row' },
      h('button', { type: 'button', text: i18n.t('setup.calendars.test'), onclick: async () => {
        testLine.textContent = i18n.t('status.loading')
        const answer = await settingsApi.testCalendar(url.value.trim() || (kept ? profile : ''))
        testLine.textContent = answer.ok
          ? i18n.t('setup.calendars.found', { n: i18n.number(answer.data.events) })
          : i18n.t(`errors.${answer.data?.error ?? 'NETWORK_ERROR'}`)
      } }),
      testLine))
  const googleNote = h('p', { class: 'field-hint', text: i18n.t('setup.calendars.googleNote') })

  const show = choice => {
    icsBox.hidden = choice !== 'ics'
    googleNote.hidden = choice !== 'google'
  }
  const apply = choice => {
    const label = draft.calendars[profile].label
    if (choice === 'none') draft.calendars[profile] = { provider: 'ics-url', label }
    if (choice === 'ics') draft.calendars[profile] = url.value.trim()
      ? { provider: 'ics-url', url: url.value.trim(), label }
      : { provider: 'ics-url', ...(kept && { urlKept: true }), label }
    if (choice === 'google') draft.calendars[profile] = { provider: 'google', calendarId: draft.calendars[profile].calendarId ?? 'primary', label }
    show(choice)
  }
  url.addEventListener('input', () => {
    if (draft.calendars[profile].provider !== 'ics-url') return
    const value = url.value.trim()
    const { label } = draft.calendars[profile]
    draft.calendars[profile] = value ? { provider: 'ics-url', url: value, label } : { provider: 'ics-url', ...(kept && { urlKept: true }), label }
  })

  const option = (value, text) => h('label', { class: 'settings-row' },
    h('input', { type: 'radio', name, value, checked: mode === value, onchange: () => apply(value) }), text)
  const labels = withLabels ? [
    field({ label: i18n.t('setup.calendars.labelPt'), path: `calendars.${profile}.label`, input: h('input', { type: 'text', value: calendar.label['pt-BR'], oninput: e => { draft.calendars[profile].label = { ...draft.calendars[profile].label, 'pt-BR': e.target.value } } }) }),
    field({ label: i18n.t('setup.calendars.labelEn'), path: `calendars.${profile}.label`, input: h('input', { type: 'text', value: calendar.label.en, oninput: e => { draft.calendars[profile].label = { ...draft.calendars[profile].label, en: e.target.value } } }) }),
  ] : []
  const node = h('fieldset', { class: 'calendar-editor', 'data-profile': profile },
    h('legend', { text: i18n.label(calendar.label) }),
    ...labels,
    h('div', { class: 'settings-row', role: 'radiogroup' },
      option('none', i18n.t('setup.calendars.none')),
      option('ics', i18n.t('setup.calendars.ics')),
      option('google', i18n.t('setup.calendars.google'))),
    icsBox, googleNote)
  // Opening leaves the draft as it came, or the menu would count as edited before anyone touched it.
  show(mode)
  return node
}

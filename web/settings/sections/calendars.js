import { h } from '../dom.js'
import { calendarEditor } from '../calendar-editor.js'
import { googlePanel } from '../google.js'

export const id = 'calendars'
export function render(context) {
  const { i18n, view, draft } = context
  const google = h('div', { class: 'calendars-google' })
  // Redrawn when a calendar switches source, so the Google pickers follow the choice.
  const refresh = () => google.replaceChildren(h('h3', { text: i18n.t('setup.google.title') }), googlePanel({ i18n, view, draft: context.draft }))
  const editors = ['work', 'personal'].map(profile => calendarEditor({ i18n, profile, draft, withLabels: true }))
  for (const editor of editors) editor.addEventListener('change', refresh)
  refresh()
  return h('div', {}, ...editors, google)
}

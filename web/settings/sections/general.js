import { h } from '../dom.js'
import { field } from '../fields.js'
import { cityPicker } from '../city.js'

export const id = 'general'
export function render({ i18n, draft }) {
  const language = h('select', { onchange: e => { draft.language = e.target.value } },
    h('option', { value: 'pt-BR', selected: draft.language === 'pt-BR', text: 'Português' }),
    h('option', { value: 'en', selected: draft.language === 'en', text: 'English' }))
  // Until the list arrives, the current theme is the only option, so the select never shows empty.
  const theme = h('select', { onchange: e => { draft.theme = e.target.value } }, h('option', { value: draft.theme, text: draft.theme }))
  void fetch('themes/index.json', { cache: 'no-store' }).then(r => r.json()).then(names => {
    theme.replaceChildren(...names.map(name => h('option', { value: name, selected: draft.theme === name, text: name })))
  }).catch(() => {})
  return h('div', {},
    field({ label: i18n.t('settings.general.language'), path: 'language', input: language }),
    field({ label: i18n.t('settings.general.theme'), path: 'theme', input: theme }),
    h('h3', { text: i18n.t('setup.city.title') }),
    cityPicker({ i18n, draft }))
}

import { h } from '../dom.js'
import { field } from '../fields.js'

// A YAML label may be one string for both languages; it becomes a pair only once someone edits it,
// so opening the section leaves the draft as it came.
const asLabel = label => typeof label === 'string' ? { 'pt-BR': label, en: label } : label

export const id = 'countdowns'
export function render({ i18n, draft }) {
  const list = h('div', { class: 'countdown-list' })
  const renderRows = () => list.replaceChildren(...draft.countdowns.map((entry, index) => {
    const label = asLabel(entry.label)
    const name = (key, text) => field({ label: i18n.t(text), path: `countdowns.${index}.label`,
      input: h('input', { type: 'text', value: label[key] ?? '', oninput: e => { entry.label = { ...asLabel(entry.label), [key]: e.target.value } } }) })
    return h('fieldset', { class: 'countdown-row' },
      field({ label: i18n.t('settings.countdowns.date'), path: `countdowns.${index}.date`, input: h('input', { type: 'date', value: String(entry.date).slice(0, 10), oninput: e => { entry.date = e.target.value } }) }),
      name('pt-BR', 'setup.calendars.labelPt'),
      name('en', 'setup.calendars.labelEn'),
      h('button', { type: 'button', text: i18n.t('settings.remove'), onclick: () => { draft.countdowns.splice(index, 1); renderRows() } }))
  }))
  renderRows()
  return h('div', {}, list,
    h('button', { type: 'button', text: i18n.t('settings.countdowns.add'), onclick: () => {
      draft.countdowns.push({ date: new Date().toISOString().slice(0, 10), label: { 'pt-BR': '', en: '' } })
      renderRows()
    } }))
}

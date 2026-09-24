import { h } from '../dom.js'
import { field } from '../fields.js'

export const id = 'screen'
export function render({ i18n, draft }) {
  const s = draft.screensaver
  const dim = s.nightDim ?? { from: '22:00', to: '06:00', opacity: 0.45 }
  const from = h('input', { type: 'time', value: dim.from, oninput: e => { draft.screensaver.nightDim.from = e.target.value } })
  const to = h('input', { type: 'time', value: dim.to, oninput: e => { draft.screensaver.nightDim.to = e.target.value } })
  const opacity = h('input', { type: 'range', min: '0.1', max: '0.9', step: '0.05', value: String(dim.opacity), oninput: e => { draft.screensaver.nightDim.opacity = Number(e.target.value) } })
  const dimFields = h('div', { hidden: !s.nightDim },
    field({ label: i18n.t('settings.screen.from'), path: 'screensaver.nightDim.from', input: from }),
    field({ label: i18n.t('settings.screen.to'), path: 'screensaver.nightDim.to', input: to }),
    field({ label: i18n.t('settings.screen.opacity'), path: 'screensaver.nightDim.opacity', input: opacity }))
  const shift = h('input', { type: 'checkbox', checked: s.pixelShift, onchange: e => { draft.screensaver.pixelShift = e.target.checked } })
  const night = h('input', { type: 'checkbox', checked: Boolean(s.nightDim), onchange: e => {
    if (e.target.checked) draft.screensaver.nightDim = { from: from.value, to: to.value, opacity: Number(opacity.value) }
    else delete draft.screensaver.nightDim
    dimFields.hidden = !e.target.checked
  } })
  return h('div', {},
    h('label', { class: 'settings-row' }, shift, i18n.t('settings.screen.pixelShift')),
    h('p', { class: 'field-hint', text: i18n.t('settings.screen.pixelShiftHint') }),
    h('label', { class: 'settings-row' }, night, i18n.t('settings.screen.nightDim')),
    dimFields)
}

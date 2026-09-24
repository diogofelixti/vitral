import { h } from '../dom.js'
import { field } from '../fields.js'
import { orderList } from '../order-list.js'

const PAIR = /^[A-Z]{3}-[A-Z]{3}$/

export const id = 'market'
export function render({ i18n, draft, api }) {
  const b = draft.bitcoin
  const primary = h('select', { onchange: e => { b.primary = e.target.value } })
  const refreshPrimary = () => primary.replaceChildren(...b.currencies.map(c => h('option', { value: c, selected: c === b.primary, text: c })))
  const currencies = h('div', { class: 'currency-grid', 'data-path': 'bitcoin.currencies' }, h('p', { class: 'field-hint', text: i18n.t('status.loading') }))
  void api.currencies().then(answer => {
    const known = answer.ok ? answer.data.data.currencies : []
    const all = [...new Set([...b.currencies, ...known])]
    currencies.replaceChildren(...all.map(code => h('label', { class: 'settings-row' },
      h('input', { type: 'checkbox', checked: b.currencies.includes(code), 'aria-label': code, onchange: e => {
        b.currencies = e.target.checked ? [...b.currencies, code] : b.currencies.filter(c => c !== code)
        if (!b.currencies.includes(b.primary)) b.primary = b.currencies[0] ?? ''
        refreshPrimary()
      } }), code)), h('span', { class: 'field-error', role: 'alert' }))
  })
  refreshPrimary()

  const pairsList = h('ul', {})
  const pairsBox = h('div', { 'data-path': 'fx.pairs' }, pairsList, h('span', { class: 'field-error', role: 'alert' }))
  const renderPairs = () => pairsList.replaceChildren(...draft.fx.pairs.map((pair, index) => h('li', { class: 'settings-row' },
    h('span', { text: pair }),
    h('button', { type: 'button', text: i18n.t('settings.remove'), disabled: draft.fx.pairs.length === 1, onclick: () => { draft.fx.pairs.splice(index, 1); renderPairs() } }))))
  const newPair = h('input', { type: 'text', 'aria-label': i18n.t('settings.market.newPair'), placeholder: 'EUR-BRL' })
  const addPair = h('button', { type: 'button', text: i18n.t('settings.market.addPair'), onclick: () => {
    const value = newPair.value.trim().toUpperCase()
    const error = pairsBox.querySelector('.field-error')
    if (!PAIR.test(value)) { error.textContent = i18n.t('settings.market.pairFormat'); return }
    error.textContent = ''
    if (!draft.fx.pairs.includes(value)) draft.fx.pairs.push(value)
    newPair.value = ''; renderPairs()
  } })
  renderPairs()

  const orders = h('div', {})
  void api.providers().then(answer => {
    if (!answer.ok) return
    orders.replaceChildren(
      h('h4', { text: i18n.t('settings.market.bitcoinSources') }),
      orderList({ i18n, path: 'bitcoin.providers', items: b.providers, available: answer.data.bitcoin.available, onChange: items => { b.providers = items } }),
      h('h4', { text: i18n.t('settings.market.fxSources') }),
      orderList({ i18n, path: 'fx.providers', items: draft.fx.providers, available: answer.data.fx.available, onChange: items => { draft.fx.providers = items } }))
  })

  return h('div', {},
    h('h3', { text: 'Bitcoin' }), currencies,
    field({ label: i18n.t('settings.market.primary'), path: 'bitcoin.primary', input: primary }),
    h('h3', { text: i18n.t('settings.market.fx') }), pairsBox,
    h('div', { class: 'settings-row' }, newPair, addPair),
    orders)
}

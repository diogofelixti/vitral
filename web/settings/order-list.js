import { h } from './dom.js'

/** Sources in order of preference, which is also the fallback order. */
export function orderList({ i18n, path, items, available, onChange }) {
  const root = h('div', { class: 'order-list', 'data-path': path })
  const render = () => {
    const rest = available.filter(id => !items.includes(id))
    root.replaceChildren(
      h('ol', {}, ...items.map((item, index) => h('li', { class: 'settings-row' },
        h('span', { text: item }),
        h('button', { type: 'button', 'aria-label': i18n.t('settings.order.up', { name: item }), text: '↑', disabled: index === 0,
          onclick: () => { [items[index - 1], items[index]] = [items[index], items[index - 1]]; onChange(items); render() } }),
        h('button', { type: 'button', 'aria-label': i18n.t('settings.order.remove', { name: item }), text: '×', disabled: items.length === 1,
          onclick: () => { items.splice(index, 1); onChange(items); render() } })))),
      rest.length ? h('div', { class: 'settings-row' }, ...rest.map(id => h('button', { type: 'button', 'aria-label': i18n.t('settings.order.add', { name: id }), text: `+ ${id}`,
        onclick: () => { items.push(id); onChange(items); render() } }))) : null,
      h('span', { class: 'field-error', role: 'alert' }))
  }
  render()
  return root
}

import { h } from '../dom.js'

export const id = 'about'
export const saves = false
export function render({ i18n }) {
  return h('div', {},
    h('p', { text: i18n.t('settings.about.intro') }),
    h('p', {}, h('a', { href: 'https://github.com/diogofelixti/vitral', target: '_blank', rel: 'noopener', text: 'github.com/diogofelixti/vitral' })))
}

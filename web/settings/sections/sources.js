import { h } from '../dom.js'
import { orderList } from '../order-list.js'

export const id = 'sources'
export function render({ i18n, draft, api }) {
  const root = h('div', {}, h('p', { class: 'field-hint', text: i18n.t('settings.sources.intro') }))
  void api.providers().then(answer => {
    if (!answer.ok) return
    for (const capability of ['weather', 'onchain']) {
      root.append(h('h3', { text: i18n.t(`widgets.${capability}`) }),
        orderList({ i18n, path: `${capability}.providers`, items: draft[capability].providers, available: answer.data[capability].available, onChange: items => { draft[capability].providers = items } }))
    }
  })
  return root
}

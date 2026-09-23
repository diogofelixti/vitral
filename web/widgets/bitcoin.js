import { DataWidget } from '../lib/data-widget.js'
export class Bitcoin extends DataWidget {
  static capability = 'bitcoin'
  static path = '/api/bitcoin'
  render(data) {
    const primary = this.config.bitcoin?.primary ?? Object.keys(data.prices)[0]
    const entry = data.prices[primary]
    this.append(this.text('val', this.i18n.currency(entry?.price, primary)))
    const support = this.text('sub support', '')
    const change = this.inline(`change ${entry?.change24h == null ? '' : entry.change24h >= 0 ? 'up' : 'down'}`, this.i18n.percent(entry?.change24h))
    support.append(change)
    const others = this.inline('currencies', '')
    let extraIndex = 0
    for (const [code, item] of Object.entries(data.prices)) if (code !== primary) {
      const currency = this.inline('currency', this.i18n.currency(item.price, code))
      if (extraIndex > 0) currency.dataset.fitPriority = String(20 + extraIndex)
      extraIndex++
      others.append(this.separator(), currency)
    }
    support.append(others)
    this.append(support)
  }
}
customElements.define('vitral-bitcoin', Bitcoin)

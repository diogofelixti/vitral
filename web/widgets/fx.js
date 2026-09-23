import { DataWidget } from '../lib/data-widget.js'
export class FX extends DataWidget {
  static capability = 'fx'
  static path = '/api/fx'
  render(data) {
    const pairs = Object.entries(data.pairs)
    if (pairs.length === 1) {
      const [pair, entry] = pairs[0]
      this.querySelector('.lab').textContent = this.i18n.currencyName(pair.split('-')[0])
      this.append(this.text('val rate', this.i18n.currency(entry.rate, pair.split('-')[1])))
      const line = this.text('sub pair-row', '')
      line.append(this.inline(`change ${entry.change == null ? '' : entry.change >= 0 ? 'up' : 'down'}`, this.i18n.percent(entry.change)))
      this.append(line)
    } else for (const [index, [pair, entry]] of pairs.entries()) {
      const line = this.text('sub pair-row', '')
      line.dataset.fitPriority = String(20 + index)
      line.append(this.inline('pair', pair), this.separator(), this.inline('rate', this.i18n.currency(entry.rate, pair.split('-')[1])), this.separator(), this.inline(`change ${entry.change == null ? '' : entry.change >= 0 ? 'up' : 'down'}`, this.i18n.percent(entry.change)))
      this.append(line)
    }
  }
}
customElements.define('vitral-fx', FX)

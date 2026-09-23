import { DataWidget } from '../lib/data-widget.js'
export class Onchain extends DataWidget {
  static capability = 'onchain'
  static path = '/api/onchain'
  render(data) {
    const first = this.text('sub', '')
    const fee = this.inline('fee', data.feeSatVb == null ? '—' : this.i18n.t('onchain.fee', { n: this.i18n.number(data.feeSatVb) }))
    const halving = this.inline('halving', this.i18n.t('onchain.halving', { n: this.i18n.number(data.halving?.estimatedDays) }))
    first.append(fee, this.separator(), halving)
    const second = this.text('sub blocks', '')
    second.dataset.fitPriority = '35'
    const blocks = this.inline('blocks-left', this.i18n.t('onchain.blocks', { n: this.i18n.number(data.halving?.blocksLeft) })); blocks.dataset.fitPriority = '30'
    const difficulty = this.inline('difficulty', `${this.i18n.t('onchain.difficulty')} —`); difficulty.dataset.fitPriority = '40'
    second.append(blocks, this.separator(), difficulty)
    this.append(this.text('val', this.i18n.number(data.blockHeight)), first, second)
  }
}
customElements.define('vitral-onchain', Onchain)

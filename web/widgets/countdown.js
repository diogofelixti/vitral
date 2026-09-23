import { Widget } from '../lib/widget-base.js'
export class Countdown extends Widget {
  start(i18n, entries = []) {
    this.i18n = i18n
    this.entries = entries
    clearInterval(this.timer)
    this.draw()
    this.timer = setInterval(() => this.draw(), 60_000)
  }
  disconnectedCallback() { clearInterval(this.timer) }
  draw() {
    this.clear()
    const today = Date.parse(this.i18n.dayKey(Date.now()) + 'T00:00:00Z')
    if (!this.entries.length) this.append(this.text('lab', this.i18n.t('widgets.countdown')), this.text('sub setup-hint', this.i18n.t('countdown.none')))
    for (const [index, entry] of this.entries.entries()) {
      // Config serializes a date as midnight UTC. Keep its calendar date, not a host-zone conversion.
      const target = Date.parse(String(entry.date).slice(0, 10) + 'T00:00:00Z')
      const days = Math.round((target - today) / 86_400_000)
      const row = this.text('countdown-entry', '')
      row.dataset.fitPriority = String(100 + index)
      row.append(this.text('lab', this.i18n.label(entry.label)),
        this.text('val', days === 0 ? this.i18n.t('countdown.today') : this.i18n.number(Math.abs(days))),
        this.text('sub', days === 0 ? '' : this.i18n.t(days < 0 ? 'countdown.past' : 'countdown.days')))
      this.append(row)
    }
    this.fitContent()
  }
  fitContent() {
    const rows = [...this.querySelectorAll('.countdown-entry')]
    rows.forEach(row => row.style.removeProperty('display'))
    while (this.scrollHeight > this.clientHeight + 1 && rows.length > 1) rows.pop().style.display = 'none'
    super.fitContent()
  }
}
customElements.define('vitral-countdown', Countdown)

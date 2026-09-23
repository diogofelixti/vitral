import { Widget } from '../lib/widget-base.js'
export class Clock extends Widget {
  start(i18n) {
    this.i18n = i18n
    clearInterval(this.timer)
    this.draw()
    this.timer = setInterval(() => this.draw(), 1000)
  }
  disconnectedCallback() { clearInterval(this.timer) }
  draw() {
    const now = new Date()
    this.clear()
    this.setAttribute('aria-label', this.i18n.t('widgets.clock'))
    this.append(this.text('big', this.i18n.time(now)), this.text('sub', this.i18n.date(now)))
    this.fitContent()
  }
}
customElements.define('vitral-clock', Clock)

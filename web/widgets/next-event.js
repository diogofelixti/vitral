import { DataWidget } from '../lib/data-widget.js'
export class NextEvent extends DataWidget {
  static capability = 'next'
  static path = '/api/calendar/next'
  render(data) {
    const at = Date.now()
    // the answer can be minutes old (cache, stale): an event that has already ended is no
    // longer the next one, whatever the api said when it was fetched
    const ended = event => event.allDay ? event.end.slice(0, 10) <= this.i18n.dayKey(at) : Date.parse(event.end) <= at
    const event = data.next && !ended(data.next) ? data.next : null
    if (!event) { this.append(this.text('val next-title', this.i18n.t('next.none')), this.text('sub', this.i18n.t(data.busy ? 'next.busy' : 'next.free'))); return }
    const remaining = Math.ceil((Date.parse(event.start) - at) / 60_000)
    const underway = event.allDay
      ? event.start.slice(0, 10) <= this.i18n.dayKey(at) && event.end.slice(0, 10) > this.i18n.dayKey(at)
      : Date.parse(event.start) <= at && Date.parse(event.end) > at
    const busy = underway || (data.busy && (event.allDay ? event.end.slice(0, 10) > this.i18n.dayKey(at) : Date.parse(event.end) > at))
    const title = this.text('val next-title', event.title)
    title.title = event.title
    const status = this.text('sub status-line', '')
    status.append(this.inline('countdown', underway ? this.i18n.t('next.now') : remaining > 0 ? this.i18n.t('next.in', { duration: this.i18n.t('next.duration', { n: this.i18n.number(remaining) }) }) : this.i18n.t('next.none')), this.separator(), this.inline('start-time', this.i18n.time(event.start)), this.separator(), this.inline(`status ${busy ? 'busy' : 'free'}`, this.i18n.t(busy ? 'next.busy' : 'next.free')))
    if (event.profileLabel) status.append(this.separator(), this.inline('profile-label', this.i18n.label(event.profileLabel)))
    this.append(title, status)
  }
}
customElements.define('vitral-next', NextEvent)

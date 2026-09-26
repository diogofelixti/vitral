import { DataWidget } from '../lib/data-widget.js'
export class NextEvent extends DataWidget {
  static capability = 'next'
  static path = '/api/calendar/next'
  render(data) {
    const at = Date.now()
    const today = this.i18n.dayKey(at)
    const underway = event => event.allDay
      ? event.start.slice(0, 10) <= today && event.end.slice(0, 10) > today
      : Date.parse(event.start) <= at && Date.parse(event.end) > at
    // an api from before `events` sends only the first one
    const upcoming = (data.events ?? (data.next ? [data.next] : [])).filter(event => !this.ended(event, at))
    // the first of each calendar: a long event underway in one must not hide the meeting
    // coming up in the other
    const shown = [...new Map(upcoming.map(event => [event.profile ?? JSON.stringify(event.profileLabel ?? null), event]).reverse()).values()]
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    const busy = data.events ? upcoming.some(underway) : Boolean(data.busy && upcoming.length) || upcoming.some(underway)
    this.classList.toggle('several', shown.length > 1)
    if (!shown.length) { this.append(this.text('val next-title', this.i18n.t('next.none')), this.text('sub', this.i18n.t(data.busy ? 'next.busy' : 'next.free'))); return }
    for (const [index, event] of shown.entries()) {
      const remaining = Math.ceil((Date.parse(event.start) - at) / 60_000)
      const title = this.text('val next-title', event.title)
      title.title = event.title
      const status = this.text('sub status-line', '')
      status.append(this.inline('countdown', underway(event) ? this.i18n.t('next.now') : remaining > 0 ? this.i18n.t('next.in', { duration: this.i18n.t('next.duration', { n: this.i18n.number(remaining) }) }) : this.i18n.t('next.none')), this.separator(), this.inline('start-time', this.i18n.time(event.start)))
      // free or busy is about now, not about each event: said once, on the first line
      if (index === 0) status.append(this.separator(), this.inline(`status ${busy ? 'busy' : 'free'}`, this.i18n.t(busy ? 'next.busy' : 'next.free')))
      if (event.profileLabel) status.append(this.separator(), this.inline('profile-label', this.i18n.label(event.profileLabel)))
      if (index === 0) { this.append(title, status); continue }
      title.classList.add('next-later'); status.classList.add('next-later')
      // the same event in one line, for a cell too short for two in full
      const brief = this.text('sub next-brief', '')
      brief.hidden = true
      brief.append(this.inline('start-time', this.i18n.time(event.start)), this.inline('dot', '·'), this.inline('event-title', event.title))
      if (event.profileLabel) brief.append(this.inline('dot', '·'), this.inline('profile-label', this.i18n.label(event.profileLabel)))
      this.append(title, status, brief)
    }
  }
  // two calendars in full, then with one-line titles, then the later ones in a line each
  fitContent() {
    const later = [...this.querySelectorAll('.next-later')]
    const briefs = [...this.querySelectorAll('.next-brief')]
    this.classList.remove('tight')
    later.forEach(el => { el.hidden = false })
    briefs.forEach(el => { el.hidden = true })
    super.fitContent()
    if (!later.length) return
    const overflows = () => this.overflowHeight(this) > .5
    if (!overflows()) return
    this.classList.add('tight')
    super.fitContent()
    if (!overflows()) return
    later.forEach(el => { el.hidden = true })
    briefs.forEach(el => { el.hidden = false })
    super.fitContent()
  }
}
customElements.define('vitral-next', NextEvent)

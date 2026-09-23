import { DataWidget } from '../lib/data-widget.js'
export class Agenda extends DataWidget {
  static capability = 'calendar'
  static pollSeconds = 300
  get path() { return `/api/calendar?profile=${encodeURIComponent(this.getAttribute('profile') ?? 'work')}` }
  get label() {
    const profile = this.getAttribute('profile') ?? 'work'
    return this.i18n.label(this.config.calendars?.[profile]?.label) || this.i18n.t(`widgets.${profile}`)
  }
  render(data) {
    if (!data.events.length) { this.append(this.text('sub empty', this.i18n.t('calendar.empty'))); return }
    const today = this.i18n.dayKey(Date.now())
    const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)
    const rows = this.text('rows', '')
    let previousDay
    for (const [index, event] of data.events.entries()) {
      const day = event.allDay ? event.start.slice(0, 10) : this.i18n.dayKey(event.start)
      if (day !== previousDay && day !== today) {
        rows.append(this.text('sub day', day === today ? this.i18n.t('calendar.today') : day === tomorrow ? this.i18n.t('calendar.tomorrow') : this.i18n.date(event.start)))
        previousDay = day
      }
      const row = this.text('ev', '')
      const time = document.createElement('time')
      time.dateTime = event.start
      time.textContent = event.allDay ? this.i18n.t('calendar.allDay') : this.i18n.time(event.start)
      row.append(time, this.inline('event-title', event.title))
      rows.append(row)
    }
    const more = this.text('more sub', '')
    more.hidden = true
    rows.append(more)
    this.append(rows)
  }
  fitContent() {
    const rows = this.querySelector('.rows')
    if (!rows) { super.fitContent(); return }
    const events = [...this.querySelectorAll('.ev')]
    const more = this.querySelector('.more')
    events.forEach(event => { event.style.removeProperty('display') })
    more.hidden = true
    let hidden = 0
    const overflows = () => this.scrollHeight > this.clientHeight + 1 || rows.getBoundingClientRect().bottom > this.getBoundingClientRect().bottom + .5
    const minimum = events.length > 2 ? 3 : 2
    for (let i = events.length - 1; i >= 0 && events.filter(event => getComputedStyle(event).display !== 'none').length > minimum && overflows(); i--) {
      events[i].style.display = 'none'; hidden++
      more.textContent = this.i18n.t('calendar.more', { n: this.i18n.number(hidden) })
      more.hidden = false
    }
    if (overflows()) {
      for (const day of this.querySelectorAll('.day')) day.style.display = 'none'
      more.hidden = false
      more.textContent = this.i18n.t('calendar.more', { n: this.i18n.number(hidden) })
    }
    super.fitContent()
  }
}
customElements.define('vitral-agenda', Agenda)

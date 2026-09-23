import { DataWidget } from '../lib/data-widget.js'
export class Weather extends DataWidget {
  static capability = 'weather'
  static path = '/api/weather'
  static pollSeconds = 900
  get label() { return this.config.location?.label || this.i18n.t('widgets.weather') }
  render(data) {
    const n = value => this.i18n.number(value, { maximumFractionDigits: 0 })
    const support = this.text('sub support', '')
    const range = this.inline('range', `${n(data.today?.maxC)}° / ${n(data.today?.minC)}°`)
    const sunrise = this.inline('sunrise', this.i18n.t('weather.sunrise', { time: this.i18n.wallTime(data.sun?.rise) })); sunrise.dataset.fitPriority = '20'
    const sunset = this.inline('sunset', this.i18n.t('weather.sunset', { time: this.i18n.wallTime(data.sun?.set) }))
    support.append(range, this.separator(), sunrise, this.separator(), sunset)
    this.append(this.text('val', `${n(data.now?.tempC)}°`), support)
    const strip = this.text('hourly', '')
    strip.setAttribute('aria-label', this.i18n.t('weather.hourly'))
    for (const hour of data.hourly ?? []) {
      const forecast = this.inline('forecast', `${this.i18n.wallTime(hour.hour)} · ${n(hour.tempC)}°`)
      forecast.dataset.fitPriority = '100'
      strip.append(forecast)
    }
    this.append(strip)
  }
  fitContent() {
    const strip = this.querySelector('.hourly')
    strip?.style.removeProperty('display')
    super.fitContent()
    if (!strip) return
    // the strip clips sideways: an hour that does not fit whole goes, it is never shown cut
    const edge = strip.getBoundingClientRect().right
    for (const hour of strip.querySelectorAll('.forecast')) if (hour.getClientRects().length && hour.getBoundingClientRect().right > edge + .5) hour.style.display = 'none'
    if (![...strip.querySelectorAll('.forecast')].some(el => getComputedStyle(el).display !== 'none')) strip.style.display = 'none'
  }
}
customElements.define('vitral-weather', Weather)

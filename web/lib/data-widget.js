import { Widget } from './widget-base.js'
import { poll } from './api.js'
export class DataWidget extends Widget {
  markRendered() {
    this.dataset.rendered = 'true'
    const widgets = [...document.querySelectorAll('[data-poll]')]
    if (widgets.length && widgets.every(widget => widget.dataset.rendered === 'true')) document.documentElement.dataset.fitted = 'true'
  }
  start(i18n, config) {
    this.i18n = i18n
    this.config = config
    this.stop?.()
    this.stop = poll(this.path ?? this.constructor.path, this.constructor.pollSeconds, (data, meta) => {
      if (data !== null && data !== undefined) { this.data = data; this.meta = meta }
      else this.meta = { ...this.meta, stale: Boolean(this.data), error: meta.error }
      this.draw()
    })
    clearInterval(this.timer)
    this.timer = setInterval(() => {
      if (this.meta?.stale || this.constructor.capability === 'next') this.draw()
    }, 15_000)
  }
  disconnectedCallback() { this.stop?.(); clearInterval(this.timer) }
  setLanguage(i18n) { this.i18n = i18n; this.draw() }
  get label() { return this.i18n.t(`widgets.${this.constructor.capability}`) }
  draw() {
    this.dataset.rendered = 'false'
    this.clear()
    const label = this.text(this.constructor.capability === 'weather' ? 'lab location' : 'lab', this.label)
    if (this.constructor.capability === 'weather' && this.label.length > 24) label.title = this.label
    this.append(label)
    this.setAttribute('aria-label', this.label)
    if (!this.data) {
      if (['GOOGLE_NOT_CONFIGURED', 'CALENDAR_NOT_CONFIGURED'].includes(this.meta?.error)) {
        this.append(this.text('sub setup-hint', this.i18n.t(`errors.${this.meta.error}`)))
        this.markRendered()
        return
      }
      this.append(this.text('val', '—'), this.text('sub unavailable', this.i18n.t(`errors.${this.meta?.error ?? 'PROVIDER_UNAVAILABLE'}`)))
      this.markRendered()
      return
    }
    this.render(this.data, this.meta)
    const note = this.staleNote(this.meta, this.i18n)
    if (note) {
      const support = [...this.querySelectorAll('.sub')].at(-1)
      if (support) support.append(this.separator(), note)
      else this.append(note)
    }
    if (this.meta?.error) this.append(this.text('sub unavailable', this.i18n.t(`errors.${this.meta.error}`)))
    if (this.meta?.provider && this.meta.degraded && this.meta.provider !== 'derived') {
      const text = this.i18n.t('status.fallback', { provider: this.meta.provider })
      const source = this.text(this.meta.degraded ? 'source degraded' : 'source', text)
      source.setAttribute('title', text)
      this.append(source)
    }
    this.fitContent()
    this.markRendered()
  }

  fitContent() {
    const candidates = [...this.querySelectorAll('[data-fit-priority]')]
      .sort((a, b) => Number(b.dataset.fitPriority) - Number(a.dataset.fitPriority))
    for (const element of candidates) element.style.removeProperty('display')
    this.reconcileSeparators()
    const overflowing = () => {
      const box = this.getBoundingClientRect()
      return this.scrollHeight > this.clientHeight + 1 || [...this.querySelectorAll('*')].some(el => {
        if (getComputedStyle(el).display === 'none') return false
        const rect = el.getBoundingClientRect()
        return rect.bottom > box.bottom + .5 || rect.right > box.right + .5
      })
    }
    for (const element of candidates) {
      if (!overflowing()) break
      element.style.display = 'none'
      this.reconcileSeparators()
    }
    this.fitTypography()
  }
  // A "·" stays only between two visible fragments of its line, read in order across nested
  // spans (bitcoin keeps its "·" inside .currencies). One that lands on a line break becomes the
  // break itself, so no line starts or ends with it.
  reconcileSeparators() {
    for (const br of this.querySelectorAll('br.separator-break')) br.remove()
    const shown = el => el.getClientRects().length > 0
    const lines = new Set([...this.querySelectorAll('.separator')].map(separator => separator.closest('.sub') ?? separator.parentElement))
    for (const line of lines) {
      const tokens = [...line.querySelectorAll('span')].filter(el => el.matches('.separator') || !el.firstElementChild)
      const separators = tokens.filter(el => el.matches('.separator'))
      for (const separator of separators) separator.style.removeProperty('display')
      let pending = null, seen = false
      for (const token of tokens) {
        if (token.matches('.separator')) {
          if (seen && !pending && shown(token)) pending = token
          else token.style.display = 'none'
        } else if (shown(token)) { pending = null; seen = true }
      }
      if (pending) pending.style.display = 'none'
      const sameLine = (a, b) => {
        const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()]
        return Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > Math.min(ra.height, rb.height) / 2
      }
      for (const separator of separators.filter(shown)) {
        const at = tokens.indexOf(separator)
        const previous = tokens.slice(0, at).reverse().find(el => !el.matches('.separator') && shown(el))
        const next = tokens.slice(at + 1).find(el => !el.matches('.separator') && shown(el))
        if (sameLine(previous, separator) && sameLine(separator, next)) continue
        separator.style.display = 'none'
        const br = document.createElement('br'); br.className = 'separator-break'
        separator.after(br)
      }
    }
  }
}

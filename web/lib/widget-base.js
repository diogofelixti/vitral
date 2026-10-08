export class Widget extends HTMLElement {
  static capability = null
  static pollSeconds = 60
  text(className, value) {
    const el = document.createElement('div')
    el.className = className
    el.textContent = value ?? '—'
    return el
  }
  inline(className, value) {
    const el = document.createElement('span')
    el.className = className
    el.textContent = value ?? '—'
    return el
  }
  // a "·" between two fragments, with real spaces around it: they give it room and give the
  // line somewhere to break, which a bare span glued to its neighbours does not
  separator() {
    const fragment = document.createDocumentFragment()
    fragment.append(' ', this.inline('separator', '·'), ' ')
    return fragment
  }
  clear() { this.replaceChildren() }
  // a row, a pair or the whole widget that opens where its reading comes from, in a new tab
  // so the panel keeps running in its own; an attribute rather than an <a>, so the themes'
  // selectors and the layout stay exactly what they are
  linkTo(el, href) {
    // the api lets only https through; a page opened from here never runs a javascript: one
    if (!/^https:\/\//.test(href ?? '')) return el
    el.dataset.link = href
    el.setAttribute('role', 'link')
    el.tabIndex = 0
    return el
  }
  unlink(el) {
    delete el.dataset.link
    el.removeAttribute('tabindex')
  }
  connectedCallback() {
    this.setAttribute('role', 'group')
    const open = event => {
      const target = event.target.closest?.('[data-link]')
      if (!target || !this.contains(target)) return
      event.preventDefault()
      window.open(target.dataset.link, '_blank', 'noopener,noreferrer')
    }
    this.addEventListener('click', open)
    this.addEventListener('keydown', event => { if (event.key === 'Enter') open(event) })
    this.fitObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        this.fitContent?.()
        requestAnimationFrame(() => { document.documentElement.dataset.fitted = 'true' })
      })
    })
    this.fitObserver.observe(this)
  }
  fitTypography() {
    for (const el of this.querySelectorAll('.big, .val')) {
      // the clock is sized at the prototype and gives way to content down to 75% of it
      const least = el.closest('.w-clock') ? .75 : .7
      // measure at full size every pass, so a scale is never taken from an already shrunk one
      el.style.removeProperty('--fit-scale')
      const available = el.clientWidth
      const natural = el.scrollWidth
      let scale = available && natural > available ? Math.max(least, Math.min(1, available / natural)) : 1
      const widget = el.closest('.w')
      const overflow = widget ? this.overflowHeight(widget) : 0
      if (overflow > 0) scale = Math.max(least, Math.min(scale, (el.offsetHeight - overflow) / el.offsetHeight))
      if (scale < 1) el.style.setProperty('--fit-scale', String(scale))
    }
  }
  // how far the content runs past the widget's content box, above and below: a centred column
  // (the clock) spills both ways, and scrollHeight only sees the part below
  overflowHeight(widget) {
    const shown = [...widget.children].filter(child => child.getClientRects().length)
    if (!shown.length) return 0
    const style = getComputedStyle(widget)
    const room = widget.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    const margin = (child, side) => parseFloat(getComputedStyle(child)[`margin${side}`]) || 0
    const top = shown[0].getBoundingClientRect().top - margin(shown[0], 'Top')
    const bottom = Math.max(...shown.map(child => child.getBoundingClientRect().bottom + margin(child, 'Bottom')))
    return Math.max(0, bottom - top - room)
  }
  fitContent() { this.fitTypography() }
  render() { throw new Error(`${this.tagName} must implement render()`) }
  renderUnavailable(code) {
    this.clear()
    this.append(this.text('lab', this.label ?? ''), this.text('val', '—'), this.text('sub unavailable', code))
  }
  staleNote(meta, i18n) {
    if (!meta?.stale) return null
    const el = document.createElement('span')
    el.className = 'stale'
    el.textContent = i18n.age(Math.max(0, (Date.now() - Date.parse(meta.updatedAt)) / 1000))
    return el
  }
}

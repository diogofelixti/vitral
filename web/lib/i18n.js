export function createI18n(lang, strings, timezone) {
  const locale = lang === 'en' ? 'en-GB' : 'pt-BR'
  const get = key => key.split('.').reduce((o, k) => o?.[k], strings) ?? key
  const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const valid = n => typeof n === 'number' && Number.isFinite(n)
  const number = (n, options) => valid(n) ? new Intl.NumberFormat(locale, options).format(n) : '—'
  const zone = timezone ? { timeZone: timezone } : {}
  // A bad config timezone must not prevent an offline clock from starting.
  try { new Intl.DateTimeFormat(locale, zone) } catch { delete zone.timeZone }
  const dayKey = value => {
    const parts = new Intl.DateTimeFormat('en', { ...zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
    const part = type => parts.find(p => p.type === type).value
    return `${part('year')}-${part('month')}-${part('day')}`
  }
  return {
    lang, locale, timezone: zone.timeZone, dayKey, number,
    label: value => typeof value === 'string' ? value : value?.[lang] ?? value?.['pt-BR'] ?? '',
    t: (key, vars = {}) => fill(get(key), vars),
    time: value => new Intl.DateTimeFormat(locale, { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)),
    date: value => new Intl.DateTimeFormat(locale, { ...zone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value)),
    wallTime(value) {
      if (!/^\d{2}:\d{2}$/.test(value ?? '')) return '—'
      return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(`2000-01-01T${value}:00Z`))
    },
    currencyName(code) {
      try { return new Intl.DisplayNames([locale], { type: 'currency' }).of(code.toUpperCase()) ?? code.toUpperCase() } catch { return code.toUpperCase() }
    },
    currency(n, code) {
      if (!valid(n)) return '—'
      if (code.toLowerCase() === 'sats') return `${number(n)} sat`
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code.toUpperCase(),
        minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(n) > 0 && Math.abs(n) < .01 ? 8 : n >= 1000 ? 0 : 2 }).format(n)
    },
    percent(n) { return valid(n) ? new Intl.NumberFormat(locale, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 2 }).format(n / 100) : '—' },
    age(seconds) {
      const [unit, divisor] = seconds < 90 ? ['seconds', 1] : seconds < 5400 ? ['minutes', 60] : seconds < 86400 ? ['hours', 3600] : ['days', 86400]
      return fill(get(`age.${unit}`), { n: number(Math.max(0, Math.round(seconds / divisor))) })
    },
  }
}

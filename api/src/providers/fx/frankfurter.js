export default {
  id: 'frankfurter',
  capability: 'fx',
  ttl: 60,

  async fetch({ pairs }, { http }) {
    const out = {}
    for (const pair of pairs) {
      const [base, quote] = pair.split('-')
      if (!base || !quote) throw new Error(`frankfurter: malformed pair "${pair}"`)
      const body = (await http(
        `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`
      )).json()
      const rate = body?.rates?.[quote]
      if (!Number.isFinite(rate)) throw new Error(`frankfurter: no rate for "${pair}"`)
      // Frankfurter serves ECB reference rates and publishes no intraday
      // change. null, not zero.
      out[pair] = { rate, change: null }
    }
    return { pairs: out }
  },

  async capabilities({ http }) {
    const body = (await http('https://api.frankfurter.dev/v1/currencies')).json()
    const codes = Object.keys(body)
    return { pairs: codes.flatMap(b => codes.filter(q => q !== b).map(q => `${b}-${q}`)) }
  },
}

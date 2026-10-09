// fawazahmed0's currency-api, served from jsDelivr: free, keyless, and on a
// CDN, so it stays up when the other two don't. It also covers what
// Frankfurter can't -- ARS, BTC -- at the cost of one rate per day.
const base = code => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${encodeURIComponent(code)}.json`

export default {
  id: 'currency-api',
  capability: 'fx',
  ttl: 60,

  async fetch({ pairs }, { http }) {
    // One file per base currency carries every quote, so USD-BRL and USD-EUR
    // share a request.
    const bodies = new Map()
    const out = {}
    for (const pair of pairs) {
      const [from, to] = pair.toLowerCase().split('-')
      if (!from || !to) throw new Error(`currency-api: malformed pair "${pair}"`)
      if (!bodies.has(from)) bodies.set(from, (await http(base(from))).json())
      const rate = bodies.get(from)?.[from]?.[to]
      if (!Number.isFinite(rate)) throw new Error(`currency-api: no rate for "${pair}"`)
      // A daily snapshot with no intraday change. null, not zero.
      out[pair] = { rate, change: null }
    }
    return { pairs: out }
  },

  async capabilities({ http }) {
    // The USD file lists every currency the source knows. Tokens with longer
    // or odder names (1inch, aave) aren't currencies a pair can name.
    const body = (await http(base('usd'))).json()
    const codes = [...new Set(['usd', ...Object.keys(body.usd)])].filter(c => /^[a-z]{3}$/.test(c)).map(c => c.toUpperCase())
    return { pairs: codes.flatMap(b => codes.filter(q => q !== b).map(q => `${b}-${q}`)) }
  },
}

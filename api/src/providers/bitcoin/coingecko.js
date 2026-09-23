const BASE = 'https://api.coingecko.com/api/v3'

export default {
  id: 'coingecko',
  capability: 'bitcoin',
  ttl: 60,

  async fetch({ currencies }, { http }) {
    const vs = currencies.join(',')
    const body = (await http(
      `${BASE}/simple/price?ids=bitcoin&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`
    )).json()

    const source = body.bitcoin
    if (!source) throw new Error('coingecko: no bitcoin entry in response')

    const prices = {}
    for (const ccy of currencies) {
      const price = source[ccy]
      if (typeof price !== 'number') throw new Error(`coingecko: no price for "${ccy}"`)
      // `null`, not `0`, when a source doesn't report a 24h change: `0`
      // would claim a flat day no source actually said.
      prices[ccy] = { price, change24h: source[`${ccy}_24h_change`] ?? null }
    }
    return { prices }
  },

  async capabilities({ http }) {
    const list = (await http(`${BASE}/simple/supported_vs_currencies`)).json()
    return { currencies: list.map(c => c.toLowerCase()) }
  },
}

const BASE = 'https://api.coinbase.com/v2'

export default {
  id: 'coinbase',
  capability: 'bitcoin',
  ttl: 60,

  async fetch({ currencies }, { http }) {
    const body = (await http(`${BASE}/exchange-rates?currency=BTC`)).json()
    const rates = body?.data?.rates
    if (!rates) throw new Error('coinbase: no rates in response')

    const prices = {}
    for (const ccy of currencies) {
      // Coinbase keys are uppercase and its values are strings.
      const raw = rates[ccy.toUpperCase()]
      if (raw === undefined) throw new Error(`coinbase: no price for "${ccy}"`)
      const price = Number(raw)
      if (!Number.isFinite(price)) throw new Error(`coinbase: unparseable price for "${ccy}"`)
      // This endpoint carries no 24h change. Reporting 0 would read as
      // "flat" on screen, which is a lie; the widget renders the dash it
      // gets for null.
      prices[ccy] = { price, change24h: null }
    }
    return { prices }
  },

  async capabilities({ http }) {
    const body = (await http(`${BASE}/exchange-rates?currency=BTC`)).json()
    const rates = body?.data?.rates
    if (!rates) throw new Error('coinbase: no rates in response')
    return { currencies: Object.keys(rates).map(c => c.toLowerCase()) }
  },
}

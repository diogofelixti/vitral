export default {
  id: 'awesomeapi',
  capability: 'fx',
  ttl: 60,

  async fetch({ pairs }, { http }) {
    const body = (await http(
      `https://economia.awesomeapi.com.br/json/last/${pairs.map(p => encodeURIComponent(p)).join(',')}`
    )).json()

    const out = {}
    for (const pair of pairs) {
      // AwesomeAPI keys the response without the hyphen: USD-BRL -> USDBRL.
      const entry = body[pair.replace('-', '')]
      if (!entry) throw new Error(`awesomeapi: no data for "${pair}"`)
      const rate = Number(entry.bid)
      if (!Number.isFinite(rate)) throw new Error(`awesomeapi: unparseable rate for "${pair}"`)
      // Like the rate, the daily change comes across as a string.
      const change = Number(entry.pctChange)
      if (!Number.isFinite(change)) throw new Error(`awesomeapi: unparseable change for "${pair}"`)
      out[pair] = { rate, change }
    }
    return { pairs: out }
  },

  async capabilities() {
    return { pairs: ['USD-BRL', 'EUR-BRL', 'GBP-BRL', 'ARS-BRL', 'BTC-BRL'] }
  },
}

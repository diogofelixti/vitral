import { halvingFrom } from './lib/halving.js'

const BASE = 'https://mempool.space/api'

export default {
  id: 'mempool',
  capability: 'onchain',
  ttl: 60,

  async fetch(_params, { http }) {
    // The tip-height endpoint answers a bare integer as text/plain, not
    // JSON -- read from the .text property and parse it ourselves rather
    // than lean on JSON.parse's (undocumented-for-this-endpoint) tolerance
    // for a bare numeric literal. The fee-schedule endpoint is real JSON,
    // read via .json(). Two independent calls, each to its own endpoint --
    // no branching on what shape either response takes.
    const heightRes = await http(`${BASE}/blocks/tip/height`)
    const height = Number(heightRes.text.trim())
    if (!Number.isInteger(height)) {
      throw new Error(`mempool: block height "${heightRes.text}" is not an integer`)
    }

    const fees = (await http(`${BASE}/v1/fees/recommended`)).json()
    const feeSatVb = fees?.halfHourFee
    if (typeof feeSatVb !== 'number') throw new Error('mempool: no halfHourFee in fee schedule')

    return { blockHeight: height, feeSatVb, halving: halvingFrom(height) }
  },

  async capabilities() { return { fees: true } },
}

import { halvingFrom } from './lib/halving.js'

const HEIGHT_URL = 'https://blockstream.info/api/blocks/tip/height'

export default {
  id: 'blockstream',
  capability: 'onchain',
  ttl: 60,

  async fetch(_params, { http }) {
    // Same shape as mempool's height call: a bare integer served as
    // text/plain, read from the .text property and parsed ourselves.
    const { text } = await http(HEIGHT_URL)
    const height = Number(text.trim())
    if (!Number.isInteger(height)) throw new Error(`blockstream: block height "${text}" is not an integer`)
    // Blockstream's esplora API exposes no recommended-fee endpoint. null,
    // not 0 -- 0 would claim a fee rate no source actually reported, and
    // the widget draws a dash for null instead.
    return { blockHeight: height, feeSatVb: null, halving: halvingFrom(height) }
  },

  async capabilities() { return { fees: false } },
}

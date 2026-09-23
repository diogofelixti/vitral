import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class BlockedUrl extends Error {}

const V4_BLOCKED = [
  [/^10\./, 'private'], [/^127\./, 'loopback'], [/^169\.254\./, 'link-local'],
  [/^192\.168\./, 'private'], [/^0\./, 'unspecified'],
  [/^172\.(1[6-9]|2\d|3[01])\./, 'private'],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, 'carrier-grade nat'],
]

// Parses any RFC 4291 textual form -- full, compressed with `::`, and the
// mixed hex/dotted-quad form used for IPv4-mapped/compatible addresses --
// into its 8 16-bit words, so ranges are checked numerically rather than by
// string prefix.
//
// A prefix check gets both directions wrong: it over-blocks ("fc::1" is the
// single hextet 0x00fc, nowhere near fc00::/7, but starts with the same two
// characters as "fc00::1" and was being refused anyway), and it
// under-blocks ("febf::1" sits inside fe80::/10 but the text doesn't start
// with "fe80"). It also cannot see an embedded IPv4 address written in
// dotted form at all, which matters because that is genuinely what a real
// resolver hands back, not just a theoretical alternate spelling: on this
// machine, `dns.promises.lookup(host, { family: 6, hints: V4MAPPED })`
// returns "::ffff:127.0.0.1" -- dotted -- while a URL literal like
// [::ffff:7f00:1] canonicalizes to the hex form instead. A guard that
// recognises only one of those two spellings recognises neither, since
// resolveDns (and the real resolver it stands in for) can hand back either
// one.
function parseIPv6Words(rawAddress) {
  const address = rawAddress.split('%')[0] // drop a zone id, if present
  const dottedTail = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  let text = address
  if (dottedTail) {
    const octets = dottedTail[1].split('.').map(Number)
    if (octets.some((o) => o > 255)) return null
    const hi = ((octets[0] << 8) | octets[1]).toString(16)
    const lo = ((octets[2] << 8) | octets[3]).toString(16)
    text = address.slice(0, address.length - dottedTail[1].length) + hi + ':' + lo
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  let groups
  if (halves.length === 2) {
    const missing = 8 - (left.length + right.length)
    if (missing < 0) return null
    groups = [...left, ...Array(missing).fill('0'), ...right]
  } else {
    groups = left
  }
  if (groups.length !== 8) return null
  const words = groups.map((g) => parseInt(g, 16))
  return words.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffff) ? words : null
}

// The last 32 bits of an IPv6 address can smuggle a blocked IPv4 address
// past this guard, via any of three well-known prefixes. Decode the
// embedded address back to dotted decimal so it hits the same V4_BLOCKED
// check as if it had been written in IPv4 to begin with.
function v4FromWords(hi, lo) {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.')
}

function reasonFor(address) {
  if (isIP(address) === 6) {
    const words = parseIPv6Words(address.replace(/^\[|\]$/g, ''))
    // isIP() already confirmed this is syntactically valid IPv6; if this
    // parser still can't decode it, that is itself a reason not to trust
    // it, not a reason to wave it through.
    if (!words) return 'unparseable address'
    const [w0, w1, w2, w3, w4, w5, w6, w7] = words
    if (words.every((w) => w === 0)) return 'unspecified' // ::
    if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 1) return 'loopback' // ::1
    if ((w0 & 0xffc0) === 0xfe80) return 'link-local' // fe80::/10
    if ((w0 & 0xfe00) === 0xfc00) return 'unique local' // fc00::/7
    if ((w0 & 0xffc0) === 0xfec0) return 'site-local' // fec0::/10, deprecated but still routable on some networks
    // ::ffff:0:0/96 -- IPv4-mapped
    if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff) return reasonFor(v4FromWords(w6, w7))
    // 64:ff9b::/96 -- NAT64 well-known prefix (RFC 6052): a NAT64 gateway
    // forwards this straight to the embedded IPv4 address.
    if (w0 === 0x64 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return reasonFor(v4FromWords(w6, w7))
    // 2002::/16 -- 6to4 (RFC 3056): the next 32 bits are the embedded IPv4.
    if (w0 === 0x2002) return reasonFor(v4FromWords(w1, w2))
    return null
  }
  return V4_BLOCKED.find(([re]) => re.test(address))?.[1] ?? null
}

/**
 * Resolves the host before deciding, so a hostname whose DNS record is
 * stably a private/loopback/link-local address is refused, not just a
 * literal IP written into the config. Called for every hop of a redirect
 * chain, not just the first url.
 *
 * This does NOT close DNS rebinding. The resolution here and the
 * connection fetch() makes moments later are two separate lookups; a
 * hostname whose answer changes between them (a TTL-0 record designed to
 * flip from a public address to a private one) can still slip through,
 * because nothing binds the eventual TCP connection to the exact address
 * that was vetted. Closing that gap needs control over the HTTP client's
 * own connection/dispatcher to pin the socket to the address this function
 * approved, which this project does not have without adding a dependency
 * (Node's global fetch has no supported way to do it). Rebinding against a
 * *stable* private answer -- the common case, and the one every test here
 * covers -- is refused; a resolver deliberately flipping answers between
 * this call and the connection is a residual, documented risk, not one
 * this guard claims to close.
 */
export async function assertFetchable(rawUrl, { resolveDns } = {}) {
  let url
  // Never the value: every other refusal here reports url.hostname, but an
  // unparseable string has no host to reduce itself to, and it is still a
  // url the user configured -- a private feed url with a secret token in
  // it, missing only its scheme, is exactly the shape that fails to parse,
  // and this message reaches the container log via resolve.js.
  //
  // Two non-secret facts about it instead, because resolve.js's line names
  // only the capability and provider ("calendar/ics-url") and a panel
  // configures two calendars against that one provider -- so with the
  // value gone entirely, a user with one malformed feed url gets a log
  // line locating nothing. Whether a scheme is present separates the
  // common "pasted without https://" from a mistyped one, and the length
  // separates an empty or truncated value and tells two configured feeds
  // apart. Neither reveals any part of the string: the scheme is reported
  // as a yes/no rather than quoted, since the text before the first colon
  // is not guaranteed to be a scheme at all and could itself be secret.
  try { url = new URL(rawUrl) } catch {
    const text = String(rawUrl ?? '')
    const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? 'has a scheme' : 'no scheme'
    throw new BlockedUrl(`not a url (${scheme}, ${text.length} characters)`)
  }
  if (url.protocol !== 'https:') throw new BlockedUrl(`only https is allowed, got ${url.protocol}`)

  const host = url.hostname.replace(/^\[|\]$/g, '')

  // 'localhost' (and any name under it) is loopback by definition, per
  // RFC 6761 -- block it on the name itself rather than trusting whatever
  // resolveDns reports for it, since a real resolver never sends it out
  // over the network in the first place.
  if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) {
    throw new BlockedUrl(`${url.hostname} is a loopback hostname`)
  }

  const addresses = isIP(host)
    ? [{ address: host }]
    : await (resolveDns ?? (h => lookup(h, { all: true })))(host)

  // "No addresses" is not "nothing to worry about" -- a resolver returning
  // an empty list is not a result a security control gets to interpret as
  // approval. (The default resolver doesn't do this -- lookup() rejects
  // with ENOTFOUND instead -- but resolveDns is an injectable seam, and
  // this function has to be correct for whatever it returns.)
  if (addresses.length === 0) throw new BlockedUrl(`${url.hostname} resolved to no address`)

  for (const { address } of addresses) {
    const reason = reasonFor(address)
    if (reason) throw new BlockedUrl(`${url.hostname} resolves to a ${reason} address`)
  }
  return url
}

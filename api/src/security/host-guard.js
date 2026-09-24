import { isIP } from 'node:net'
import { RouteError } from '../routes/errors.js'

/**
 * Origin==Host (see assertJsonWrite in write-guard.js) stops a cross-site
 * page from writing through someone's own browser, but it does nothing
 * against DNS rebinding: a name the attacker controls is pointed first at
 * their own server, to serve the page, and then -- once the browser has
 * it cached -- at the panel's address. Origin and Host then agree with
 * each other, just not with anything this panel was ever meant to answer
 * for, and the same trick lets a page read /api/calendar as easily as it
 * writes /api/settings. So every request, reads included, is checked here
 * against a fixed idea of how a private panel is actually addressed: an
 * IP literal, "localhost", a bare single-label name (as a local DHCP or
 * mDNS name resolves), one of the reserved local suffixes, or a name the
 * owner listed explicitly in PANEL_HOSTS.
 */
const LOCAL_SUFFIXES = ['.local', '.lan', '.home.arpa', '.internal']

/** PANEL_HOSTS: a comma-separated list of extra exact names to trust. */
export function parseAllowedHosts(env) {
  return (env ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean)
}

/** The Host header's hostname, brackets and port stripped. Absent or malformed reads as null. */
function hostnameOf(header) {
  if (!header) return null
  if (header.startsWith('[')) {
    const end = header.indexOf(']')
    return end === -1 ? null : header.slice(1, end)
  }
  const colon = header.indexOf(':')
  return colon === -1 ? header : header.slice(0, colon)
}

export function isKnownHost(header, allowed = []) {
  const name = hostnameOf(header)
  if (!name) return false
  const lower = name.toLowerCase()
  return Boolean(isIP(name)) ||
    lower === 'localhost' ||
    !lower.includes('.') ||
    LOCAL_SUFFIXES.some(suffix => lower.endsWith(suffix)) ||
    allowed.includes(lower)
}

export function assertKnownHost(req, allowed = parseAllowedHosts(process.env.PANEL_HOSTS)) {
  if (!isKnownHost(req.headers.host, allowed)) throw new RouteError(421, 'MISDIRECTED_HOST')
}

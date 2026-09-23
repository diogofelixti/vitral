import { assertFetchable } from './security/ssrf-guard.js'
import { redactUrl } from './security/redact.js'

// A redirect can point anywhere, including an attacker-named host -- this
// request's own Authorization/Cookie headers must not follow it across an
// origin change, and a 303 (See Other) means "fetch the new location with
// GET", not "resend this request's body to a URL nobody asked to send it
// to". Both apply regardless of whether the guard is on: they are about not
// leaking a credential or a body, not about where the target is.
function adjustForRedirect(opts, fromUrl, toUrl, status) {
  let next = opts
  if (fromUrl.origin !== toUrl.origin && next.headers) {
    const headers = new Headers(next.headers)
    headers.delete('authorization')
    headers.delete('cookie')
    next = { ...next, headers }
  }
  if (status === 303) {
    const { body, ...rest } = next
    next = { ...rest, method: 'GET' }
  }
  return next
}

/**
 * Every outbound call goes through here: a source that never answers must
 * not be able to wedge the panel, and a source that answers forever must
 * not be able to exhaust its memory.
 *
 * Every failure below names the host through redactUrl(), never the whole
 * url. These messages are not kept in-process: resolve.js logs each
 * provider failure's err.message to stderr, and a private ics feed's url
 * carries a secret token in its path, so a routine 401 or a 404 from a
 * rotated share link would otherwise write that token into the container
 * log on every cache miss.
 */
export function createHttp({ timeoutMs = 8000, maxBytes = 2_000_000, guard = true, resolveDns } = {}) {
  return async function http(rawUrl, opts = {}) {
    let url = rawUrl
    let requestOpts = opts
    for (let hop = 0; hop <= 3; hop++) {
      if (guard) await assertFetchable(url, { resolveDns })
      const signal = AbortSignal.timeout(timeoutMs)
      const res = await fetch(url, { ...requestOpts, redirect: 'manual', signal })
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const next = res.headers.get('location')
        if (!next) throw new Error(`redirect without a location from ${redactUrl(url)}`)
        const nextUrl = new URL(next, url)
        requestOpts = adjustForRedirect(requestOpts, new URL(url), nextUrl, res.status)
        url = nextUrl.href
        continue
      }
      const declaredLength = Number(res.headers.get('content-length') ?? 0)
      if (declaredLength > maxBytes) {
        throw new Error(`response from ${redactUrl(url)} declares content-length ${declaredLength}, over the ${maxBytes} byte limit`)
      }
      const text = await res.text()
      const actualLength = Buffer.byteLength(text)
      if (actualLength > maxBytes) {
        throw new Error(`response from ${redactUrl(url)} is ${actualLength} bytes, over the ${maxBytes} byte limit`)
      }
      if (!res.ok) {
        const err = new Error(`${res.status} from ${redactUrl(url)}`)
        err.status = res.status
        throw err
      }
      return { status: res.status, text, json: () => JSON.parse(text) }
    }
    throw new Error(`too many redirects from ${redactUrl(rawUrl)}`)
  }
}

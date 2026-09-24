import { RouteError } from '../routes/errors.js'

/**
 * The panel has no login, by the owner's choice: anyone on the network
 * may change it. What must not change it is a page from somewhere else,
 * using the browser of someone at home. JSON cannot be sent across
 * origins without a preflight this api never answers, and the Origin must
 * name the same host the request arrived at, which stops that plain
 * cross-site case. It does *not* stop DNS rebinding -- a name the
 * attacker controls can be pointed at the panel so Origin and Host agree
 * with each other, just not with anything this panel should answer for;
 * that is what the host allowlist in host-guard.js is for, and it runs on
 * every request, this write included.
 */
export function assertJsonWrite(req) {
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw new RouteError(415, 'UNSUPPORTED_MEDIA_TYPE')
  let origin = null
  try { origin = new URL(req.headers.origin).host } catch { /* absent or malformed */ }
  if (!origin || origin !== req.headers.host) throw new RouteError(403, 'FORBIDDEN_ORIGIN')
}

export async function readJson(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new RouteError(413, 'PAYLOAD_TOO_LARGE')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') } catch { throw new RouteError(400, 'INVALID_REQUEST') }
}

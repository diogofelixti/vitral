import { RouteError } from './errors.js'

// Every destination is a constant. Nothing in the query string chooses
// where the browser goes next, so the flow cannot be turned into an open
// redirect.
const PANEL = '/'

function redirect(res, location) {
  res.writeHead(302, { location, 'cache-control': 'no-store' })
  res.end()
  return null
}

export function authRoutes({ googleAuth }) {
  const configured = () => {
    if (!googleAuth) throw new RouteError(503, 'GOOGLE_NOT_CONFIGURED')
    return googleAuth
  }
  return [
    [/^\/auth\/google$/, async (_req, _url, _m, res) => redirect(res, configured().authUrl())],
    [/^\/auth\/google\/callback$/, async (_req, url, _m, res) => {
      await configured().handleCallback({
        code: url.searchParams.get('code') ?? undefined,
        state: url.searchParams.get('state') ?? undefined,
      })
      return redirect(res, PANEL)
    }],
  ]
}

import { RouteError } from './errors.js'
import { PROFILES } from '../auth/google.js'

// Every destination is a constant. Nothing in the query string chooses
// where the browser goes next, so the flow cannot be turned into an open
// redirect.
// Back to the settings menu, where the calendar is picked next.
const PANEL = '/#settings'

function redirect(res, location) {
  res.writeHead(302, { location, 'cache-control': 'no-store' })
  res.end()
  return null
}

export function authRoutes({ settings }) {
  const configured = () => {
    const { googleAuth } = settings.current()
    if (!googleAuth) throw new RouteError(503, 'GOOGLE_NOT_CONFIGURED')
    return googleAuth
  }
  return [
    // Which calendar the account is for travels in the state, never back
    // out as a destination.
    [/^\/auth\/google$/, async (_req, url, _m, res) => {
      const auth = configured()
      const profile = url.searchParams.get('profile')
      if (!PROFILES.includes(profile)) throw new RouteError(400, 'UNKNOWN_PROFILE')
      return redirect(res, auth.authUrl(profile))
    }],
    [/^\/auth\/google\/callback$/, async (_req, url, _m, res) => {
      await configured().handleCallback({
        code: url.searchParams.get('code') ?? undefined,
        state: url.searchParams.get('state') ?? undefined,
      })
      return redirect(res, PANEL)
    }],
  ]
}

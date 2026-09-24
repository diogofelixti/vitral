import { dataRoutes } from './routes/data.js'
import { metaRoutes } from './routes/meta.js'
import { authRoutes } from './routes/auth.js'
import { settingsRoutes } from './routes/settings.js'
import { InvalidState, NotAuthenticated, GoogleNotConfigured } from './auth/google.js'
import { CalendarNotConfigured } from './providers/calendar/lib/not-configured.js'
import { createSettingsHolder } from './settings/holder.js'
import { assertKnownHost } from './security/host-guard.js'

/**
 * What a failed provider chain means to the person looking at the panel.
 * A Google grant that is gone needs a new consent; a Google calendar with
 * no client configured needs the .env filled in; a calendar with no url or
 * calendarId was left empty on purpose; anything else is a source that is
 * down, and waiting is the answer.
 */
function unavailableCode(err) {
  if (err.causes?.some(c => c instanceof NotAuthenticated)) return 'GOOGLE_REAUTH_REQUIRED'
  if (err.causes?.some(c => c instanceof GoogleNotConfigured)) return 'GOOGLE_NOT_CONFIGURED'
  if (err.causes?.some(c => c instanceof CalendarNotConfigured)) return 'CALENDAR_NOT_CONFIGURED'
  return 'PROVIDER_UNAVAILABLE'
}

export function createApp(deps) {
  // Older callers and tests pass a plain config; wrap it so every route has one shape to read.
  const settings = deps.settings ?? createSettingsHolder({ config: deps.config, googleAuth: deps.googleAuth ?? null })
  const all = { ...deps, settings }
  const routes = [...metaRoutes(all), ...dataRoutes(all), ...authRoutes(all), ...settingsRoutes(all)]

  const send = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    // Before any route, including a read: a request addressed to a name
    // this panel does not answer for is a rebinding attempt, not a request.
    try {
      assertKnownHost(req)
    } catch (err) {
      return send(res, err.status, { error: err.code })
    }
    for (const [pattern, handler] of routes) {
      const match = pattern.exec(url.pathname)
      if (!match) continue
      try {
        const body = await handler(req, url, match, res)
        if (body !== null) send(res, 200, body)
      } catch (err) {
        // A code, never a sentence: the frontend owns the wording, and an
        // internal message could carry a url or a token.
        if (err.name === 'ProvidersUnavailable') {
          return send(res, 503, {
            error: unavailableCode(err),
            capability: err.capability,
            triedProviders: err.triedProviders,
          })
        }
        if (err.name === 'FieldErrors') return send(res, 422, { error: 'INVALID_SETTINGS', errors: err.errors })
        if (err.name === 'RouteError') return send(res, err.status, { error: err.code })
        if (err instanceof InvalidState) return send(res, 400, { error: 'INVALID_REQUEST' })
        // Unexpected: the response says nothing, the container log says why.
        console.error(`app: ${url.pathname} failed: ${err.message}`)
        send(res, 500, { error: 'INTERNAL_ERROR' })
      }
      return
    }
    send(res, 404, { error: 'NOT_FOUND' })
  }
}

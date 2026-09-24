import { RouteError, FieldErrors } from './errors.js'
import { assertJsonWrite, readJson } from '../security/write-guard.js'
import { validateConfig, providerErrors } from '../settings/schema.js'
import { BlockedUrl } from '../security/ssrf-guard.js'
import { NotAuthenticated } from '../auth/google.js'

const toJson = value => JSON.parse(JSON.stringify(value))

/** The view's copy of the config: every secret ical address replaced by the fact it exists. */
function withoutSecrets(config) {
  const copy = toJson(config)
  for (const calendar of Object.values(copy.calendars)) {
    if (calendar.url) {
      let host = ''
      try { host = new URL(calendar.url).hostname } catch { /* shown as set, host unknown */ }
      delete calendar.url
      calendar.urlSet = true
      calendar.urlHost = host
    }
  }
  return copy
}

const CAPABILITIES = ['bitcoin', 'fx', 'weather', 'onchain']

/**
 * The same provider check `providerErrors` does, but read straight off the
 * raw body instead of the validated config: when the schema itself
 * rejected the payload there is no validated config to check, yet a
 * provider mistake in one capability must still be reported even though
 * another capability is missing or malformed. Each capability is looked
 * at on its own -- one missing `providers` array does not stop the
 * others from being checked -- and only string ids are compared, since a
 * non-string entry is already a schema error and would otherwise be
 * reported twice.
 */
function providerErrorsFromBody(body, available) {
  const errors = []
  for (const capability of CAPABILITIES) {
    const providers = body?.[capability]?.providers
    if (!Array.isArray(providers)) continue
    providers.forEach((id, index) => {
      if (typeof id === 'string' && !available[capability]?.includes(id)) {
        errors.push({ path: `${capability}.providers.${index}`, code: 'UNKNOWN_PROVIDER' })
      }
    })
  }
  return errors
}

/**
 * Every field problem at once: a schema mistake in one field must not hide
 * an unknown provider in another. A valid config already has the right
 * shape everywhere, so `providerErrors` runs on it directly; an invalid
 * one is checked capability by capability against the raw body instead,
 * since the schema can't be trusted to have produced a config to check.
 */
function allErrors(checked, body, available) {
  if (checked.ok) return providerErrors(checked.config, available)
  return [...checked.errors, ...providerErrorsFromBody(body, available)]
}

/** Put back the stored address the menu chose to keep, but only between two ics-url calendars: a stored address is not a fact about a different provider, and a calendar switched to google never had one to keep. */
export function mergeKeptUrls(incoming, stored) {
  if (!incoming?.calendars) return incoming
  for (const [profile, calendar] of Object.entries(incoming.calendars)) {
    const storedCalendar = stored.calendars?.[profile]
    if (calendar?.urlKept && !calendar.url && calendar.provider === 'ics-url' && storedCalendar?.provider === 'ics-url' && storedCalendar.url) {
      calendar.url = storedCalendar.url
    }
    if (calendar) { delete calendar.urlKept; delete calendar.urlSet; delete calendar.urlHost }
  }
  return incoming
}

export function settingsRoutes({ settings, service, registry, resolver, ctx = {}, now = Date.now }) {
  const needService = () => { if (!service) throw new RouteError(503, 'SETTINGS_UNAVAILABLE'); return service }

  async function view() {
    const state = settings.current()
    return {
      revision: state.revision,
      setupDone: state.setupDone,
      config: withoutSecrets(state.config),
      google: {
        configured: Boolean(state.google),
        clientId: state.google?.clientId ?? '',
        redirectUri: service?.redirectUri ?? '',
        connected: state.googleAuth ? await state.googleAuth.hasGrant() : false,
        lastSyncAt: state.lastGoogleSyncAt,
      },
    }
  }

  async function writeBody(req) {
    assertJsonWrite(req)
    return readJson(req)
  }

  return [
    [/^\/api\/settings$/, async req => {
      if (req.method === 'GET') return view()
      if (req.method !== 'PUT') throw new RouteError(405, 'METHOD_NOT_ALLOWED')
      const body = mergeKeptUrls(await writeBody(req), settings.current().config)
      const checked = validateConfig(body)
      const errors = allErrors(checked, body, registry.list())
      if (errors.length) throw new FieldErrors(errors)
      return { revision: await needService().saveConfig(checked.config) }
    }],

    [/^\/api\/settings\/setup-done$/, async req => {
      if (req.method !== 'POST') throw new RouteError(405, 'METHOD_NOT_ALLOWED')
      await writeBody(req)
      return { revision: await needService().finishSetup() }
    }],

    [/^\/api\/settings\/google$/, async (req, _url, _match, res) => {
      if (req.method === 'DELETE') {
        await writeBody(req)
        await needService().disconnectGoogle()
        res.writeHead(204, { 'cache-control': 'no-store' })
        res.end()
        return null
      }
      if (req.method !== 'POST') throw new RouteError(405, 'METHOD_NOT_ALLOWED')
      const body = await writeBody(req)
      const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
      const clientSecret = typeof body?.clientSecret === 'string' ? body.clientSecret.trim() : ''
      if (!clientId) throw new FieldErrors([{ path: 'clientId', code: 'REQUIRED' }])
      if (!clientSecret && !settings.current().google) throw new FieldErrors([{ path: 'clientSecret', code: 'REQUIRED' }])
      await needService().saveGoogle({ clientId, clientSecret })
      return { configured: true }
    }],

    [/^\/api\/settings\/test-calendar$/, async req => {
      if (req.method !== 'POST') throw new RouteError(405, 'METHOD_NOT_ALLOWED')
      const body = (await writeBody(req)) ?? {}
      // A profile tests the stored address the menu cannot see; a url tests a new one.
      const url = typeof body.profile === 'string' && Object.hasOwn(settings.current().config.calendars, body.profile)
        ? settings.current().config.calendars[body.profile].url
        : body.url
      if (typeof url !== 'string' || !url.startsWith('https://')) throw new RouteError(422, 'INVALID_URL')
      const from = new Date(now())
      const window = { from, to: new Date(from.getTime() + 30 * 86_400_000) }
      try {
        const { events } = await registry.get('calendar', 'ics-url').fetch({ url, timezone: settings.current().config.timezone, window }, ctx)
        return { events: events.length }
      } catch (err) {
        if (err instanceof BlockedUrl) throw new RouteError(422, 'BLOCKED_URL')
        throw new RouteError(422, 'CALENDAR_UNREADABLE')
      }
    }],

    [/^\/api\/settings\/google\/calendars$/, async req => {
      if (req.method !== 'GET') throw new RouteError(405, 'METHOD_NOT_ALLOWED')
      const { googleAuth } = settings.current()
      if (!googleAuth) throw new RouteError(503, 'GOOGLE_NOT_CONFIGURED')
      try {
        return await registry.get('calendar', 'google').listCalendars({ ...ctx, googleAuth })
      } catch (err) {
        if (err instanceof NotAuthenticated) throw new RouteError(503, 'GOOGLE_REAUTH_REQUIRED')
        throw err
      }
    }],

    [/^\/api\/settings\/geocode$/, async (req, url) => {
      if (req.method !== 'GET') throw new RouteError(405, 'METHOD_NOT_ALLOWED')
      const query = (url.searchParams.get('q') ?? '').trim()
      if (query.length < 2 || query.length > 80) throw new RouteError(400, 'INVALID_QUERY')
      const language = url.searchParams.get('lang') === 'en' ? 'en' : 'pt-BR'
      return resolver.resolve('geocode', ['open-meteo'], { query, language })
    }],
  ]
}

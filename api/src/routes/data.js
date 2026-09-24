import { defaultWindow } from '../providers/calendar/ics-url.js'
import { CalendarNotConfigured } from '../providers/calendar/lib/not-configured.js'
import { GoogleNotConfigured } from '../auth/google.js'
import { ProvidersUnavailable } from '../resolve.js'
import { RouteError } from './errors.js'

const CURRENCY = /^[a-z]{2,10}$/
const PAIR = /^[A-Z]{3}-[A-Z]{3}$/
const MAX_CURRENCIES = 10
const CURRENCY_LIST_TTL = 86_400

/**
 * Query parameters become cache keys and upstream requests, so they are
 * checked for shape before any provider hears of them.
 */
function currenciesFrom(url, config) {
  const raw = url.searchParams.get('vs')
  if (raw === null) return config.bitcoin.currencies
  const asked = [...new Set(raw.split(',').map(c => c.trim().toLowerCase()).filter(Boolean))]
  if (!asked.length || asked.length > MAX_CURRENCIES || !asked.every(c => CURRENCY.test(c))) {
    throw new RouteError(400, 'INVALID_CURRENCY')
  }
  return asked
}

function pairsFrom(url, config) {
  const raw = url.searchParams.get('pair')
  if (raw === null) return config.fx.pairs
  const pair = raw.trim().toUpperCase()
  if (!PAIR.test(pair)) throw new RouteError(400, 'INVALID_PAIR')
  return [pair]
}

/**
 * Only what the provider reads, plus the panel's timezone so "today" is
 * the owner's today and not the container's. The label stays out: it is
 * for the screen, and would only split the cache key.
 */
function calendarParams(calendar, config) {
  const params = { timezone: config.timezone }
  if (calendar.provider === 'google') params.calendarId = calendar.calendarId
  if (calendar.provider === 'ics-url') params.url = calendar.url
  return params
}

function calendarFor(config, profile) {
  // hasOwn, not `in` or a bare lookup: "constructor" or "__proto__" in a
  // query string must not resolve to something on Object.prototype.
  if (!Object.hasOwn(config.calendars, profile)) throw new RouteError(400, 'UNKNOWN_PROFILE')
  return config.calendars[profile]
}

/**
 * Why this calendar cannot be read, when the answer is already in the
 * config: no url or calendarId, or a google calendar with no client in the
 * environment. Known before any request, so no provider is asked -- asking
 * would log a failure every minute, forever, for a calendar the owner left
 * empty on purpose.
 */
function notSetUp(calendar, googleAuth) {
  if (calendar.provider === 'ics-url' && !calendar.url) return new CalendarNotConfigured('no url')
  if (calendar.provider === 'google' && !calendar.calendarId) return new CalendarNotConfigured('no calendarId')
  if (calendar.provider === 'google' && !googleAuth) return new GoogleNotConfigured('no client')
  return null
}

/** The instant tomorrow begins in `timezone`, DST included. */
function startOfTomorrow(timezone, now) {
  const today = defaultWindow(timezone, new Date(now)).from
  // 36 hours past today's midnight is always inside tomorrow, whatever a
  // DST change does to the length of today.
  return defaultWindow(timezone, new Date(today.getTime() + 36 * 3600_000)).from.getTime()
}

export function dataRoutes({ settings, resolver, now = Date.now }) {
  const resolveCalendar = (config, googleAuth, profile) => {
    const calendar = config.calendars[profile]
    const missing = notSetUp(calendar, googleAuth)
    if (missing) return Promise.reject(new ProvidersUnavailable('calendar', [], [missing]))
    return resolver.resolve('calendar', [calendar.provider], calendarParams(calendar, config))
      .then(envelope => {
        if (calendar.provider === 'google' && !envelope.stale) settings.markGoogleSync?.(envelope.updatedAt)
        return envelope
      })
  }

  return [
    [/^\/api\/bitcoin$/, async (_req, url) => {
      const { config } = settings.current()
      return resolver.resolve('bitcoin', config.bitcoin.providers, { currencies: currenciesFrom(url, config) })
    }],

    [/^\/api\/bitcoin\/currencies$/, async () => {
      const { config } = settings.current()
      return resolver.resolve('bitcoin', config.bitcoin.providers, {}, { via: 'capabilities', ttl: CURRENCY_LIST_TTL })
    }],

    [/^\/api\/fx$/, async (_req, url) => {
      const { config } = settings.current()
      return resolver.resolve('fx', config.fx.providers, { pairs: pairsFrom(url, config) })
    }],

    [/^\/api\/weather$/, async () => {
      const { config } = settings.current()
      const { latitude, longitude } = config.location
      return resolver.resolve('weather', config.weather.providers, { latitude, longitude, timezone: config.timezone })
    }],

    [/^\/api\/onchain$/, async () => resolver.resolve('onchain', settings.current().config.onchain.providers, {})],

    [/^\/api\/calendar$/, async (_req, url) => {
      const { config, googleAuth } = settings.current()
      const profile = url.searchParams.get('profile') ?? 'work'
      calendarFor(config, profile)
      return resolveCalendar(config, googleAuth, profile)
    }],

    [/^\/api\/calendar\/next$/, async () => {
      const { config, googleAuth } = settings.current()
      const at = now()
      const all = Object.keys(config.calendars)
      // A calendar left empty on purpose is not part of the answer, and its
      // absence is not a degradation.
      const unset = all.map(p => notSetUp(config.calendars[p], googleAuth)).filter(Boolean)
      const profiles = all.filter(p => !notSetUp(config.calendars[p], googleAuth))
      if (!profiles.length) throw new ProvidersUnavailable('calendar', [], unset)
      const settled = await Promise.allSettled(profiles.map(p => resolveCalendar(config, googleAuth, p)))

      const answered = []
      const causes = []
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') answered.push({ profile: profiles[i], envelope: result.value })
        else causes.push(...(result.reason.causes ?? [result.reason]))
      })
      // Both down is not "free": a panel that says the owner has nothing on
      // when it simply cannot see the calendars is worse than one that says
      // it cannot see them.
      if (!answered.length) {
        const tried = [...new Set(profiles.map(p => config.calendars[p].provider))]
        throw new ProvidersUnavailable('calendar', tried, causes)
      }

      const endOfToday = startOfTomorrow(config.timezone, at)
      // All-day events are left out: a holiday would otherwise hold the
      // "next" slot from midnight on and hide every real meeting behind it,
      // and it is not a reason to be busy.
      const upcoming = answered
        .flatMap(({ profile, envelope }) => envelope.data.events
          .filter(e => !e.allDay)
          .map(e => ({ ...e, profileLabel: config.calendars[profile].label })))
        .filter(e => Date.parse(e.end) > at && Date.parse(e.start) < endOfToday)
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

      const envelopes = answered.map(a => a.envelope)
      return {
        data: { next: upcoming[0] ?? null, busy: upcoming.some(e => Date.parse(e.start) <= at) },
        // As old as the oldest calendar it was built from: that is the age
        // of the claim "nothing else today".
        updatedAt: envelopes.map(e => e.updatedAt).sort()[0],
        provider: 'derived',
        stale: envelopes.some(e => e.stale),
        degraded: answered.length < profiles.length || envelopes.some(e => e.degraded),
      }
    }],
  ]
}

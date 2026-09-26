import { defaultWindow } from './ics-url.js'
import { GoogleNotConfigured } from '../../auth/google.js'
import { CalendarNotConfigured } from './lib/not-configured.js'

const BASE = 'https://www.googleapis.com/calendar/v3/calendars'

/** Whether the calendar's owner answered no to this meeting. */
const declinedByOwner = e => e.attendees?.some(a => a.self && a.responseStatus === 'declined')

export default {
  id: 'google',
  capability: 'calendar',
  ttl: 300,

  async fetch({ calendarId, account, timezone, window }, { http, googleAuth }) {
    if (!googleAuth) throw new GoogleNotConfigured('google: GOOGLE_CLIENT_ID is not set')
    if (!calendarId) throw new CalendarNotConfigured('google: this calendar has no calendarId configured')
    // encodeURIComponent leaves "." and ".." alone, and the URL parser
    // would then resolve them as path segments out of /events.
    if (calendarId === '.' || calendarId === '..') {
      throw new Error('google: this calendar has no usable calendarId configured')
    }
    const { from, to } = window ?? defaultWindow(timezone)
    // `account` is the calendar the grant belongs to: each may be connected
    // to a different Google account.
    const token = await googleAuth.accessToken(account)

    const url = new URL(`${BASE}/${encodeURIComponent(calendarId)}/events`)
    url.search = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: to.toISOString(),
      // One entry per occurrence: Google expands recurrence itself.
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
    })

    const body = (await http(url.href, { headers: { authorization: `Bearer ${token}` } })).json()
    const events = (body.items ?? [])
      // A cancelled occurrence or a meeting the owner said no to is not
      // something they will be at, and would otherwise mark them busy.
      .filter(e => e.status !== 'cancelled' && !declinedByOwner(e) && e.start && e.end)
      .map(e => ({
        id: String(e.id),
        title: String(e.summary ?? ''),
        // An all-day date parses as UTC midnight, which is exactly what
        // ics-url produces for the same event: swapping providers must not
        // move a holiday by the host's offset.
        start: new Date(e.start.dateTime ?? e.start.date).toISOString(),
        end: new Date(e.end.dateTime ?? e.end.date).toISOString(),
        allDay: Boolean(e.start.date),
      }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

    return { events }
  },

  async capabilities() { return { needsOAuth: true, recurring: true } },

  // For the settings menu, to pick a calendar by name instead of pasting an id.
  async listCalendars({ http, googleAuth, account }) {
    if (!googleAuth) throw new GoogleNotConfigured('google: GOOGLE_CLIENT_ID is not set')
    const token = await googleAuth.accessToken(account)
    const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader'
    const body = (await http(url, { headers: { authorization: `Bearer ${token}` } })).json()
    return {
      calendars: (body.items ?? []).map(c => ({
        id: String(c.id),
        name: String(c.summaryOverride ?? c.summary ?? c.id),
        primary: Boolean(c.primary),
      })),
    }
  },
}

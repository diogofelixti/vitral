/**
 * A calendar the owner has not pointed anywhere yet: no url for ics-url, no
 * calendarId for google. It is empty on purpose, not broken, and the panel
 * says "not set up" rather than "source unavailable".
 */
export class CalendarNotConfigured extends Error { name = 'CalendarNotConfigured' }

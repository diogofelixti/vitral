/**
 * An allowlist, built field by field, rather than a denylist of secrets.
 * A field added to the config later is absent from the API until somebody
 * deliberately adds it here — which is the direction the mistake should
 * point.
 *
 * calendarId and ics url never appear: the panel needs the label to draw a
 * heading, and nothing else.
 *
 * weather and onchain are deliberately absent: weather data comes from
 * /api/weather and its heading from location.label; onchain needs no config.
 */
export function publicConfig(config) {
  return {
    language: config.language,
    timezone: config.timezone,
    theme: config.theme,
    location: { label: config.location.label },
    bitcoin: { currencies: config.bitcoin.currencies, primary: config.bitcoin.primary },
    fx: { pairs: config.fx.pairs },
    calendars: {
      work: {
        label: typeof config.calendars.work.label === 'string'
          ? config.calendars.work.label
          : { 'pt-BR': config.calendars.work.label['pt-BR'], en: config.calendars.work.label.en },
      },
      personal: {
        label: typeof config.calendars.personal.label === 'string'
          ? config.calendars.personal.label
          : { 'pt-BR': config.calendars.personal.label['pt-BR'], en: config.calendars.personal.label.en },
      },
    },
    countdowns: config.countdowns.map(c => ({
      date: c.date,
      label: typeof c.label === 'string'
        ? c.label
        : { 'pt-BR': c.label['pt-BR'], en: c.label.en },
    })),
    screensaver: {
      pixelShift: config.screensaver.pixelShift,
      ...(config.screensaver.nightDim && {
        nightDim: {
          from: config.screensaver.nightDim.from,
          to: config.screensaver.nightDim.to,
          opacity: config.screensaver.nightDim.opacity,
        },
      }),
    },
  }
}

/**
 * A url reduced to its host, for an error message or a log line.
 *
 * A private calendar feed's url *is* a credential: "get the secret address
 * of this calendar" hands out a url with a long unguessable token in its
 * path, and this project's threat model names stored credentials as one of
 * its three surfaces. resolve.js logs every provider failure's `err.message`
 * to stderr, which on a panel is the container log, so a routine 401 from a
 * revoked feed or a 404 from a rotated one must not write that token there.
 *
 * The host is what an operator actually needs -- it tells one failing source
 * from another -- and it is already what ssrf-guard.js's own refusals
 * report. `host`, not `hostname`, so a non-default port still shows; URL
 * parsing drops any user:password before this ever sees it.
 *
 * Never throws: it is called while building an error message, and a
 * redaction helper that failed there would replace a real diagnostic with
 * its own stack.
 */
export function redactUrl(rawUrl) {
  try { return new URL(rawUrl).host } catch { return '(unparseable url)' }
}

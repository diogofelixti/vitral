// A link the panel opens in a new tab when an event is clicked. It comes from
// the calendar itself -- for a feed, written by whoever wrote the event -- so
// only https gets through: a javascript: or data: url in an anchor runs in the
// panel's own origin, and an http one would leave the local network in clear.
const MAX_LINK = 2048

/** `value` as an https url, or null. */
export function safeLink(value) {
  if (typeof value !== 'string' || value.length > MAX_LINK) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

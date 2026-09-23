/** wttr.in gives "06:12 AM"; the normal form is 24h HH:MM. */
function to24h(value) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value?.trim() ?? '')
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') hour += 12
  return `${String(hour).padStart(2, '0')}:${m[2]}`
}

/**
 * wttr.in's hourly buckets are keyed in the *queried location's* local
 * time, not wherever this process happens to run. `new Date().getHours()`
 * would read this server's own local hour and compare it against a
 * different place's clock -- correct only by coincidence when the two
 * happen to share a time zone, silently off by however many hours they
 * differ otherwise. Asking Intl for the hour in the location's own IANA
 * zone gets the right answer regardless of where the code executes.
 */
function currentHourAt(timezone, now) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
    .find(p => p.type === 'hour')
  return Number(part.value)
}

/** wttr.in keys each bucket in hundreds ("300" = 03:00). */
const toBucket = h => ({ h: Math.floor(Number(h.time) / 100), tempC: Number(h.tempC) })

export default {
  id: 'wttr-in',
  capability: 'weather',
  ttl: 900,

  // `now` is a seam, not a feature: it lets tests pin the instant
  // deterministically (see resolve.js's own `now = Date.now`) instead of
  // depending on the real wall clock, which is exactly where a regression
  // back to machine-local time would otherwise hide invisibly, the way it
  // did here before.
  async fetch({ latitude, longitude, timezone }, { http, now = () => new Date() }) {
    const b = (await http(`https://wttr.in/${latitude},${longitude}?format=j1`)).json()
    const current = b.current_condition?.[0]
    const today = b.weather?.[0]
    if (!current || !today) throw new Error('wttr-in: unexpected response shape')

    const nowHour = currentHourAt(timezone ?? 'UTC', now())
    // wttr.in reports only eight three-hourly buckets per day. Late in the
    // local day, today's remaining buckets alone can run out completely --
    // e.g. at 22:00 or 23:00 local, every bucket in [0,3,...,21] fails
    // `h >= nowHour` and today contributes nothing -- well before 8
    // entries are filled. Roll into tomorrow's buckets the same reason
    // open-meteo requests forecast_days=2 rather than 1: the hourly strip
    // must not go empty for two hours every single night.
    const remainingToday = (today.hourly ?? []).map(toBucket).filter(x => x.h >= nowHour)
    const tomorrow = (b.weather?.[1]?.hourly ?? []).map(toBucket)

    return {
      now: { tempC: Number(current.temp_C) },
      today: { maxC: Number(today.maxtempC), minC: Number(today.mintempC) },
      sun: { rise: to24h(today.astronomy?.[0]?.sunrise), set: to24h(today.astronomy?.[0]?.sunset) },
      hourly: [...remainingToday, ...tomorrow]
        .slice(0, 8)
        .map(x => ({ hour: `${String(x.h).padStart(2, '0')}:00`, tempC: x.tempC })),
    }
  },

  async capabilities() { return { hourly: true, sun: true } },
}

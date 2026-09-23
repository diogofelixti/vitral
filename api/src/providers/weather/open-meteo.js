const hhmm = iso => (iso ? iso.slice(11, 16) : null)

export default {
  id: 'open-meteo',
  capability: 'weather',
  ttl: 900,

  async fetch({ latitude, longitude, timezone }, { http }) {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude, longitude, timezone: timezone ?? 'auto', forecast_days: '2',
      current: 'temperature_2m',
      hourly: 'temperature_2m',
      daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
    })
    const b = (await http(url.href)).json()
    if (!b.current || !b.daily || !b.hourly) throw new Error('open-meteo: unexpected response shape')

    const nowHour = b.current.time.slice(0, 13)
    const start = b.hourly.time.findIndex(t => t.slice(0, 13) === nowHour)
    // A silent 0-fallback here would serve midnight's forecast as "now" on
    // a screen someone reads at a glance, with nothing to say it's wrong.
    // Fail loudly instead: the resolver already knows how to fall back to
    // the next configured provider, or to a stale cached value, when a
    // fetch throws -- that machinery exists precisely so a bad reading
    // like this one never has to be invented here.
    if (start === -1) throw new Error('open-meteo: current hour not found in hourly forecast')

    return {
      now: { tempC: b.current.temperature_2m },
      today: { maxC: b.daily.temperature_2m_max[0], minC: b.daily.temperature_2m_min[0] },
      sun: { rise: hhmm(b.daily.sunrise?.[0]), set: hhmm(b.daily.sunset?.[0]) },
      hourly: b.hourly.time.slice(start, start + 8).map((t, i) => ({
        hour: hhmm(t), tempC: b.hourly.temperature_2m[start + i],
      })),
    }
  },

  async capabilities() { return { hourly: true, sun: true } },
}

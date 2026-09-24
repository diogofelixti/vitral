const BASE = 'https://geocoding-api.open-meteo.com/v1/search'

/** City search for the setup wizard: a name in, coordinates and a time zone out. No key needed. */
export default {
  id: 'open-meteo',
  capability: 'geocode',
  ttl: 86_400,

  async fetch({ query, language = 'pt-BR' }, { http }) {
    const url = new URL(BASE)
    url.search = new URLSearchParams({ name: query, count: '5', language: language.slice(0, 2), format: 'json' })
    const body = (await http(url.href)).json()
    const places = (body.results ?? [])
      .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.timezone)
      .map(r => ({
        label: String(r.name),
        region: r.admin1 ? String(r.admin1) : '',
        country: r.country ? String(r.country) : '',
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: String(r.timezone),
      }))
    return { places }
  },

  async capabilities() { return { languages: true } },
}

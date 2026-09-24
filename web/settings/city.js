import { h } from './dom.js'
import { field } from './fields.js'
import { settingsApi } from './client.js'

/** Search by name; the manual fields stay available for when the search is down. */
export function cityPicker({ i18n, draft, onPick = () => {} }) {
  const results = h('div', { class: 'city-results', role: 'list' })
  const current = h('p', { class: 'field-hint' })
  const describe = () => { current.textContent = i18n.t('setup.city.current', { city: draft.location.label, zone: draft.timezone }) }
  const lat = h('input', { type: 'number', step: 'any', value: String(draft.location.latitude), 'aria-label': i18n.t('setup.city.latitude') })
  const lon = h('input', { type: 'number', step: 'any', value: String(draft.location.longitude), 'aria-label': i18n.t('setup.city.longitude') })
  const zone = h('input', { type: 'text', value: draft.timezone, 'aria-label': i18n.t('setup.city.timezone') })
  const label = h('input', { type: 'text', value: draft.location.label, 'aria-label': i18n.t('setup.city.name') })
  const syncManual = () => {
    draft.location = { latitude: Number(lat.value), longitude: Number(lon.value), label: label.value.trim() }
    draft.timezone = zone.value.trim()
    describe()
  }
  for (const input of [lat, lon, zone, label]) input.addEventListener('input', syncManual)

  let timer
  const search = h('input', { type: 'search', autocomplete: 'off' })
  search.addEventListener('input', () => {
    clearTimeout(timer)
    const query = search.value.trim()
    if (query.length < 2) { results.replaceChildren(); return }
    timer = setTimeout(async () => {
      const answer = await settingsApi.geocode(query, draft.language)
      if (!answer.ok) { results.replaceChildren(h('p', { class: 'form-error', text: i18n.t(`errors.${answer.data?.error ?? 'NETWORK_ERROR'}`) })); return }
      const places = answer.data.data.places
      if (!places.length) { results.replaceChildren(h('p', { class: 'field-hint', text: i18n.t('setup.city.none') })); return }
      results.replaceChildren(...places.map(place => h('div', { role: 'listitem' }, h('button', {
        type: 'button', text: [place.label, place.region, place.country].filter(Boolean).join(', '),
        onclick: () => {
          draft.location = { latitude: place.latitude, longitude: place.longitude, label: place.label }
          draft.timezone = place.timezone
          lat.value = String(place.latitude); lon.value = String(place.longitude); zone.value = place.timezone; label.value = place.label
          results.replaceChildren(); search.value = ''
          describe(); onPick(place)
        },
      }))))
    }, 350)
  })
  describe()
  return h('div', { class: 'city-picker' },
    field({ label: i18n.t('setup.city.search'), path: 'location', input: search }),
    results, current,
    h('details', {}, h('summary', { text: i18n.t('setup.city.manual') }),
      field({ label: i18n.t('setup.city.name'), path: 'location.label', input: label }),
      field({ label: i18n.t('setup.city.latitude'), path: 'location.latitude', input: lat }),
      field({ label: i18n.t('setup.city.longitude'), path: 'location.longitude', input: lon }),
      field({ label: i18n.t('setup.city.timezone'), path: 'timezone', input: zone })))
}

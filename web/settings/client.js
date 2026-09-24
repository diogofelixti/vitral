async function call(method, path, body) {
  const init = { method, cache: 'no-store', headers: { 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  try {
    const response = await fetch(path, { ...init, signal: AbortSignal.timeout(15_000) })
    const data = response.status === 204 ? null : await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'NETWORK_ERROR' } }
  }
}

export const settingsApi = {
  load: () => call('GET', '/api/settings'),
  save: config => call('PUT', '/api/settings', config),
  finishSetup: () => call('POST', '/api/settings/setup-done', {}),
  saveGoogle: credentials => call('POST', '/api/settings/google', credentials),
  disconnectGoogle: () => call('DELETE', '/api/settings/google', {}),
  googleCalendars: () => call('GET', '/api/settings/google/calendars'),
  // A url tests a new address; a profile tests the stored one, which the menu never sees.
  testCalendar: target => call('POST', '/api/settings/test-calendar', target.startsWith?.('https://') ? { url: target } : { profile: target }),
  geocode: (query, language) => call('GET', `/api/settings/geocode?q=${encodeURIComponent(query)}&lang=${language === 'en' ? 'en' : 'pt-BR'}`),
  providers: () => call('GET', '/api/providers'),
  currencies: () => call('GET', '/api/bitcoin/currencies'),
}

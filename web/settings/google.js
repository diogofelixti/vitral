import { h } from './dom.js'
import { field, showErrors } from './fields.js'
import { settingsApi } from './client.js'

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
/** Google accepts a plain-http redirect only to localhost: consent has to happen on the panel machine. */
export const isLocalPanel = (hostname = location.hostname) => LOCAL.has(hostname)

export function googlePanel({ i18n, view, draft }) {
  const google = view.google
  const root = h('div', { class: 'google-panel' })
  const port = location.port || '80'

  const copy = text => h('button', { type: 'button', text: i18n.t('google.copy'), onclick: async event => {
    try { await navigator.clipboard.writeText(text); event.target.textContent = i18n.t('google.copied') }
    catch { getSelection()?.selectAllChildren(event.target.previousElementSibling) }
  } })

  const guide = h('ol', { class: 'google-guide' },
    ...[1, 2, 3, 4, 5].map(n => h('li', { text: i18n.t(`google.steps.${n}`) })),
    h('li', {}, i18n.t('google.steps.redirect'),
      h('code', { class: 'settings-code google-redirect', text: google.redirectUri }), copy(google.redirectUri)))

  const clientId = h('input', { type: 'text', autocomplete: 'off', value: google.clientId })
  const secret = h('input', { type: 'password', autocomplete: 'off', placeholder: google.configured ? i18n.t('google.secretKept') : '' })
  const credentials = h('form', { class: 'google-credentials', onsubmit: async event => {
    event.preventDefault()
    const saved = await settingsApi.saveGoogle({ clientId: clientId.value.trim(), clientSecret: secret.value.trim() })
    if (saved.ok) { location.hash = 'settings'; location.reload(); return }
    if (saved.status === 422) showErrors(credentials, saved.data.errors, i18n)
    else credentials.querySelector('.form-error').textContent = i18n.t(`errors.${saved.data?.error ?? 'INTERNAL_ERROR'}`)
  } },
    field({ label: 'Client ID', path: 'clientId', input: clientId }),
    field({ label: i18n.t('google.secret'), path: 'clientSecret', input: secret }),
    h('p', { class: 'form-error', role: 'alert' }),
    h('button', { type: 'submit', text: i18n.t('google.saveCredentials') }))

  // Always in view, as the guide's last step; until there are credentials the link would only reach an error.
  const connect = isLocalPanel()
    ? h('div', { class: 'google-connect' },
        h('a', { href: '/auth/google', class: 'settings-primary', text: i18n.t(google.connected ? 'google.reconnect' : 'google.connect'),
          ...(!google.configured && { 'aria-disabled': 'true', onclick: event => event.preventDefault() }) }),
        !google.configured && h('p', { class: 'field-hint', text: i18n.t('google.needsCredentials') }))
    : h('div', { class: 'google-connect' }, h('p', { class: 'field-hint', text: i18n.t('google.remote') }),
        h('code', { class: 'settings-code google-tunnel', text: `ssh -L ${port}:localhost:${port} ${i18n.t('google.user')}@${location.hostname}` }))

  const status = h('p', { class: 'google-status', text: google.connected
    ? i18n.t('google.connected', { at: google.lastSyncAt ? i18n.time(google.lastSyncAt) : '—' })
    : google.configured ? i18n.t('google.notConnected') : i18n.t('google.notConfigured') })

  root.append(h('p', { text: i18n.t('google.intro') }), status)
  if (!google.configured) root.append(guide, credentials)
  else root.append(h('details', {}, h('summary', { text: i18n.t('google.changeCredentials') }), guide, credentials))
  root.append(connect)

  if (google.connected) {
    const pickers = h('div', { class: 'google-pickers' })
    root.append(pickers, h('button', { type: 'button', text: i18n.t('google.disconnect'), onclick: async () => {
      await settingsApi.disconnectGoogle(); location.hash = 'settings'; location.reload()
    } }))
    void settingsApi.googleCalendars().then(answer => {
      if (!answer.ok) { pickers.append(h('p', { class: 'form-error', text: i18n.t(`errors.${answer.data?.error ?? 'NETWORK_ERROR'}`) })); return }
      for (const profile of ['work', 'personal']) {
        if (draft.calendars[profile].provider !== 'google') continue
        const select = h('select', { 'data-profile-calendar': profile, onchange: e => { draft.calendars[profile].calendarId = e.target.value } },
          ...answer.data.calendars.map(c => h('option', { value: c.id, selected: c.id === draft.calendars[profile].calendarId || (c.primary && draft.calendars[profile].calendarId === 'primary'), text: c.name })))
        pickers.append(field({ label: i18n.label(draft.calendars[profile].label), path: `calendars.${profile}.calendarId`, input: select }))
      }
    })
  }
  return root
}

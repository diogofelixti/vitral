import { randomBytes } from 'node:crypto'

export class InvalidState extends Error { name = 'InvalidState' }
export class NotAuthenticated extends Error { name = 'NotAuthenticated' }
export class GoogleNotConfigured extends Error { name = 'GoogleNotConfigured' }

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

// A consent takes a person a minute, not an hour; and the panel is
// authorised once, by whoever sits at it. Anything older, or beyond the
// last few attempts, is somebody else's link.
const STATE_TTL_MS = 10 * 60_000
const MAX_PENDING = 20

/** The calendars a Google account can be connected to, one grant each. */
export const PROFILES = ['work', 'personal']

/**
 * Before each calendar had its own account, the file held one grant for
 * the whole panel. That grant served both calendars, so it keeps serving
 * both until the owner connects one of them to another account.
 */
function grantsFrom(stored) {
  if (stored?.refreshToken) return Object.fromEntries(PROFILES.map(p => [p, stored]))
  return Object.fromEntries(PROFILES.filter(p => stored?.[p]?.refreshToken).map(p => [p, stored[p]]))
}

export function createGoogleAuth({
  clientId, clientSecret, redirectUri, tokenStore, http,
  randomState = () => randomBytes(16).toString('hex'),
  now = Date.now,
}) {
  // States live in memory and are consumed on use. A restart invalidates
  // any consent still in flight, which is correct for the same reason.
  const pending = new Map() // state -> { issuedAt, profile }
  let grants = null // profile -> tokens
  const refreshing = new Map() // profile -> promise
  let writing = Promise.resolve()

  const load = async () => { grants ??= grantsFrom(await tokenStore.read()) }
  // One file for every grant: writes go one after another, so two
  // calendars refreshing in the same tick cannot race on it.
  const save = () => {
    writing = writing.catch(() => {}).then(() => tokenStore.write(grants))
    return writing
  }
  const known = profile => {
    if (!PROFILES.includes(profile)) throw new Error(`google: unknown calendar "${profile}"`)
  }

  async function exchange(params) {
    const res = await http(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    return res.json()
  }

  async function refresh(profile) {
    let body
    try {
      body = await exchange({
        refresh_token: grants[profile].refreshToken, client_id: clientId,
        client_secret: clientSecret, grant_type: 'refresh_token',
      })
    } catch (err) {
      // 400 invalid_grant and 401 mean the grant itself is gone -- revoked,
      // expired, or the client was rotated -- and only a new consent brings
      // it back. Anything else is Google having a bad minute, which the
      // cache and the next poll ride out on their own.
      if (err.status === 400 || err.status === 401) throw new NotAuthenticated('google refused the stored refresh token')
      throw err
    }
    if (!body.access_token) throw new NotAuthenticated('google refused the stored refresh token')
    grants[profile] = { ...grants[profile], accessToken: body.access_token, expiresAt: now() + (body.expires_in ?? 0) * 1000 }
    await save()
    return grants[profile].accessToken
  }

  return {
    authUrl(profile) {
      known(profile)
      const state = randomState()
      pending.set(state, { issuedAt: now(), profile })
      // A Map iterates in insertion order, so the first key is the oldest.
      while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value)
      const url = new URL(AUTH)
      url.search = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        // The account chooser every time: each calendar may belong to a
        // different account, and Google would otherwise pick the one
        // already signed in without asking.
        scope: SCOPE, access_type: 'offline', prompt: 'select_account consent', state,
      })
      return url.href
    },

    async handleCallback({ code, state }) {
      // Without this check, anyone able to make the browser open the
      // callback could bind their own Google account to this panel, and the
      // owner would be reading a stranger's calendar off their wall.
      const issued = state ? pending.get(state) : undefined
      if (issued === undefined) throw new InvalidState('unknown or reused state')
      pending.delete(state)
      if (now() - issued.issuedAt > STATE_TTL_MS) throw new InvalidState('expired state')
      // A valid state with no code is what Google sends back when the owner
      // declines consent. The state is spent either way.
      if (!code) throw new InvalidState('callback carried no code')

      const body = await exchange({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      })
      if (!body.refresh_token) throw new Error('google returned no refresh token')
      await load()
      grants[issued.profile] = {
        refreshToken: body.refresh_token,
        accessToken: body.access_token,
        expiresAt: now() + (body.expires_in ?? 0) * 1000,
      }
      await save()
      return issued.profile
    },

    // For the settings menu: is there a grant at all? Reads, never refreshes.
    async hasGrant(profile) {
      known(profile)
      await load()
      return Boolean(grants[profile]?.refreshToken)
    },

    async accessToken(profile) {
      known(profile)
      await load()
      const tokens = grants[profile]
      if (!tokens?.refreshToken) throw new NotAuthenticated(`no google token stored for ${profile}`)
      if (tokens.expiresAt > now() + 60_000) return tokens.accessToken
      // The same calendar can be asked for twice in one tick; one refresh serves both.
      if (!refreshing.has(profile)) refreshing.set(profile, refresh(profile).finally(() => refreshing.delete(profile)))
      return refreshing.get(profile)
    },

    // Disconnecting one calendar leaves the other's account connected.
    async forget(profile) {
      known(profile)
      await load()
      delete grants[profile]
      await save()
    },
  }
}

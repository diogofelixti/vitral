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

export function createGoogleAuth({
  clientId, clientSecret, redirectUri, tokenStore, http,
  randomState = () => randomBytes(16).toString('hex'),
  now = Date.now,
}) {
  // States live in memory and are consumed on use. A restart invalidates
  // any consent still in flight, which is correct for the same reason.
  const pending = new Map() // state -> issued at
  let tokens = null
  let refreshing = null

  async function exchange(params) {
    const res = await http(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    return res.json()
  }

  async function refresh() {
    let body
    try {
      body = await exchange({
        refresh_token: tokens.refreshToken, client_id: clientId,
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
    tokens = { ...tokens, accessToken: body.access_token, expiresAt: now() + (body.expires_in ?? 0) * 1000 }
    await tokenStore.write(tokens)
    return tokens.accessToken
  }

  return {
    authUrl() {
      const state = randomState()
      pending.set(state, now())
      // A Map iterates in insertion order, so the first key is the oldest.
      while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value)
      const url = new URL(AUTH)
      url.search = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: SCOPE, access_type: 'offline', prompt: 'consent', state,
      })
      return url.href
    },

    async handleCallback({ code, state }) {
      // Without this check, anyone able to make the browser open the
      // callback could bind their own Google account to this panel, and the
      // owner would be reading a stranger's calendar off their wall.
      const issuedAt = state ? pending.get(state) : undefined
      if (issuedAt === undefined) throw new InvalidState('unknown or reused state')
      pending.delete(state)
      if (now() - issuedAt > STATE_TTL_MS) throw new InvalidState('expired state')
      // A valid state with no code is what Google sends back when the owner
      // declines consent. The state is spent either way.
      if (!code) throw new InvalidState('callback carried no code')

      const body = await exchange({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      })
      if (!body.refresh_token) throw new Error('google returned no refresh token')
      tokens = {
        refreshToken: body.refresh_token,
        accessToken: body.access_token,
        expiresAt: now() + (body.expires_in ?? 0) * 1000,
      }
      await tokenStore.write(tokens)
    },

    async accessToken() {
      tokens ??= await tokenStore.read()
      if (!tokens?.refreshToken) throw new NotAuthenticated('no google token stored')
      if (tokens.expiresAt > now() + 60_000) return tokens.accessToken
      // Both calendars can ask in the same tick; one refresh serves both.
      refreshing ??= refresh().finally(() => { refreshing = null })
      return refreshing
    },
  }
}

import { createSettingsHolder } from './holder.js'
import { createGoogleAuth } from '../auth/google.js'

/**
 * Every change to the settings goes through here, in one order: write the
 * file, then swap the running state, then forget the cache. A failed write
 * leaves the panel running exactly as it was.
 */
export function createSettingsService({ store, boot, cache, ctx, tokenStore, redirectUri, http, makeGoogleAuth = createGoogleAuth }) {
  const buildAuth = google => google
    ? makeGoogleAuth({ clientId: google.clientId, clientSecret: google.clientSecret, redirectUri, tokenStore, http })
    : null

  const holder = createSettingsHolder({ ...boot, googleAuth: buildAuth(boot.google) })
  ctx.googleAuth = holder.current().googleAuth

  async function commit(patch) {
    const current = holder.current()
    const next = { ...current, ...patch, revision: current.revision + 1 }
    await store.write({ revision: next.revision, setupDone: next.setupDone, config: next.config, google: next.google })
    holder.set(next)
    ctx.googleAuth = next.googleAuth
    cache.clear()
    return next.revision
  }

  return {
    holder,
    redirectUri,
    saveConfig: config => commit({ config }),
    finishSetup: () => commit({ setupDone: true }),
    async saveGoogle({ clientId, clientSecret }) {
      const previous = holder.current().google
      const google = { clientId, clientSecret: clientSecret || previous?.clientSecret || '' }
      // A grant is issued to one client; under another it is useless and
      // would only produce a confusing refusal from Google.
      if (previous?.clientId !== clientId) await tokenStore.clear()
      return commit({ google, googleAuth: buildAuth(google) })
    },
    // One calendar's account; the other calendar keeps its own.
    async disconnectGoogle(profile) {
      await holder.current().googleAuth?.forget(profile)
      return commit({})
    },
  }
}

/**
 * Walks a capability's provider chain in the order the user configured it:
 * that order is both preference and fallback. The first provider to answer
 * wins; if it fails, the next one is tried, and so on. When every provider
 * in the chain is down, the last cached value is served with `stale: true`
 * rather than leaving a widget blank. Only when there is nothing cached
 * either does resolution give up, throwing ProvidersUnavailable.
 */
export class ProvidersUnavailable extends Error {
  constructor(capability, triedProviders, causes = []) {
    super(`no provider answered for ${capability}`)
    this.name = 'ProvidersUnavailable'
    this.capability = capability
    this.triedProviders = triedProviders
    // Each provider's own error, in chain order. The HTTP layer reads their
    // types -- a Google grant that is gone asks for a new consent, not for
    // patience -- and never their messages.
    this.causes = causes
  }
}

export function createResolver({ registry, cache, now = Date.now, ctx = {} }) {
  // Cache entries store the raw value a provider returned, nothing more, so
  // the resolver keeps its own record of which provider last supplied each
  // key, and whether that answer was a fallback. Without it, a cache hit
  // could only guess ("whatever is first in today's config", "never
  // degraded"), which is wrong as soon as the chain order changes or the
  // answer came from a fallback: the value doesn't stop being a fallback
  // answer just because it's now being read from cache instead of fetched.
  const provenance = new Map() // key -> { id, degraded }

  /**
   * `via: 'capabilities'` asks the chain what it supports rather than for
   * data (GET /api/bitcoin/currencies), under its own cache key and its
   * own ttl: a currency list changes on the scale of months, and must never
   * be served in answer to a price request with the same params.
   */
  async function resolve(capability, providerIds, params = {}, { via = 'fetch', ttl } = {}) {
    const key = via === 'fetch'
      ? `${capability}:${JSON.stringify(params)}`
      : `${capability}:${via}:${JSON.stringify(params)}`
    const hit = cache.get(key)
    if (hit?.fresh) {
      const known = provenance.get(key)
      return {
        data: hit.value,
        updatedAt: hit.updatedAt,
        provider: known?.id ?? providerIds[0],
        stale: false,
        degraded: known?.degraded ?? false,
      }
    }

    const tried = []
    const causes = []
    for (const id of providerIds) {
      const provider = registry.get(capability, id)
      if (!provider) throw new Error(`unknown provider "${id}" for capability "${capability}"`)
      tried.push(id)
      try {
        const data = via === 'fetch' ? await provider.fetch(params, ctx) : await provider[via](ctx)
        cache.set(key, data, ttl ?? provider.ttl)
        const degraded = tried.length > 1
        provenance.set(key, { id, degraded })
        return {
          data,
          updatedAt: new Date(now()).toISOString(),
          provider: id,
          stale: false,
          degraded,
        }
      } catch (err) {
        // Try the next one. The user picked this order for a reason.
        //
        // The HTTP response never carries this -- app.js's error codes are
        // never sentences -- so without a log line here, a provider's own
        // carefully-worded failure (an SSRF refusal, a capped-recurrence
        // drop, a malformed-response guard) is unreachable in production:
        // an operator sees a stale panel or "no provider answered" and
        // never learns why. Logged here, at the point each provider is
        // actually skipped, not only where the whole chain finally gives
        // up, so a failure masked by a later fallback still leaves a trace.
        console.error(`resolve: ${capability}/${id} failed, trying the next provider: ${err.message}`)
        causes.push(err)
      }
    }

    const stale = cache.get(key)
    if (stale) {
      const known = provenance.get(key)
      return {
        data: stale.value,
        updatedAt: stale.updatedAt,
        provider: known?.id ?? providerIds[0],
        stale: true,
        degraded: true,
      }
    }
    throw new ProvidersUnavailable(capability, tried, causes)
  }

  return { resolve }
}

/**
 * Entries are never evicted on expiry, only marked not-fresh. When every
 * provider for a capability is down, the last known value with its age is
 * the most useful thing the panel can show.
 */
export function createCache({ now = Date.now } = {}) {
  const store = new Map()
  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) return null
      return {
        value: entry.value,
        updatedAt: new Date(entry.at).toISOString(),
        fresh: now() - entry.at <= entry.ttl * 1000,
      }
    },
    set(key, value, ttlSeconds) {
      store.set(key, { value, at: now(), ttl: ttlSeconds })
    },
    // A settings save can change any key's meaning (a new city, another
    // provider order); forgetting everything is cheaper than reasoning about which.
    clear() { store.clear() },
  }
}

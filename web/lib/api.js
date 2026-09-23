/** Serial polling, immediate wake-up, bounded requests, and explicit cancellation. */
export function poll(path, seconds, onData) {
  let timer, controller, stopped = false, running = false, queued = false
  async function run() {
    if (stopped) return
    if (running) { queued = true; return }
    clearTimeout(timer)
    running = true
    controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let data = null, meta
    try {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal })
      const body = await response.json()
      if (response.ok) {
        data = body.data
        meta = { updatedAt: body.updatedAt, provider: body.provider, stale: body.stale, degraded: body.degraded }
      } else meta = { error: body.error ?? 'INTERNAL_ERROR' }
    } catch { meta = { error: 'NETWORK_ERROR' } }
    finally { clearTimeout(timeout); running = false }
    if (stopped) return
    try { onData(data, meta) }
    finally {
      if (queued) { queued = false; void run() }
      else timer = setTimeout(run, seconds * 1000)
    }
  }
  const wake = () => { if (document.visibilityState === 'visible') void run() }
  document.addEventListener('visibilitychange', wake)
  addEventListener('online', wake)
  void run()
  return () => {
    stopped = true
    clearTimeout(timer)
    controller?.abort()
    document.removeEventListener('visibilitychange', wake)
    removeEventListener('online', wake)
  }
}

/** Keep a wall panel alive and reduce static burn-in without hiding its data. */
export function startScreensaver({ pixelShift = true, nightDim = null, root, wakeLockApi, timezone } = {}) {
  if (!root) return () => {}
  const timers = []
  let wakeLock = null
  if (pixelShift) {
    let step = 0
    const shift = () => {
      step += 1
      const x = Math.round(Math.sin(step * 1.1) * 4)
      const y = Math.round(Math.cos(step * 0.7) * 4)
      root.style.transform = `translate(${x}px, ${y}px)`
    }
    shift()
    timers.push(setInterval(shift, 5 * 60_000))
  }
  if (nightDim) {
    const minutes = value => {
      const match = /^(\d{2}):(\d{2})$/.exec(value ?? '')
      if (!match) return null
      return Number(match[1]) * 60 + Number(match[2])
    }
    const from = minutes(nightDim.from), to = minutes(nightDim.to)
    const apply = () => {
      const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
      const at = Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value)
      const dim = from !== null && to !== null && (from <= to ? at >= from && at < to : at >= from || at < to)
      root.style.opacity = dim ? String(nightDim.opacity ?? .45) : '1'
    }
    apply()
    timers.push(setInterval(apply, 60_000))
  }
  const claim = async () => {
    try { wakeLock = await (wakeLockApi ?? navigator.wakeLock)?.request('screen') } catch { /* unsupported or denied */ }
  }
  void claim()
  const reclaim = () => { if (document.visibilityState === 'visible') void claim() }
  document.addEventListener('visibilitychange', reclaim)
  return () => {
    timers.forEach(clearInterval)
    document.removeEventListener('visibilitychange', reclaim)
    void wakeLock?.release?.()
    root.style.transform = ''
    root.style.opacity = ''
  }
}

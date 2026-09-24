import { publicConfig } from '../security/redact.js'

export function metaRoutes({ settings, registry }) {
  return [
    [/^\/api\/health$/, async () => ({ status: 'ok' })],
    [/^\/api\/config$/, async () => {
      const { config, revision, setupDone } = settings.current()
      return { ...publicConfig(config), revision, setupDone }
    }],
    [/^\/api\/providers$/, async () => {
      const { config } = settings.current()
      const out = {}
      for (const [capability, ids] of Object.entries(registry.list())) {
        const active = capability === 'calendar'
          ? [...new Set(Object.values(config.calendars).map(c => c.provider))]
          : config[capability]?.providers ?? []
        out[capability] = { available: ids, active }
      }
      return out
    }],
  ]
}

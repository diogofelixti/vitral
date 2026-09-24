import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createApp } from './app.js'
import { createCache } from './cache.js'
import { createRegistry } from './registry.js'
import { createResolver } from './resolve.js'
import { createHttp } from './http.js'
import { createTokenStore } from './token-store.js'
import { createSettingsStore } from './settings/store.js'
import { bootSettings } from './settings/boot.js'
import { createSettingsService } from './settings/service.js'

const env = process.env
const port = Number(env.PORT ?? 3100)
const configPath = env.CONFIG_PATH ?? '/app/config/config.yaml'

// A file to import, or nothing: a missing path, or a directory Docker made
// in its place, both mean the owner configures through the wizard.
async function readYaml() {
  try { return (await stat(configPath)).isFile() ? await readFile(configPath, 'utf8') : null } catch { return null }
}

try {
  const http = createHttp()
  const registry = await createRegistry()
  const cache = createCache()
  const ctx = { http }
  const tokenStore = createTokenStore(env.TOKEN_PATH ?? '/data/tokens.json')
  const store = createSettingsStore(env.SETTINGS_PATH ?? '/data/settings.json')
  const boot = await bootSettings({ store, readYaml, env })
  // Google accepts a plain-http redirect only for localhost, so this is
  // where the owner consents from: the machine running the panel, on the
  // port the host publishes.
  const redirectUri = `http://localhost:${env.VITRAL_PORT ?? 8080}/auth/google/callback`
  const service = createSettingsService({ store, boot, cache, ctx, tokenStore, redirectUri, http })
  const resolver = createResolver({ registry, cache, ctx })
  const server = createServer(createApp({ settings: service.holder, service, resolver, registry, ctx }))
  server.listen(port, () => {
    console.log(`vitral api listening on ${server.address().port}`)
    console.log(`google calendar: ${service.holder.current().googleAuth ? 'client configured' : 'not configured'}`)
    console.log(`setup: ${service.holder.current().setupDone ? 'done' : 'pending'}`)
  })
} catch (err) {
  console.error(err)
  process.exit(1)
}

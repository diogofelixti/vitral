import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createApp } from './app.js'
import { loadConfig, ConfigError } from './config.js'
import { createCache } from './cache.js'
import { createRegistry } from './registry.js'
import { createResolver } from './resolve.js'
import { createHttp } from './http.js'
import { createGoogleAuth } from './auth/google.js'
import { createTokenStore } from './token-store.js'

const env = process.env
const port = Number(env.PORT ?? 3100)

try {
  const config = loadConfig(await readFile(env.CONFIG_PATH ?? '/app/config.yaml', 'utf8'))
  const http = createHttp()
  const registry = await createRegistry()

  // Both halves or neither: a client id without its secret cannot complete
  // a consent, and failing at the callback is a worse place to find out.
  const googleAuth = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? createGoogleAuth({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        // Google accepts a plain-http redirect only for localhost, so this
        // is where the owner opens /auth/google from: the machine running
        // the panel, on the port the host publishes.
        redirectUri: `http://localhost:${env.VITRAL_PORT ?? 8080}/auth/google/callback`,
        tokenStore: createTokenStore(env.TOKEN_PATH ?? '/data/tokens.json'),
        http,
      })
    : null

  const resolver = createResolver({ registry, cache: createCache(), ctx: { http, googleAuth } })

  const server = createServer(createApp({ config, resolver, registry, googleAuth }))
  server.listen(port, () => {
    console.log(`vitral api listening on ${server.address().port}`)
    console.log(`google calendar: ${googleAuth ? 'client configured' : 'not configured'}`)
  })
} catch (err) {
  // A config mistake must stop the container with a readable line, not boot
  // a half-empty panel the user spends half an hour diagnosing.
  console.error(err instanceof ConfigError ? err.message : err)
  process.exit(1)
}

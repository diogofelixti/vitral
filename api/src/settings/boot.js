import { loadConfig, ConfigError } from '../config.js'
import { validateConfig, DEFAULT_CONFIG } from './schema.js'

const clone = value => JSON.parse(JSON.stringify(value))

/**
 * Where the running configuration comes from on start. The settings file,
 * once there is one; before that, a one-time import of config.yaml and the
 * GOOGLE_* variables, so an existing install loses nothing; and when there
 * is nothing to import, the defaults with the setup wizard still to run.
 * A broken config.yaml no longer stops the container: it is reported with
 * its line and the wizard takes over.
 */
export async function bootSettings({ store, readYaml, env, log = console.log }) {
  const raw = await readYaml()
  const yamlText = raw?.trim() ? raw : null
  const envGoogle = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null

  const saved = await store.read()
  if (saved.status === 'ok') {
    const valid = validateConfig(saved.data.config)
    if (valid.ok) {
      if (yamlText || envGoogle) log('settings: config.yaml and GOOGLE_* in .env are ignored; the settings menu holds the configuration now')
      return { config: valid.config, google: saved.data.google ?? null, setupDone: Boolean(saved.data.setupDone), revision: saved.data.revision ?? 1 }
    }
    log('settings: settings.json no longer validates; kept as settings.json.bad, starting from the defaults')
    await store.quarantine()
  } else if (saved.status === 'corrupt') {
    log('settings: settings.json was unreadable; kept as settings.json.bad, starting from the defaults')
  }

  let config = validateConfig(clone(DEFAULT_CONFIG)).config
  let setupDone = false
  if (yamlText) {
    try {
      config = loadConfig(yamlText)
      setupDone = true
      log('settings: imported config.yaml; from now on the settings menu holds the configuration')
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err
      log(err.message)
    }
  }
  const boot = { config, google: envGoogle, setupDone, revision: 1 }
  await store.write(boot)
  return boot
}

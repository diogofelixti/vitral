import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Subdirectory names of `path`, or `[]` if `path` does not exist. */
function listDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/**
 * `.js` file names directly inside a capability directory, skipping
 * subdirectories deliberately (via `dirent.isFile()`, not by name) --
 * shared code more than one provider in that capability needs belongs in
 * a `lib/` subdirectory there (see `providers/onchain/lib/`), which this
 * must never mistake for a provider itself.
 */
function listProviderFiles(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.js'))
    .map(d => d.name)
}

/**
 * Discovers providers from the directory tree, so adding one is adding a
 * file: `providers/<capability>/<id>.js` with a default export shaped like
 * `{ id, capability, ttl, fetch(params, ctx), capabilities?(ctx) }`.
 *
 * The tree may not exist yet (each capability's first provider arrives in
 * a later task) or may be empty; either way this returns a registry with
 * nothing in it instead of throwing, so wiring the app together does not
 * depend on provider files already being present.
 *
 * A `.js` file directly in a capability directory that isn't shaped like a
 * provider -- no default export, or one with no `.id` -- fails loudly,
 * naming the file, rather than being silently skipped or crashing two
 * frames down with a bare `TypeError`. A genuinely broken provider must
 * not vanish from the registry without a trace, and a shared helper
 * dropped flat beside its providers (as `halving.js` once was here) needs
 * to be told where it actually belongs.
 */
export async function createRegistry(root = join(HERE, 'providers')) {
  const byCapability = new Map()
  for (const capability of listDirs(root)) {
    const map = new Map()
    for (const file of listProviderFiles(join(root, capability))) {
      const mod = await import(pathToFileURL(join(root, capability, file)).href)
      if (!mod.default || typeof mod.default.id !== 'string') {
        throw new Error(
          `providers/${capability}/${file} has no default export with an .id; ` +
          `shared helpers belong in a lib/ subdirectory, not loose beside the providers`
        )
      }
      map.set(mod.default.id, mod.default)
    }
    byCapability.set(capability, map)
  }
  return {
    get: (capability, id) => byCapability.get(capability)?.get(id),
    list: () => Object.fromEntries(
      [...byCapability].map(([cap, m]) => [cap, [...m.keys()]])),
  }
}

import { readFile, writeFile, chmod, rename } from 'node:fs/promises'

/**
 * The Google refresh token, on the api's own volume. The web container
 * never mounts it, and the file is readable by its owner only.
 */
export function createTokenStore(path = '/data/tokens.json') {
  return {
    async read() {
      // Missing or corrupt reads as "nothing stored": the panel then asks
      // for a new consent, which is the only way to repair either.
      try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
    },
    async write(tokens) {
      // Written beside the real file and renamed over it, so a crash
      // mid-write leaves the old grant intact rather than half a JSON.
      const temp = `${path}.tmp`
      await writeFile(temp, JSON.stringify(tokens), { mode: 0o600 })
      // Explicit: `mode` only applies when the file is created, and a
      // umask could have narrowed it further than the owner can read.
      await chmod(temp, 0o600)
      await rename(temp, path)
    },
  }
}

import { readFile, writeFile, chmod, rename } from 'node:fs/promises'

/**
 * The panel's settings, on the api's own volume, next to the Google token.
 * Written beside the real file and renamed over it, so a crash mid-write
 * leaves the previous settings whole.
 */
export function createSettingsStore(path) {
  const quarantine = () => rename(path, `${path}.bad`)
  return {
    async read() {
      let text
      try { text = await readFile(path, 'utf8') } catch (err) {
        if (err.code === 'ENOENT') return { status: 'missing' }
        throw err
      }
      try { return { status: 'ok', data: JSON.parse(text) } } catch {
        // Kept, not deleted: whatever broke it, the owner may want it back.
        await quarantine()
        return { status: 'corrupt' }
      }
    },
    async write(data) {
      const temp = `${path}.tmp`
      await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 })
      await chmod(temp, 0o600)
      await rename(temp, path)
    },
    quarantine,
  }
}

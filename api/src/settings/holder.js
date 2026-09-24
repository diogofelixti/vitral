/**
 * The configuration the api is running with right now. Routes read it on
 * every request instead of capturing it at startup, so a save from the
 * settings menu takes effect on the next request without a restart.
 */
export function createSettingsHolder({ config, google = null, googleAuth = null, setupDone = true, revision = 1 }) {
  let state = { config, google, googleAuth, setupDone, revision, lastGoogleSyncAt: null }
  return {
    current: () => state,
    set(next) { state = next },
    // Not a configuration change: no new revision, no reload of open screens.
    markGoogleSync(at) { state = { ...state, lastGoogleSyncAt: at } },
  }
}

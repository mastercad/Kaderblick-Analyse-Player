export interface AutoUpdateClient {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  checkForUpdatesAndNotify: () => Promise<unknown>
  on(event: 'error', listener: (error: Error) => void): unknown
  removeListener(event: 'error', listener: (error: Error) => void): unknown
}

export interface AutoUpdateSchedule {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  setInterval: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
  clearInterval: (timer: ReturnType<typeof setInterval>) => void
}

const DEFAULT_INITIAL_DELAY_MS = 15_000
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

const defaultSchedule: AutoUpdateSchedule = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
  clearInterval: (timer) => clearInterval(timer)
}

const detachTimer = (timer: ReturnType<typeof setTimeout>): void => {
  timer.unref?.()
}

export type AutomaticUpdateMode = 'disabled' | 'install'

export const startAutomaticUpdates = (
  updater: AutoUpdateClient,
  mode: AutomaticUpdateMode,
  schedule: AutoUpdateSchedule = defaultSchedule,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS
): (() => void) => {
  if (mode === 'disabled') return () => undefined

  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = false

  let checkRunning = false
  const checkForUpdates = (): void => {
    if (checkRunning) return
    checkRunning = true
    // Deliberately detached from application startup and playback. Offline
    // failures are expected and must never delay or interrupt video analysis.
    void updater.checkForUpdatesAndNotify()
      .catch(() => undefined)
      .finally(() => { checkRunning = false })
  }

  const onError = (): void => {
    // electron-updater emits network failures as errors in addition to
    // rejecting the check promise. They remain silent because offline use is
    // a normal operating mode for this application.
  }
  updater.on('error', onError)

  const initialTimer = schedule.setTimeout(checkForUpdates, initialDelayMs)
  const repeatTimer = schedule.setInterval(checkForUpdates, checkIntervalMs)
  detachTimer(initialTimer)
  detachTimer(repeatTimer)

  return () => {
    schedule.clearTimeout(initialTimer)
    schedule.clearInterval(repeatTimer)
    updater.removeListener('error', onError)
  }
}

import type { UpdateStatus } from '../common/types'

interface UpdateInfo {
  version: string
}

interface DownloadProgress {
  percent: number
}

export interface AutoUpdateClient {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'update-available' | 'update-downloaded', listener: (info: UpdateInfo) => void): unknown
  on(event: 'download-progress', listener: (progress: DownloadProgress) => void): unknown
  removeListener(event: 'error', listener: (error: Error) => void): unknown
  removeListener(event: 'update-available' | 'update-downloaded', listener: (info: UpdateInfo) => void): unknown
  removeListener(event: 'download-progress', listener: (progress: DownloadProgress) => void): unknown
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
  publishStatus: (status: UpdateStatus) => void = () => undefined,
  schedule: AutoUpdateSchedule = defaultSchedule,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS
): { dispose: () => void; download: () => Promise<void>; installAndRestart: () => void } => {
  if (mode === 'disabled') return {
    dispose: () => undefined,
    download: async () => undefined,
    installAndRestart: () => undefined
  }

  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false

  let checkRunning = false
  const checkForUpdates = (): void => {
    if (checkRunning) return
    checkRunning = true
    // Deliberately detached from application startup and playback. Offline
    // failures are expected and must never delay or interrupt video analysis.
    void updater.checkForUpdates()
      .catch(() => undefined)
      .finally(() => { checkRunning = false })
  }

  let offeredVersion: string | undefined
  let downloadRequested = false
  const onUpdateAvailable = (info: UpdateInfo): void => {
    offeredVersion = info.version
    publishStatus({ phase: 'available', version: info.version })
  }
  const onDownloadProgress = (progress: DownloadProgress): void => {
    if (offeredVersion) publishStatus({ phase: 'downloading', version: offeredVersion, percent: progress.percent })
  }
  const onUpdateDownloaded = (info: UpdateInfo): void => {
    offeredVersion = info.version
    downloadRequested = false
    publishStatus({ phase: 'downloaded', version: info.version })
  }
  const onError = (error: Error): void => {
    // electron-updater emits network failures as errors in addition to
    // rejecting the check promise. They remain silent because offline use is
    // a normal operating mode for this application. Download failures after
    // an explicit user action are shown in the in-app update dialog.
    if (downloadRequested) {
      publishStatus({ phase: 'error', version: offeredVersion, message: error.message })
      downloadRequested = false
    }
  }
  updater.on('error', onError)
  updater.on('update-available', onUpdateAvailable)
  updater.on('download-progress', onDownloadProgress)
  updater.on('update-downloaded', onUpdateDownloaded)

  const initialTimer = schedule.setTimeout(checkForUpdates, initialDelayMs)
  const repeatTimer = schedule.setInterval(checkForUpdates, checkIntervalMs)
  detachTimer(initialTimer)
  detachTimer(repeatTimer)

  return {
    dispose: () => {
      schedule.clearTimeout(initialTimer)
      schedule.clearInterval(repeatTimer)
      updater.removeListener('error', onError)
      updater.removeListener('update-available', onUpdateAvailable)
      updater.removeListener('download-progress', onDownloadProgress)
      updater.removeListener('update-downloaded', onUpdateDownloaded)
    },
    download: async () => {
      if (!offeredVersion || downloadRequested) return
      downloadRequested = true
      publishStatus({ phase: 'downloading', version: offeredVersion })
      try {
        await updater.downloadUpdate()
      } catch (error) {
        publishStatus({
          phase: 'error',
          version: offeredVersion,
          message: error instanceof Error ? error.message : 'Das Update konnte nicht heruntergeladen werden.'
        })
        downloadRequested = false
      }
    },
    installAndRestart: () => updater.quitAndInstall(false, true)
  }
}

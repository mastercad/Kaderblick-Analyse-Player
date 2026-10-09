import { describe, expect, it, vi } from 'vitest'
import { startAutomaticUpdates, type AutoUpdateClient, type AutoUpdateSchedule } from './autoUpdate'

const makeUpdater = (checkForUpdates = vi.fn().mockResolvedValue(undefined)) => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    checkForUpdates,
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
    removeListener: vi.fn((event: string) => listeners.delete(event))
  } as unknown as AutoUpdateClient
  return { updater, emit: (event: string, value: unknown) => listeners.get(event)?.(value) }
}

const makeSchedule = () => {
  let initialCheck: (() => void) | undefined
  let repeatedCheck: (() => void) | undefined
  const schedule: AutoUpdateSchedule = {
    setTimeout: vi.fn((callback) => {
      initialCheck = callback
      return { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>
    }),
    setInterval: vi.fn((callback) => {
      repeatedCheck = callback
      return { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>
    }),
    clearTimeout: vi.fn(),
    clearInterval: vi.fn()
  }
  return { schedule, runInitialCheck: () => initialCheck?.(), runRepeatedCheck: () => repeatedCheck?.() }
}

describe('automatic updates', () => {
  it('does nothing in development builds', () => {
    const { updater } = makeUpdater()
    const { schedule } = makeSchedule()

    startAutomaticUpdates(updater, 'disabled', vi.fn(), schedule)

    expect(schedule.setTimeout).not.toHaveBeenCalled()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('checks after a delay without downloading or installing behind the user', () => {
    const { updater } = makeUpdater()
    const { schedule, runInitialCheck } = makeSchedule()

    startAutomaticUpdates(updater, 'install', vi.fn(), schedule)

    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    runInitialCheck()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('publishes the update and acts only after explicit download and restart commands', async () => {
    const { updater, emit } = makeUpdater()
    const publishStatus = vi.fn()
    const controller = startAutomaticUpdates(updater, 'install', publishStatus, makeSchedule().schedule)

    emit('update-available', { version: '2.12.0' })
    expect(publishStatus).toHaveBeenLastCalledWith({ phase: 'available', version: '2.12.0' })

    await controller.download()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(publishStatus).toHaveBeenLastCalledWith({ phase: 'downloading', version: '2.12.0' })

    emit('update-downloaded', { version: '2.12.0' })
    expect(publishStatus).toHaveBeenLastCalledWith({ phase: 'downloaded', version: '2.12.0' })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    controller.installAndRestart()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('swallows offline check failures and allows a later retry', async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error('ENETUNREACH')).mockResolvedValueOnce(undefined)
    const { updater } = makeUpdater(check)
    const { schedule, runInitialCheck, runRepeatedCheck } = makeSchedule()

    startAutomaticUpdates(updater, 'install', vi.fn(), schedule)
    runInitialCheck()
    await Promise.resolve()
    await Promise.resolve()
    runRepeatedCheck()

    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not start a second request while a check is pending', () => {
    const { updater } = makeUpdater(vi.fn(() => new Promise(() => undefined)))
    const { schedule, runInitialCheck, runRepeatedCheck } = makeSchedule()

    startAutomaticUpdates(updater, 'install', vi.fn(), schedule)
    runInitialCheck()
    runRepeatedCheck()

    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })
})

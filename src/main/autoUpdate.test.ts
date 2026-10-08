import { describe, expect, it, vi } from 'vitest'
import {
  startAutomaticUpdates,
  type AutoUpdateClient,
  type AutoUpdateSchedule
} from './autoUpdate'

const makeUpdater = (checkForUpdatesAndNotify = vi.fn().mockResolvedValue(undefined)): AutoUpdateClient => ({
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: true,
  checkForUpdatesAndNotify,
  on: vi.fn(),
  removeListener: vi.fn()
})

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
    const updater = makeUpdater()
    const { schedule } = makeSchedule()

    startAutomaticUpdates(updater, 'disabled', schedule)

    expect(schedule.setTimeout).not.toHaveBeenCalled()
    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
  })

  it('starts only after a delay and enables background download plus install on quit', () => {
    const updater = makeUpdater()
    const { schedule, runInitialCheck } = makeSchedule()

    startAutomaticUpdates(updater, 'install', schedule)

    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.allowPrerelease).toBe(false)
    runInitialCheck()
    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledOnce()
  })

  it('swallows offline failures and allows a later retry', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce(new Error('ENETUNREACH'))
      .mockResolvedValueOnce(undefined)
    const updater = makeUpdater(check)
    const { schedule, runInitialCheck, runRepeatedCheck } = makeSchedule()

    startAutomaticUpdates(updater, 'install', schedule)
    runInitialCheck()
    await Promise.resolve()
    await Promise.resolve()
    runRepeatedCheck()

    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not start a second request while a check is still pending', () => {
    const check = vi.fn(() => new Promise(() => undefined))
    const updater = makeUpdater(check)
    const { schedule, runInitialCheck, runRepeatedCheck } = makeSchedule()

    startAutomaticUpdates(updater, 'install', schedule)
    runInitialCheck()
    runRepeatedCheck()

    expect(check).toHaveBeenCalledOnce()
  })
})

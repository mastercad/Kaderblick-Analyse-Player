import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isNewerVersion, startPortableAutomaticUpdates, validatePortableUpdateManifest, type PortableUpdateSchedule } from './portableUpdate'

describe('portable updates', () => {
  it('compares stable release versions without allowing downgrades', () => {
    expect(isNewerVersion('2.8.0', '2.7.0')).toBe(true)
    expect(isNewerVersion('2.7.0', '2.7.0')).toBe(false)
    expect(isNewerVersion('2.6.9', '2.7.0')).toBe(false)
    expect(isNewerVersion('invalid', '2.7.0')).toBe(false)
  })

  it('rejects unsafe filenames and invalid checksums', () => {
    expect(validatePortableUpdateManifest({ version: '2.8.0', file: '../player.exe', sha512: 'a'.repeat(128) })).toBeNull()
    expect(validatePortableUpdateManifest({ version: '2.8.0', file: 'kaderblick-analyse-player-portable-2.8.0-x64.exe', sha512: 'invalid' })).toBeNull()
  })

  it('does not download when the manifest reports the current version', async () => {
    let runCheck: (() => void) | undefined
    const schedule: PortableUpdateSchedule = {
      setTimeout: vi.fn((callback) => {
        runCheck = callback
        return { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>
      }),
      setInterval: vi.fn(() => ({ unref: vi.fn() }) as unknown as ReturnType<typeof setInterval>),
      clearTimeout: vi.fn(),
      clearInterval: vi.fn()
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: '2.7.0',
      file: 'kaderblick-analyse-player-portable-2.7.0-x64.exe',
      sha512: 'a'.repeat(128)
    })))

    startPortableAutomaticUpdates({
      currentVersion: '2.7.0', executablePath: 'C:\\Player.exe', temporaryDirectory: 'C:\\Temp',
      fetch: fetchMock, publishStatus: vi.fn(), schedule
    })
    runCheck?.()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  })

  it('keeps offline failures silent and leaves the player usable', async () => {
    let runCheck: (() => void) | undefined
    const schedule: PortableUpdateSchedule = {
      setTimeout: vi.fn((callback) => {
        runCheck = callback
        return { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>
      }),
      setInterval: vi.fn(() => ({ unref: vi.fn() }) as unknown as ReturnType<typeof setInterval>),
      clearTimeout: vi.fn(),
      clearInterval: vi.fn()
    }
    const fetchMock = vi.fn().mockRejectedValue(new Error('ENETUNREACH'))
    const publishStatus = vi.fn()

    startPortableAutomaticUpdates({
      currentVersion: '2.7.0', executablePath: 'C:\\Player.exe', temporaryDirectory: 'C:\\Temp',
      fetch: fetchMock, publishStatus, schedule
    })
    runCheck?.()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    expect(publishStatus).not.toHaveBeenCalled()
  })

  it('downloads a newer portable build, verifies it and announces readiness', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'kaderblick-portable-update-'))
    const payload = new TextEncoder().encode('portable executable')
    const file = 'kaderblick-analyse-player-portable-2.8.0-x64.exe'
    const sha512 = createHash('sha512').update(payload).digest('hex')
    let runCheck: (() => void) | undefined
    const schedule: PortableUpdateSchedule = {
      setTimeout: vi.fn((callback) => {
        runCheck = callback
        return { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>
      }),
      setInterval: vi.fn(() => ({ unref: vi.fn() }) as unknown as ReturnType<typeof setInterval>),
      clearTimeout: vi.fn(),
      clearInterval: vi.fn()
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '2.8.0', file, sha512 })))
      .mockResolvedValueOnce(new Response(payload))
    const publishStatus = vi.fn()

    const updater = startPortableAutomaticUpdates({
      currentVersion: '2.7.0', executablePath: 'C:\\Player.exe', temporaryDirectory,
      fetch: fetchMock, publishStatus, schedule
    })
    runCheck?.()
    await vi.waitFor(() => expect(publishStatus).toHaveBeenCalledWith({ phase: 'available', version: '2.8.0' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    await updater.download()
    expect(publishStatus).toHaveBeenCalledWith({ phase: 'downloaded', version: '2.8.0' })

    expect(await readFile(join(temporaryDirectory, file), 'utf8')).toBe('portable executable')
    expect(await readFile(join(temporaryDirectory, 'kaderblick-portable-update.ps1'), 'utf8'))
      .toContain('Wait-Process')
    updater.dispose()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })
})

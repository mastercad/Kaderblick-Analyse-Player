import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MANIFEST_URL = 'https://github.com/mastercad/Kaderblick-Analyse-Player/releases/latest/download/portable-update.json'
const DEFAULT_INITIAL_DELAY_MS = 15_000
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface PortableUpdateManifest {
  version: string
  file: string
  sha512: string
}

export interface PortableUpdateSchedule {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  setInterval: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
  clearInterval: (timer: ReturnType<typeof setInterval>) => void
}

interface PortableUpdateOptions {
  currentVersion: string
  executablePath: string
  temporaryDirectory: string
  fetch: typeof globalThis.fetch
  notifyReady: (version: string) => void
  schedule?: PortableUpdateSchedule
  initialDelayMs?: number
  checkIntervalMs?: number
}

const defaultSchedule: PortableUpdateSchedule = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
  clearInterval: (timer) => clearInterval(timer)
}

const parseVersion = (version: string): number[] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  return match ? match.slice(1).map(Number) : null
}

export const isNewerVersion = (candidate: string, current: string): boolean => {
  const candidateParts = parseVersion(candidate)
  const currentParts = parseVersion(current)
  if (!candidateParts || !currentParts) return false
  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] !== currentParts[index]) return candidateParts[index] > currentParts[index]
  }
  return false
}

export const validatePortableUpdateManifest = (value: unknown): PortableUpdateManifest | null => {
  if (!value || typeof value !== 'object') return null
  const manifest = value as Partial<PortableUpdateManifest>
  if (typeof manifest.version !== 'string' || typeof manifest.file !== 'string' || typeof manifest.sha512 !== 'string') return null
  if (basename(manifest.file) !== manifest.file || !/^kaderblick-analyse-player-portable-.+\.exe$/i.test(manifest.file)) return null
  if (!/^[a-f\d]{128}$/i.test(manifest.sha512)) return null
  return manifest as PortableUpdateManifest
}

const downloadVerifiedUpdate = async (
  fetchImplementation: typeof globalThis.fetch,
  manifest: PortableUpdateManifest,
  temporaryDirectory: string
): Promise<string> => {
  const response = await fetchImplementation(
    `https://github.com/mastercad/Kaderblick-Analyse-Player/releases/latest/download/${encodeURIComponent(manifest.file)}`,
    { cache: 'no-store' }
  )
  if (!response.ok || !response.body) throw new Error(`Portable update download failed: ${response.status}`)

  const partialPath = join(temporaryDirectory, `${manifest.file}.partial`)
  const readyPath = join(temporaryDirectory, manifest.file)
  const hash = createHash('sha512')
  const hashingStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    }
  })

  await rm(partialPath, { force: true })
  await pipeline(Readable.fromWeb(response.body), hashingStream, createWriteStream(partialPath))
  if (hash.digest('hex').toLowerCase() !== manifest.sha512.toLowerCase()) {
    await rm(partialPath, { force: true })
    throw new Error('Portable update checksum mismatch')
  }
  await rm(readyPath, { force: true })
  await rename(partialPath, readyPath)
  return readyPath
}

export const startPortableAutomaticUpdates = (options: PortableUpdateOptions): {
  dispose: () => void
  installOnExit: () => void
} => {
  const schedule = options.schedule ?? defaultSchedule
  let checking = false
  let readyUpdatePath: string | null = null
  const scriptPath = join(options.temporaryDirectory, 'kaderblick-portable-update.ps1')
  const replacementScript = [
    'param([int]$RunningProcessId, [string]$Source, [string]$Target)',
    'Wait-Process -Id $RunningProcessId -ErrorAction SilentlyContinue',
    '$NewFile = "$Target.new"',
    '$Backup = "$Target.old"',
    'try {',
    '  Copy-Item -LiteralPath $Source -Destination $NewFile -Force',
    '  Copy-Item -LiteralPath $Target -Destination $Backup -Force',
    '  Move-Item -LiteralPath $NewFile -Destination $Target -Force',
    '  Start-Process -FilePath $Target',
    '  Remove-Item -LiteralPath $Backup -Force -ErrorAction SilentlyContinue',
    '} catch {',
    '  if (Test-Path -LiteralPath $Backup) { Copy-Item -LiteralPath $Backup -Destination $Target -Force }',
    '}',
    'Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue'
  ].join('\r\n')

  const check = async (): Promise<void> => {
    if (checking || readyUpdatePath) return
    checking = true
    try {
      const response = await options.fetch(MANIFEST_URL, { cache: 'no-store' })
      if (!response.ok) return
      const manifest = validatePortableUpdateManifest(await response.json())
      if (!manifest || !isNewerVersion(manifest.version, options.currentVersion)) return
      const downloadedUpdatePath = await downloadVerifiedUpdate(options.fetch, manifest, options.temporaryDirectory)
      await writeFile(scriptPath, replacementScript, 'utf8')
      readyUpdatePath = downloadedUpdatePath
      options.notifyReady(manifest.version)
    } catch {
      // Offline use is expected. Failed checks stay silent and are retried later.
    } finally {
      checking = false
    }
  }

  const initialTimer = schedule.setTimeout(() => { void check() }, options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS)
  const repeatTimer = schedule.setInterval(() => { void check() }, options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS)
  initialTimer.unref?.()
  repeatTimer.unref?.()

  return {
    dispose: () => {
      schedule.clearTimeout(initialTimer)
      schedule.clearInterval(repeatTimer)
    },
    installOnExit: () => {
      if (!readyUpdatePath) return
      spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        String(process.pid), readyUpdatePath, options.executablePath
      ], { detached: true, windowsHide: true, stdio: 'ignore' }).unref()
      readyUpdatePath = null
    }
  }
}

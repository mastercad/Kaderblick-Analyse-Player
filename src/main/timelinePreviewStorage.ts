import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { createFile, type MP4BoxBuffer, type Movie } from 'mp4box'
import type { TimelinePreviewCacheState, TimelinePreviewFileInfo, TimelinePreviewFrame, TimelinePreviewSheet } from '../common/types'

const CACHE_VERSION = 1
const CACHE_MAX_BYTES = 512 * 1024 * 1024
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const memorySheets = new Map<string, string>()
const MEMORY_SHEET_LIMIT = 16
const manifestCache = new Map<string, PreviewManifest>()
const manifestQueues = new Map<string, Promise<void>>()
const touchedDirectories = new Set<string>()
let bytesStoredSinceCleanup = 0

interface StoredSheet {
  fileName: string
  phase: 'coarse' | 'fine'
  targets: number[]
  columns: number
  rows: number
}

interface PreviewManifest {
  version: number
  sourcePath: string
  size: number
  mtimeMs: number
  coarseComplete: boolean
  fineComplete: boolean
  lastAccessedAt: number
  sheets: StoredSheet[]
}

const cacheRoot = (): string => path.join(app.getPath('cache'), 'kaderblick-timeline-previews')

const getIdentity = async (sourcePath: string): Promise<{ info: TimelinePreviewFileInfo; directory: string }> => {
  const stats = await fs.stat(sourcePath)
  const info = { size: stats.size, mtimeMs: stats.mtimeMs, extension: path.extname(sourcePath).toLowerCase() }
  const key = createHash('sha1').update(`${CACHE_VERSION}:${sourcePath}:${info.size}:${info.mtimeMs}`).digest('hex')
  return { info, directory: path.join(cacheRoot(), key) }
}

const readManifest = async (directory: string): Promise<PreviewManifest | null> => {
  const cached = manifestCache.get(directory)
  if (cached) return cached
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as PreviewManifest
    if (parsed.version !== CACHE_VERSION) return null
    manifestCache.set(directory, parsed)
    return parsed
  } catch {
    return null
  }
}

const writeManifest = async (directory: string, manifest: PreviewManifest): Promise<void> => {
  const temporaryPath = path.join(directory, `manifest.${randomUUID()}.tmp`)
  await fs.writeFile(temporaryPath, JSON.stringify(manifest), 'utf8')
  await fs.rename(temporaryPath, path.join(directory, 'manifest.json'))
  manifestCache.set(directory, manifest)
}

const serializeManifestUpdate = async <T>(directory: string, update: () => Promise<T>): Promise<T> => {
  const previous = manifestQueues.get(directory) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.catch(() => undefined).then(() => current)
  manifestQueues.set(directory, queued)
  await previous.catch(() => undefined)
  try {
    return await update()
  } finally {
    release()
    if (manifestQueues.get(directory) === queued) manifestQueues.delete(directory)
  }
}

const touchOnce = async (directory: string): Promise<void> => {
  if (touchedDirectories.has(directory)) return
  touchedDirectories.add(directory)
  await fs.utimes(directory, new Date(), new Date()).catch(() => undefined)
}

export const getTimelinePreviewFileInfo = async (sourcePath: string): Promise<TimelinePreviewFileInfo> => {
  return (await getIdentity(sourcePath)).info
}

export const readTimelinePreviewRange = async (sourcePath: string, offset: number, length: number): Promise<Uint8Array> => {
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLength = Math.max(0, Math.min(4 * 1024 * 1024, Math.floor(length)))
  const handle = await fs.open(sourcePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(safeLength)
    const { bytesRead } = await handle.read(buffer, 0, safeLength, safeOffset)
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead))
  } finally {
    await handle.close()
  }
}

export const getIndexedKeyframeTimes = async (sourcePath: string): Promise<number[]> => {
  const { info } = await getIdentity(sourcePath)
  if (!['.mp4', '.mov', '.m4v'].includes(info.extension)) return []
  const file = createFile(false)
  let movie: Movie | null = null
  file.onReady = (value) => { movie = value }
  let offset = 0
  const visited = new Set<number>()
  while (!movie && offset < info.size) {
    if (visited.has(offset)) return []
    visited.add(offset)
    const bytes = await readTimelinePreviewRange(sourcePath, offset, Math.min(1024 * 1024, info.size - offset))
    if (bytes.length === 0) return []
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as MP4BoxBuffer
    buffer.fileStart = offset
    const nextOffset = file.appendBuffer(buffer)
    offset = typeof nextOffset === 'number' && nextOffset > offset ? nextOffset : offset + bytes.length
  }
  const readyMovie = movie as Movie | null
  const track = readyMovie?.videoTracks[0]
  if (!track) return []
  return file.getTrackSamplesInfo(track.id)
    .filter((sample) => sample.is_sync)
    .map((sample) => sample.cts / sample.timescale)
}

export const getTimelinePreviewCacheState = async (sourcePath: string): Promise<TimelinePreviewCacheState> => {
  const { directory } = await getIdentity(sourcePath)
  const manifest = await readManifest(directory)
  if (!manifest) return { coarseComplete: false, fineComplete: false, cachedTargets: [] }
  await touchOnce(directory)
  return {
    coarseComplete: manifest.coarseComplete,
    fineComplete: manifest.fineComplete,
    cachedTargets: [...new Set(manifest.sheets.flatMap((sheet) => sheet.targets))]
  }
}

export const storeTimelinePreviewSheet = async (sourcePath: string, sheet: TimelinePreviewSheet): Promise<void> => {
  const { info, directory } = await getIdentity(sourcePath)
  await serializeManifestUpdate(directory, async () => {
    await fs.mkdir(directory, { recursive: true })
    const manifest = await readManifest(directory) ?? {
      version: CACHE_VERSION,
      sourcePath,
      size: info.size,
      mtimeMs: info.mtimeMs,
      coarseComplete: false,
      fineComplete: false,
      lastAccessedAt: Date.now(),
      sheets: []
    }
    const digest = createHash('sha1').update(`${sheet.phase}:${sheet.targets.join(',')}`).digest('hex').slice(0, 16)
    const fileName = `${sheet.phase}-${digest}.webp`
    const temporaryPath = path.join(directory, `${fileName}.${randomUUID()}.tmp`)
    await fs.writeFile(temporaryPath, sheet.imageBytes)
    await fs.rename(temporaryPath, path.join(directory, fileName))
    manifest.sheets = manifest.sheets.filter((entry) => entry.fileName !== fileName)
    manifest.sheets.push({ fileName, phase: sheet.phase, targets: sheet.targets, columns: sheet.columns, rows: sheet.rows })
    manifest.lastAccessedAt = Date.now()
    await writeManifest(directory, manifest)
  })
  bytesStoredSinceCleanup += sheet.imageBytes.byteLength
  if (bytesStoredSinceCleanup >= 16 * 1024 * 1024) {
    bytesStoredSinceCleanup = 0
    void cleanupTimelinePreviewCache()
  }
}

export const markTimelinePreviewPhaseComplete = async (sourcePath: string, phase: 'coarse' | 'fine'): Promise<void> => {
  const { info, directory } = await getIdentity(sourcePath)
  await serializeManifestUpdate(directory, async () => {
    await fs.mkdir(directory, { recursive: true })
    const manifest = await readManifest(directory) ?? {
      version: CACHE_VERSION,
      sourcePath,
      size: info.size,
      mtimeMs: info.mtimeMs,
      coarseComplete: false,
      fineComplete: false,
      lastAccessedAt: Date.now(),
      sheets: []
    }
    if (phase === 'coarse') manifest.coarseComplete = true
    else manifest.fineComplete = true
    manifest.lastAccessedAt = Date.now()
    await writeManifest(directory, manifest)
  })
}

export const getTimelinePreviewFrame = async (sourcePath: string, seconds: number): Promise<TimelinePreviewFrame | null> => {
  const { directory } = await getIdentity(sourcePath)
  const manifest = await readManifest(directory)
  if (!manifest || manifest.sheets.length === 0) return null
  let selected: { sheet: StoredSheet; target: number; index: number } | null = null
  let selectedDistance = Number.POSITIVE_INFINITY
  for (const sheet of manifest.sheets) {
    for (let index = 0; index < sheet.targets.length; index += 1) {
      const target = sheet.targets[index]
      const distance = Math.abs(target - seconds)
      if (distance < selectedDistance || (distance === selectedDistance && sheet.phase === 'fine' && selected?.sheet.phase !== 'fine')) {
        selected = { sheet, target, index }
        selectedDistance = distance
      }
    }
  }
  if (!selected) return null
  const maximumDistance = selected.sheet.phase === 'fine' ? 1.5 : 6
  if (selectedDistance > maximumDistance) return null
  await touchOnce(directory)
  const imagePath = path.join(directory, selected.sheet.fileName)
  let imageUrl = memorySheets.get(imagePath)
  if (!imageUrl) {
    const bytes = await fs.readFile(imagePath)
    imageUrl = `data:image/webp;base64,${bytes.toString('base64')}`
    memorySheets.set(imagePath, imageUrl)
    while (memorySheets.size > MEMORY_SHEET_LIMIT) {
      const oldest = memorySheets.keys().next().value
      if (!oldest) break
      memorySheets.delete(oldest)
    }
  } else {
    memorySheets.delete(imagePath)
    memorySheets.set(imagePath, imageUrl)
  }
  return {
    imageUrl,
    column: selected.index % selected.sheet.columns,
    row: Math.floor(selected.index / selected.sheet.columns),
    columns: selected.sheet.columns,
    rows: selected.sheet.rows
  }
}

const directorySize = async (directory: string): Promise<number> => {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const sizes = await Promise.all(entries.map(async (entry) => {
      const target = path.join(directory, entry.name)
      return entry.isDirectory() ? directorySize(target) : (await fs.stat(target)).size
    }))
    return sizes.reduce((total, size) => total + size, 0)
  } catch {
    return 0
  }
}

export const cleanupTimelinePreviewCache = async (): Promise<void> => {
  await fs.mkdir(cacheRoot(), { recursive: true })
  const entries = await fs.readdir(cacheRoot(), { withFileTypes: true })
  const directories: Array<{ path: string; modifiedAt: number; size: number }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const directory = path.join(cacheRoot(), entry.name)
    try {
      for (const child of await fs.readdir(directory)) {
        if (!child.endsWith('.tmp')) continue
        const temporaryPath = path.join(directory, child)
        const temporaryStats = await fs.stat(temporaryPath).catch(() => null)
        if (temporaryStats && Date.now() - temporaryStats.mtimeMs > 5 * 60 * 1000) await fs.rm(temporaryPath, { force: true })
      }
      const stats = await fs.stat(directory)
      if (Date.now() - stats.mtimeMs > CACHE_MAX_AGE_MS) {
        await fs.rm(directory, { recursive: true, force: true })
        manifestCache.delete(directory)
        touchedDirectories.delete(directory)
        continue
      }
      directories.push({ path: directory, modifiedAt: stats.mtimeMs, size: await directorySize(directory) })
    } catch { /* cleanup is best effort */ }
  }
  let total = directories.reduce((sum, entry) => sum + entry.size, 0)
  for (const entry of directories.sort((left, right) => left.modifiedAt - right.modifiedAt)) {
    if (total <= CACHE_MAX_BYTES) break
    await fs.rm(entry.path, { recursive: true, force: true })
    manifestCache.delete(entry.path)
    touchedDirectories.delete(entry.path)
    total -= entry.size
  }
}

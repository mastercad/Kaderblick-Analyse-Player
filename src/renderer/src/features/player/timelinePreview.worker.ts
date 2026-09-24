/// <reference lib="webworker" />

import { createFile, type MP4BoxBuffer, type Movie, type Sample, type VisualSampleEntry } from 'mp4box'

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope
const METADATA_CHUNK_SIZE = 1024 * 1024
const COLUMNS = 5
const ROWS = 5
const CELLS_PER_SHEET = COLUMNS * ROWS
const WIDTH = 192
const HEIGHT = 108

interface InitMessage {
  type: 'init'
  sourcePath: string
  fileSize: number
  cachedTargets: number[]
  coarseComplete: boolean
  fineComplete: boolean
}

interface RangeResponseMessage {
  type: 'range-response'
  requestId: number
  bytes?: Uint8Array
  error?: string
}

interface SheetStoredMessage {
  type: 'sheet-stored'
  sheetId: number
  error?: string
}

interface PreviewRequestMessage {
  type: 'preview-request'
  seconds: number
}

type IncomingMessage = InitMessage | RangeResponseMessage | SheetStoredMessage | PreviewRequestMessage | { type: 'pause'; paused: boolean } | { type: 'stop' }

let nextRequestId = 1
let nextSheetId = 1
const pendingReads = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>()
const pendingSheets = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
let stopped = false
let paused = false
let urgentTarget: number | null = null
let resume: (() => void) | null = null

const requestRange = (offset: number, length: number): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const requestId = nextRequestId++
  pendingReads.set(requestId, { resolve, reject })
  context.postMessage({ type: 'range-request', requestId, offset, length })
})

const waitWhilePaused = async (): Promise<void> => {
  if (!paused) return
  await new Promise<void>((resolve) => { resume = resolve })
}

const storeSheet = (
  phase: 'coarse' | 'fine',
  targets: number[],
  bytes: Uint8Array
): Promise<void> => new Promise((resolve, reject) => {
  const sheetId = nextSheetId++
  pendingSheets.set(sheetId, { resolve, reject })
  context.postMessage({ type: 'sheet', sheetId, phase, targets, columns: COLUMNS, rows: ROWS, bytes }, [bytes.buffer])
})

const buildAvcDescription = (entry: VisualSampleEntry): Uint8Array | null => {
  const config = entry.avcC
  if (!config) return null
  const spsLength = config.SPS.reduce((total, nalu) => total + 2 + nalu.data.length, 0)
  const ppsLength = config.PPS.reduce((total, nalu) => total + 2 + nalu.data.length, 0)
  const bytes = new Uint8Array(7 + spsLength + ppsLength + config.ext.length)
  let offset = 0
  bytes[offset++] = config.configurationVersion
  bytes[offset++] = config.AVCProfileIndication
  bytes[offset++] = config.profile_compatibility
  bytes[offset++] = config.AVCLevelIndication
  bytes[offset++] = 0xfc | config.lengthSizeMinusOne
  bytes[offset++] = 0xe0 | config.SPS.length
  for (const nalu of config.SPS) {
    bytes[offset++] = nalu.data.length >> 8
    bytes[offset++] = nalu.data.length & 0xff
    bytes.set(nalu.data, offset)
    offset += nalu.data.length
  }
  bytes[offset++] = config.PPS.length
  for (const nalu of config.PPS) {
    bytes[offset++] = nalu.data.length >> 8
    bytes[offset++] = nalu.data.length & 0xff
    bytes.set(nalu.data, offset)
    offset += nalu.data.length
  }
  bytes.set(config.ext, offset)
  return bytes
}

const parseIndex = async (fileSize: number): Promise<{ movie: Movie; samples: Sample[] }> => {
  const file = createFile(false)
  let readyMovie: Movie | null = null
  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  file.onReady = (movie) => { readyMovie = movie; resolveReady() }
  file.onError = (_module, message) => rejectReady(new Error(message))

  let offset = 0
  const visited = new Set<number>()
  while (!readyMovie && offset < fileSize && !stopped) {
    if (visited.has(offset)) throw new Error('Der MP4-Index konnte nicht vollständig gelesen werden.')
    visited.add(offset)
    const bytes = await requestRange(offset, Math.min(METADATA_CHUNK_SIZE, fileSize - offset))
    if (bytes.length === 0) break
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as MP4BoxBuffer
    buffer.fileStart = offset
    const nextOffset = file.appendBuffer(buffer)
    offset = typeof nextOffset === 'number' && nextOffset > offset ? nextOffset : offset + bytes.length
  }
  if (!readyMovie) await Promise.race([ready, new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Kein lesbarer MP4-Index gefunden.')), 1000))])
  const movie = readyMovie as Movie | null
  if (!movie) throw new Error('Kein lesbarer MP4-Index gefunden.')
  const videoTrack = movie.videoTracks[0]
  if (!videoTrack) throw new Error('Die Datei enthält keine Videospur.')
  return { movie, samples: file.getTrackSamplesInfo(videoTrack.id).filter((sample) => sample.is_sync) }
}

const nearestSample = (samples: Sample[], seconds: number): Sample => {
  let low = 0
  let high = samples.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (samples[middle].cts / samples[middle].timescale <= seconds) low = middle
    else high = middle - 1
  }
  return samples[low]
}

const drawContained = (canvas: OffscreenCanvas, frame: VideoFrame, cellIndex: number): void => {
  const graphics = canvas.getContext('2d')
  if (!graphics) throw new Error('Canvas-Kontext nicht verfügbar.')
  const column = cellIndex % COLUMNS
  const row = Math.floor(cellIndex / COLUMNS)
  const ratio = Math.min(WIDTH / frame.displayWidth, HEIGHT / frame.displayHeight)
  const width = frame.displayWidth * ratio
  const height = frame.displayHeight * ratio
  const x = column * WIDTH + (WIDTH - width) / 2
  const y = row * HEIGHT + (HEIGHT - height) / 2
  graphics.fillStyle = '#000'
  graphics.fillRect(column * WIDTH, row * HEIGHT, WIDTH, HEIGHT)
  graphics.drawImage(frame, x, y, width, height)
}

const run = async (message: InitMessage): Promise<void> => {
  const { movie, samples } = await parseIndex(message.fileSize)
  if (stopped) return
  const track = movie.videoTracks[0]
  if (!track || samples.length === 0 || !track.codec.startsWith('avc')) throw new Error('Für diesen Container ist keine indexbasierte H.264-Vorschau verfügbar.')
  const entry = samples[0].description as VisualSampleEntry
  const description = buildAvcDescription(entry)
  if (!description) throw new Error('Die H.264-Decoderkonfiguration fehlt.')
  if (!('VideoDecoder' in context)) throw new Error('WebCodecs ist auf diesem System nicht verfügbar.')
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.video?.width,
    codedHeight: track.video?.height,
    description,
    hardwareAcceleration: 'no-preference',
    optimizeForLatency: true
  }
  const support = await VideoDecoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`Der Videocodec ${track.codec} wird von Chromium nicht unterstützt.`)

  let resolveFrame: ((frame: VideoFrame) => void) | null = null
  let rejectFrame: ((error: Error) => void) | null = null
  let decoder: VideoDecoder | null = null

  const closeDecoder = (): void => {
    if (!decoder) return
    if (decoder.state !== 'closed') decoder.close()
    decoder = null
  }

  const getDecoder = (): VideoDecoder => {
    if (decoder && decoder.state !== 'closed') return decoder
    decoder = new VideoDecoder({
      output: (frame) => { resolveFrame?.(frame); resolveFrame = null; rejectFrame = null },
      error: (error) => { rejectFrame?.(error); resolveFrame = null; rejectFrame = null }
    })
    decoder.configure(config)
    return decoder
  }

  const waitForPlaybackIdle = async (): Promise<void> => {
    if (paused) closeDecoder()
    await waitWhilePaused()
  }

  const decodeSample = async (sample: Sample): Promise<VideoFrame> => {
    const bytes = await requestRange(sample.offset, sample.size)
    const framePromise = new Promise<VideoFrame>((resolve, reject) => { resolveFrame = resolve; rejectFrame = reject })
    const activeDecoder = getDecoder()
    activeDecoder.decode(new EncodedVideoChunk({
      type: 'key',
      timestamp: Math.round(sample.cts / sample.timescale * 1_000_000),
      duration: Math.round(sample.duration / sample.timescale * 1_000_000),
      data: bytes
    }))
    await activeDecoder.flush()
    return framePromise
  }

  const durationSeconds = track.duration / track.timescale
  const cached = new Set(message.cachedTargets.map((target) => Math.round(target)))
  const phases: Array<{ phase: 'coarse' | 'fine'; interval: number; skip: boolean }> = [
    { phase: 'coarse', interval: 10, skip: message.coarseComplete },
    { phase: 'fine', interval: 1, skip: message.fineComplete }
  ]

  for (const phase of phases) {
    if (phase.skip || stopped) continue
    const targets: number[] = []
    for (let target = 0; target <= durationSeconds; target += phase.interval) {
      if (!cached.has(Math.round(target))) targets.push(target)
    }
    let sheetCanvas = new OffscreenCanvas(WIDTH * COLUMNS, HEIGHT * ROWS)
    let sheetTargets: number[] = []
    for (let index = 0; index < targets.length && !stopped; index += 1) {
      await waitForPlaybackIdle()
      if (stopped) break
      if (urgentTarget !== null) {
        const target = urgentTarget
        urgentTarget = null
        const urgentFrame = await decodeSample(nearestSample(samples, target))
        const urgentCanvas = new OffscreenCanvas(WIDTH, HEIGHT)
        drawContained(urgentCanvas, urgentFrame, 0)
        urgentFrame.close()
        const blob = await urgentCanvas.convertToBlob({ type: 'image/webp', quality: 0.72 })
        const bytes = new Uint8Array(await blob.arrayBuffer())
        context.postMessage({ type: 'urgent-frame', target, bytes }, [bytes.buffer])
      }

      const target = targets[index]
      const frame = await decodeSample(nearestSample(samples, target))
      drawContained(sheetCanvas, frame, sheetTargets.length)
      frame.close()
      sheetTargets.push(target)
      if (sheetTargets.length === CELLS_PER_SHEET || index === targets.length - 1) {
        const blob = await sheetCanvas.convertToBlob({ type: 'image/webp', quality: 0.72 })
        const bytes = new Uint8Array(await blob.arrayBuffer())
        await storeSheet(phase.phase, sheetTargets, bytes)
        sheetCanvas = new OffscreenCanvas(WIDTH * COLUMNS, HEIGHT * ROWS)
        sheetTargets = []
      }
      context.postMessage({ type: 'progress', phase: phase.phase, percent: targets.length === 0 ? 100 : (index + 1) / targets.length * 100 })
    }
    if (!stopped) context.postMessage({ type: 'phase-complete', phase: phase.phase })
  }
  closeDecoder()
  if (!stopped) context.postMessage({ type: 'complete' })
}

context.onmessage = (event: MessageEvent<IncomingMessage>): void => {
  const message = event.data
  if (message.type === 'range-response') {
    const pending = pendingReads.get(message.requestId)
    if (!pending) return
    pendingReads.delete(message.requestId)
    if (message.error) pending.reject(new Error(message.error))
    else pending.resolve(message.bytes ?? new Uint8Array())
    return
  }
  if (message.type === 'sheet-stored') {
    const pending = pendingSheets.get(message.sheetId)
    if (!pending) return
    pendingSheets.delete(message.sheetId)
    if (message.error) pending.reject(new Error(message.error))
    else pending.resolve()
    return
  }
  if (message.type === 'preview-request') {
    urgentTarget = message.seconds
    return
  }
  if (message.type === 'pause') {
    paused = message.paused
    if (!paused) { resume?.(); resume = null }
    return
  }
  if (message.type === 'stop') {
    stopped = true
    paused = false
    resume?.()
    resume = null
    for (const pending of pendingReads.values()) pending.reject(new Error('Vorschau wurde beendet.'))
    pendingReads.clear()
    for (const pending of pendingSheets.values()) pending.reject(new Error('Vorschau wurde beendet.'))
    pendingSheets.clear()
    return
  }
  void run(message).catch((error: unknown) => {
    if (!stopped) context.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  })
}

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { VideoFileDescriptor, VideoPreparationProgress } from '../common/types'
import { buildStreamUrl } from '../common/streaming'
import { cacheVideoMetadata, getVideoMetadata } from './streamingProtocol'

interface PlaybackProxyMetadata {
  playbackLabel?: string
  playbackHint?: string
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
}

interface ProbeResult {
  format?: {
    duration?: string
    format_name?: string
  }
  streams?: ProbeStream[]
}

interface VideoProbe {
  codecName?: string
  formatName?: string
  durationSeconds: number
}

interface VideoPlaybackPreparationOptions {
  onProgress?: (progress: VideoPreparationProgress) => void
}

interface PlaybackProxyResult {
  outputPath: string
  metadata: PlaybackProxyMetadata
}

const packagedNodeModulesDirectory = (): string => {
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
}

const resolveExecutablePath = (binaryPath: string | null | undefined): string => {
  if (!binaryPath) {
    throw new Error('Kein gebuendeltes FFmpeg-Binary gefunden.')
  }

  return app.isPackaged ? binaryPath.replace('app.asar', 'app.asar.unpacked') : binaryPath
}

export const ffmpegExecutable = (): string => {
  if (!app.isPackaged) {
    return resolveExecutablePath(ffmpegPath)
  }

  return path.join(
    packagedNodeModulesDirectory(),
    'ffmpeg-static',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  )
}

const ffprobeExecutable = (): string => {
  if (!app.isPackaged) {
    return resolveExecutablePath(ffprobeStatic.path)
  }

  return path.join(
    packagedNodeModulesDirectory(),
    'ffprobe-static',
    'bin',
    process.platform,
    process.arch,
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  )
}

const getPlaybackCacheDirectory = (): string => {
  return path.join(app.getPath('temp'), 'kaderblick-video-proxies')
}

const buildPlaybackMetadataPath = (proxyPath: string): string => {
  return `${proxyPath}.json`
}

const buildPlaybackProxyPath = async (sourcePath: string): Promise<string> => {
  const stats = await fs.stat(sourcePath)
  const cacheKey = createHash('sha1')
    .update(`${sourcePath}:${stats.size}:${stats.mtimeMs}`)
    .digest('hex')

  return path.join(getPlaybackCacheDirectory(), `${cacheKey}.mp4`)
}

const readPlaybackProxyMetadata = async (proxyPath: string): Promise<PlaybackProxyMetadata | undefined> => {
  try {
    const rawMetadata = await fs.readFile(buildPlaybackMetadataPath(proxyPath), 'utf8')
    const parsedMetadata = JSON.parse(rawMetadata) as PlaybackProxyMetadata

    if (parsedMetadata.playbackHint?.includes('stabilen Wiedergabemodus')) {
      return {
        playbackLabel: undefined,
        playbackHint: undefined
      }
    }

    return parsedMetadata
  } catch {
    return undefined
  }
}

const writePlaybackProxyMetadata = async (proxyPath: string, metadata: PlaybackProxyMetadata): Promise<void> => {
  await fs.writeFile(buildPlaybackMetadataPath(proxyPath), JSON.stringify(metadata), 'utf8')
}

const buildOptimizedPlaybackMetadata = (playbackHint?: string): PlaybackProxyMetadata => {
  return {
    playbackLabel: undefined,
    playbackHint
  }
}

const runProcess = (command: string, args: string[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      reject(new Error(stderr.trim() || `${path.basename(command)} wurde mit Code ${code} beendet.`))
    })
  })
}

const inspectVideoStream = async (sourcePath: string): Promise<VideoProbe> => {
  const output = await runProcess(ffprobeExecutable(), [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,codec_name:format=duration,format_name',
    '-of',
    'json',
    sourcePath
  ])

  const parsed = JSON.parse(output) as ProbeResult
  return {
    codecName: parsed.streams?.find((stream) => stream.codec_type === 'video')?.codec_name,
    formatName: parsed.format?.format_name,
    durationSeconds: Number.parseFloat(parsed.format?.duration ?? '0') || 0
  }
}

const clampProgress = (percent: number): number => {
  return Math.max(0, Math.min(100, Math.round(percent)))
}

const buildFfmpegRemuxArgs = (sourcePath: string, outputPath: string): string[] => {
  return [
    '-y',
    '-i',
    sourcePath,
    '-map',
    '0:v:0',
    '-dn',
    '-sn',
    '-an',
    '-c:v',
    'copy',
    '-movflags',
    '+faststart',
    outputPath
  ]
}

const buildFfmpegProxyArgs = (sourcePath: string, outputPath: string, includeAudio: boolean): string[] => {
  const args = [
    '-y',
    '-i',
    sourcePath,
    '-map',
    '0:v:0',
    '-dn',
    '-sn',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p'
  ]

  if (includeAudio) {
    args.push(
      '-map',
      '0:a:0?',
      '-c:a',
      'aac',
      '-b:a',
      '192k'
    )
  } else {
    args.push('-an')
  }

  args.push(
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath
  )

  return args
}

const remuxPlaybackProxy = async (
  sourcePath: string,
  outputPath: string,
  onProgress?: (progress: VideoPreparationProgress) => void
): Promise<void> => {
  onProgress?.({
    phase: 'transcoding',
    message: 'Video wird vorbereitet...',
    percent: 0
  })

  await runProcess(ffmpegExecutable(), buildFfmpegRemuxArgs(sourcePath, outputPath))

  onProgress?.({
    phase: 'ready',
    message: 'Video ist bereit.',
    percent: 100
  })
}

const transcodePlaybackProxy = async (
  sourcePath: string,
  outputPath: string,
  durationSeconds: number,
  includeAudio: boolean,
  onProgress?: (progress: VideoPreparationProgress) => void
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegExecutable(), buildFfmpegProxyArgs(sourcePath, outputPath, includeAudio), {
      windowsHide: true
    })

    let stdoutBuffer = ''
    let stderr = ''

    const emitPercent = (rawOutTimeMs: string): void => {
      const outTimeMs = Number.parseInt(rawOutTimeMs, 10)

      if (!Number.isFinite(outTimeMs) || durationSeconds <= 0) {
        return
      }

      const percent = clampProgress((outTimeMs / 1000000 / durationSeconds) * 100)
      onProgress?.({
        phase: 'transcoding',
        message: `Video wird vorbereitet... ${percent}%`,
        percent
      })
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const [key, value] = line.split('=')

        if (key === 'out_time_ms' && value) {
          emitPercent(value)
        }

        if (key === 'progress' && value === 'end') {
          onProgress?.({
            phase: 'ready',
            message: 'Video ist bereit.',
            percent: 100
          })
        }
      }
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `ffmpeg wurde mit Code ${code} beendet.`))
    })
  })
}

const ensurePlaybackProxy = async (
  sourcePath: string,
  codecName: string | undefined,
  durationSeconds: number,
  onProgress?: (progress: VideoPreparationProgress) => void
): Promise<PlaybackProxyResult> => {
  const outputPath = await buildPlaybackProxyPath(sourcePath)

  try {
    await fs.access(outputPath)
    const cachedMetadata = await readPlaybackProxyMetadata(outputPath)
    onProgress?.({
      phase: 'ready',
      message: 'Video ist bereit.',
      percent: 100
    })
    return {
      outputPath,
      metadata: cachedMetadata ?? buildOptimizedPlaybackMetadata()
    }
  } catch {
    // Proxy does not exist yet.
  }

  await fs.mkdir(getPlaybackCacheDirectory(), { recursive: true })

  onProgress?.({
    phase: 'transcoding',
    message: 'Video wird vorbereitet...',
    percent: 0
  })

  if (codecName?.toLowerCase() === 'h264') {
    try {
      await remuxPlaybackProxy(sourcePath, outputPath, onProgress)
      const metadata = buildOptimizedPlaybackMetadata()
      await writePlaybackProxyMetadata(outputPath, metadata)
      return { outputPath, metadata }
    } catch (error) {
      await fs.rm(outputPath, { force: true })

      if (error instanceof Error) {
        console.warn(`Schneller H264-Remux fehlgeschlagen, Transcode-Fallback folgt: ${error.message}`)
      }
    }
  }

  try {
    await transcodePlaybackProxy(sourcePath, outputPath, durationSeconds, true, onProgress)
    const metadata = buildOptimizedPlaybackMetadata()
    await writePlaybackProxyMetadata(outputPath, metadata)
    return { outputPath, metadata }
  } catch (error) {
    onProgress?.({
      phase: 'transcoding',
      message: 'Video wird fuer dieses Geraet optimiert...',
      percent: 0
    })

    await fs.rm(outputPath, { force: true })
    await transcodePlaybackProxy(sourcePath, outputPath, durationSeconds, false, onProgress)

    const metadata = buildOptimizedPlaybackMetadata('Die Originaldatei enthaelt fehlerhafte Audiodaten. Das Video wird deshalb ohne Ton stabil wiedergegeben.')
    await writePlaybackProxyMetadata(outputPath, metadata)

    if (error instanceof Error) {
      // Keep the successful video-only fallback but surface a concise note in the logs.
      console.warn(`Audio-Stream wurde beim Proxy-Fallback verworfen: ${error.message}`)
    }

    return { outputPath, metadata }
  }
}

const buildProxyDescriptor = (
  sourcePath: string,
  fileName: string,
  proxyPath: string,
  codecName: string | undefined,
  metadata: PlaybackProxyMetadata
): VideoFileDescriptor => {
  return {
    path: sourcePath,
    fileName,
    fileUrl: pathToFileURL(proxyPath).toString(),
    playbackMode: 'proxy',
    sourceCodec: codecName,
    playbackPath: proxyPath,
    playbackLabel: metadata.playbackLabel,
    playbackHint: metadata.playbackHint
  }
}

export const prepareVideoFileForPlayback = async (
  sourcePath: string,
  options: VideoPlaybackPreparationOptions = {}
): Promise<VideoFileDescriptor> => {
  options.onProgress?.({
    phase: 'analyzing',
    message: 'Videoformat wird analysiert...'
  })

  const videoProbe = await inspectVideoStream(sourcePath)
  const fileName = path.basename(sourcePath)

  options.onProgress?.({
    phase: 'ready',
    message: 'Video ist bereit.',
    percent: 100
  })

  cacheVideoMetadata(sourcePath, { codecName: videoProbe.codecName, durationSeconds: videoProbe.durationSeconds })

  return {
    path: sourcePath,
    fileName,
    fileUrl: pathToFileURL(sourcePath).toString(),
    playbackMode: 'direct',
    sourceCodec: videoProbe.codecName,
    durationSeconds: videoProbe.durationSeconds,
    playbackLabel: undefined,
    playbackHint: undefined
  }
}

export const preparePlaybackFallback = async (
  sourcePath: string,
  options: VideoPlaybackPreparationOptions = {}
): Promise<VideoFileDescriptor> => {
  options.onProgress?.({
    phase: 'transcoding',
    message: 'Video wird vorbereitet...',
    percent: 0
  })

  const videoProbe = await inspectVideoStream(sourcePath)
  const fileName = path.basename(sourcePath)
  const proxyResult = await ensurePlaybackProxy(sourcePath, videoProbe.codecName, videoProbe.durationSeconds, options.onProgress)

  return buildProxyDescriptor(sourcePath, fileName, proxyResult.outputPath, videoProbe.codecName, proxyResult.metadata)
}

export const prepareStreamingPlayback = async (sourcePath: string): Promise<VideoFileDescriptor> => {
  let meta = getVideoMetadata(sourcePath)
  if (!meta) {
    try {
      const probe = await inspectVideoStream(sourcePath)
      meta = { codecName: probe.codecName, durationSeconds: probe.durationSeconds }
      cacheVideoMetadata(sourcePath, meta)
    } catch { /* return descriptor without duration as best-effort fallback */ }
  }

  const fileName = path.basename(sourcePath)
  return {
    path: sourcePath,
    fileName,
    fileUrl: buildStreamUrl(sourcePath),
    playbackMode: 'stream',
    sourceCodec: meta?.codecName,
    durationSeconds: meta?.durationSeconds,
    playbackLabel: undefined,
    playbackHint: undefined
  }
}

// Cache of keyframe timestamps per file path (populated lazily on first request)
const keyframeCache = new Map<string, number[]>()

export const getKeyframeTimes = (sourcePath: string): Promise<number[]> => {
  const cached = keyframeCache.get(sourcePath)
  if (cached) {
    return Promise.resolve(cached)
  }

  return new Promise((resolve) => {
    const child = spawn(ffprobeExecutable(), [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time,flags',
      '-print_format', 'csv',
      sourcePath
    ], { windowsHide: true })

    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', () => { /* noop */ })

    child.stdout.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const times: number[] = []
      for (const line of raw.split('\n')) {
        // Format: packet,<pts_time>,<flags>  — only keep keyframe packets (flags contain 'K')
        const parts = line.trim().split(',')
        if (parts.length < 3 || !parts[2].includes('K')) continue
        const t = parseFloat(parts[1])
        if (Number.isFinite(t) && t >= 0) times.push(t)
      }
      times.sort((a, b) => a - b)
      keyframeCache.set(sourcePath, times)
      resolve(times)
    })

    child.on('error', () => resolve([]))
  })
}
import { spawn } from 'node:child_process'
import { protocol } from 'electron'
import { KVIDEO_SCHEME } from '../common/streaming'

interface CachedVideoMeta {
  codecName?: string
  durationSeconds: number
}

// Cache populated by prepareVideoFileForPlayback so the protocol handler knows codec/duration
const metaCache = new Map<string, CachedVideoMeta>()

export const cacheVideoMetadata = (filePath: string, meta: CachedVideoMeta): void => {
  metaCache.set(filePath, meta)
}

export const getVideoMetadata = (filePath: string): CachedVideoMeta | undefined => {
  return metaCache.get(filePath)
}

// Receives the ffmpeg binary path from index.ts to avoid circular imports
let ffmpegBin: (() => string) | undefined

export const initStreamingProtocol = (ffmpegExecutableGetter: () => string): void => {
  ffmpegBin = ffmpegExecutableGetter
}

export const registerStreamingProtocol = (): void => {
  protocol.handle(KVIDEO_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = url.searchParams.get('p') ?? ''

      if (!filePath) {
        return new Response('Missing file path', { status: 400 })
      }

      if (!ffmpegBin) {
        return new Response('Streaming not initialised', { status: 500 })
      }

      const startSeconds = parseFloat(url.searchParams.get('t') ?? '0') || 0
      const meta = metaCache.get(filePath)
      const codecName = meta?.codecName?.toLowerCase() ?? ''

      // HEVC/H.265 cannot be decoded by Chromium on any platform → must transcode to H.264
      const needsVideoTranscode = codecName === 'hevc' || codecName === 'h265'

      const ffmpegArgs: string[] = [
        ...(startSeconds > 0 ? ['-ss', String(startSeconds)] : []),
        '-i', filePath,
        '-c:v', needsVideoTranscode ? 'libx264' : 'copy',
        // For HEVC: scale 4K down to 1080p so the real-time H.264 encode stays within
        // CPU budget. Video analysis does not require 4K resolution.
        ...(needsVideoTranscode ? [
          '-vf', 'scale=w=1920:h=1080:force_original_aspect_ratio=decrease:flags=fast_bilinear',
          '-preset', 'ultrafast',
          '-crf', '22'
        ] : []),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      ]

      const child = spawn(ffmpegBin(), ffmpegArgs, { windowsHide: true })

      child.stderr.on('data', () => { /* noop */ })

      // cancelled flag prevents calling controller methods after cancel() has been invoked,
      // which would throw TypeError("Controller is already closed") as an uncaught main-process exception
      let cancelled = false

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          child.stdout.on('data', (chunk: Buffer) => {
            if (!cancelled) controller.enqueue(new Uint8Array(chunk))
          })
          child.stdout.on('end', () => {
            if (!cancelled) controller.close()
          })
          child.stdout.on('error', (err) => {
            if (!cancelled) controller.error(err)
          })
          child.on('error', (err) => {
            if (!cancelled) controller.error(err)
          })
        },
        cancel() {
          cancelled = true
          child.kill('SIGTERM')
        }
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4'
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Streaming error'
      return new Response(message, { status: 500 })
    }
  })
}

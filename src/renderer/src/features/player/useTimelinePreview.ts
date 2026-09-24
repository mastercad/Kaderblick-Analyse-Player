import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimelinePreviewFrame, TimelinePreviewSheet, VideoFileDescriptor } from '../../../../common/types'

export interface TimelinePreviewStatus {
  phase: 'idle' | 'indexing' | 'coarse' | 'fine' | 'ready' | 'paused' | 'unavailable'
  percent: number
  message: string
}

interface TimelinePreviewResult {
  frame: TimelinePreviewFrame | null
  status: TimelinePreviewStatus
  requestPreview: (seconds: number | null) => void
}

interface WorkerMessage {
  type: 'range-request' | 'sheet' | 'phase-complete' | 'progress' | 'urgent-frame' | 'complete' | 'error'
  requestId?: number
  sheetId?: number
  offset?: number
  length?: number
  phase?: 'coarse' | 'fine'
  targets?: number[]
  columns?: number
  rows?: number
  bytes?: Uint8Array
  target?: number
  percent?: number
  message?: string
}

const ISO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v'])
const EMPTY_STATUS: TimelinePreviewStatus = { phase: 'idle', percent: 0, message: '' }

const supportsLocalPreview = (video: VideoFileDescriptor): boolean =>
  video.playbackMode !== 'online' && video.playbackMode !== 'stream'

const bytesToObjectUrl = (bytes: Uint8Array): string => URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))

export function useTimelinePreview(
  videos: VideoFileDescriptor[],
  activeVideoPath: string | undefined,
  playbackActive: boolean
): TimelinePreviewResult {
  const [frame, setFrame] = useState<TimelinePreviewFrame | null>(null)
  const [statusByPath, setStatusByPath] = useState<Record<string, TimelinePreviewStatus>>({})
  const workerRef = useRef<Worker | null>(null)
  const workerPathRef = useRef<string | null>(null)
  const previewRequestSequence = useRef(0)
  const hoveredSecondRef = useRef<number | null>(null)
  const urgentObjectUrlRef = useRef<string | null>(null)
  const nativeCleanupRef = useRef<(() => void) | null>(null)
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null)
  const nativeVideoSourceRef = useRef<string | null>(null)
  const nativeResumeTimeRef = useRef(0)
  const nativeResumeSequenceRef = useRef(0)
  const playbackActiveRef = useRef(playbackActive)
  const stoppedRef = useRef(false)
  playbackActiveRef.current = playbackActive

  const previewVideos = useMemo(() => videos.filter(supportsLocalPreview), [videos])
  const signature = previewVideos.map((video) => `${video.path}\u0000${video.fileUrl}\u0000${video.durationSeconds ?? 0}`).join('\u0001')

  const updateStatus = (path: string, status: TimelinePreviewStatus): void => {
    setStatusByPath((current) => ({ ...current, [path]: status }))
  }

  const loadCachedFrame = useCallback(async (seconds: number): Promise<boolean> => {
    if (!activeVideoPath) return false
    const sequence = ++previewRequestSequence.current
    try {
      const cached = await window.desktopApi.getTimelinePreviewFrame(activeVideoPath, seconds)
      if (sequence !== previewRequestSequence.current) return false
      if (cached) {
        if (urgentObjectUrlRef.current) URL.revokeObjectURL(urgentObjectUrlRef.current)
        urgentObjectUrlRef.current = null
        setFrame(cached)
        return true
      }
      setFrame(null)
      return false
    } catch {
      if (sequence === previewRequestSequence.current) setFrame(null)
      return false
    }
  }, [activeVideoPath])

  const generateNativePreview = useCallback(async (video: VideoFileDescriptor): Promise<void> => {
    const cacheState = await window.desktopApi.getTimelinePreviewCacheState(video.path)
    if (cacheState.fineComplete) {
      updateStatus(video.path, { phase: 'ready', percent: 100, message: 'Vorschau bereit' })
      return
    }
    const previewVideo = document.createElement('video')
    previewVideo.src = video.fileUrl
    previewVideo.muted = true
    previewVideo.playsInline = true
    previewVideo.preload = 'auto'
    previewVideo.style.position = 'fixed'
    previewVideo.style.width = '1px'
    previewVideo.style.height = '1px'
    previewVideo.style.opacity = '0'
    previewVideo.style.pointerEvents = 'none'
    previewVideo.style.left = '-10px'
    document.body.appendChild(previewVideo)
    nativeVideoRef.current = previewVideo
    nativeVideoSourceRef.current = video.fileUrl
    let cancelled = false
    nativeCleanupRef.current = () => {
      cancelled = true
      previewVideo.pause()
      previewVideo.removeAttribute('src')
      previewVideo.load()
      previewVideo.remove()
      if (nativeVideoRef.current === previewVideo) nativeVideoRef.current = null
      if (nativeVideoSourceRef.current === video.fileUrl) nativeVideoSourceRef.current = null
    }
    await new Promise<void>((resolve, reject) => {
      previewVideo.addEventListener('loadedmetadata', () => resolve(), { once: true })
      previewVideo.addEventListener('error', () => reject(new Error('Das Video kann vom nativen Decoder nicht gelesen werden.')), { once: true })
      previewVideo.load()
    })
    if (cancelled) return
    const duration = Number.isFinite(previewVideo.duration) ? previewVideo.duration : (video.durationSeconds ?? 0)
    if (duration <= 0) throw new Error('Die Videodauer konnte nicht bestimmt werden.')
    let canvas = document.createElement('canvas')
    canvas.width = 192 * 5
    canvas.height = 108 * 5
    let graphics = canvas.getContext('2d')
    if (!graphics) throw new Error('Canvas-Kontext nicht verfügbar.')
    let targets: number[] = []
    let nextTarget = 0
    let pendingWrites = Promise.resolve()

    const flushSheet = (): void => {
      if (targets.length === 0) return
      const sheetTargets = targets
      const sheetCanvas = canvas
      targets = []
      canvas = document.createElement('canvas')
      canvas.width = 192 * 5
      canvas.height = 108 * 5
      graphics = canvas.getContext('2d')
      if (!graphics) throw new Error('Canvas-Kontext nicht verfügbar.')
      pendingWrites = pendingWrites.then(async () => {
        const blob = await new Promise<Blob>((resolve, reject) => sheetCanvas.toBlob((value) => value ? resolve(value) : reject(new Error('Vorschaubogen konnte nicht erstellt werden.')), 'image/webp', 0.72))
        const sheet: TimelinePreviewSheet = { phase: 'fine', targets: sheetTargets, columns: 5, rows: 5, imageBytes: new Uint8Array(await blob.arrayBuffer()) }
        await window.desktopApi.storeTimelinePreviewSheet(video.path, sheet)
      })
    }

    const capture = (): void => {
      if (cancelled || previewVideo.ended) return
      const mediaTime = previewVideo.currentTime
      while (nextTarget <= mediaTime && nextTarget <= duration) {
        const cell = targets.length
        const ratio = Math.min(192 / previewVideo.videoWidth, 108 / previewVideo.videoHeight)
        const width = previewVideo.videoWidth * ratio
        const height = previewVideo.videoHeight * ratio
        const x = cell % 5 * 192 + (192 - width) / 2
        const y = Math.floor(cell / 5) * 108 + (108 - height) / 2
        graphics.fillStyle = '#000'
        graphics.fillRect(cell % 5 * 192, Math.floor(cell / 5) * 108, 192, 108)
        graphics.drawImage(previewVideo, x, y, width, height)
        targets.push(nextTarget)
        nextTarget += 1
        if (targets.length === 25) flushSheet()
      }
      updateStatus(video.path, { phase: playbackActiveRef.current ? 'paused' : 'fine', percent: mediaTime / duration * 100, message: playbackActiveRef.current ? 'Vorschau pausiert während der Wiedergabe' : 'Vorschau wird verfeinert' })
      previewVideo.requestVideoFrameCallback(capture)
    }
    previewVideo.requestVideoFrameCallback(capture)
    try { previewVideo.playbackRate = 16 } catch { previewVideo.playbackRate = 4 }
    if (!playbackActiveRef.current) {
      await previewVideo.play()
    } else {
      nativeResumeTimeRef.current = previewVideo.currentTime
      previewVideo.removeAttribute('src')
      previewVideo.load()
    }
    await new Promise<void>((resolve) => previewVideo.addEventListener('ended', () => resolve(), { once: true }))
    if (cancelled) return
    flushSheet()
    await pendingWrites
    await window.desktopApi.markTimelinePreviewPhaseComplete(video.path, 'fine')
    updateStatus(video.path, { phase: 'ready', percent: 100, message: 'Vorschau bereit' })
    nativeCleanupRef.current?.()
    nativeCleanupRef.current = null
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    let cancelled = false
    const ordered = [...previewVideos].sort((left, right) => Number(right.path === activeVideoPath) - Number(left.path === activeVideoPath))
    let currentWorker: Worker | null = null

    const processVideo = async (video: VideoFileDescriptor): Promise<void> => {
      if (cancelled || stoppedRef.current) return
      const fileInfo = await window.desktopApi.getTimelinePreviewFileInfo(video.path)
      if (cancelled) return
      if (!ISO_EXTENSIONS.has(fileInfo.extension)) {
        try {
          await generateNativePreview(video)
        } catch (error) {
          updateStatus(video.path, { phase: 'unavailable', percent: 0, message: error instanceof Error ? error.message : 'Vorschau nicht verfügbar' })
        }
        return
      }
      const cacheState = await window.desktopApi.getTimelinePreviewCacheState(video.path)
      if (cancelled) return
      if (cacheState.fineComplete) {
        updateStatus(video.path, { phase: 'ready', percent: 100, message: 'Vorschau bereit' })
        return
      }
      updateStatus(video.path, { phase: 'indexing', percent: 0, message: 'Videoindex wird gelesen' })
      await new Promise<void>((resolve) => {
        const worker = new Worker(new URL('./timelinePreview.worker.ts', import.meta.url), { type: 'module' })
        currentWorker = worker
        workerRef.current = worker
        workerPathRef.current = video.path
        let writes = Promise.resolve()
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          if (cancelled) return
          const message = event.data
          if (message.type === 'range-request') {
            void window.desktopApi.readTimelinePreviewRange(video.path, message.offset ?? 0, message.length ?? 0)
              .then((bytes) => worker.postMessage({ type: 'range-response', requestId: message.requestId, bytes }, [bytes.buffer]))
              .catch((error: unknown) => worker.postMessage({ type: 'range-response', requestId: message.requestId, error: error instanceof Error ? error.message : String(error) }))
            return
          }
          if (message.type === 'sheet' && message.bytes && message.phase && message.targets) {
            const sheet: TimelinePreviewSheet = { phase: message.phase, targets: message.targets, columns: message.columns ?? 5, rows: message.rows ?? 5, imageBytes: message.bytes }
            writes = writes
              .then(() => window.desktopApi.storeTimelinePreviewSheet(video.path, sheet))
              .then(async () => {
                worker.postMessage({ type: 'sheet-stored', sheetId: message.sheetId })
                if (video.path === activeVideoPath && hoveredSecondRef.current !== null) await loadCachedFrame(hoveredSecondRef.current)
              })
              .catch((error: unknown) => {
                worker.postMessage({ type: 'sheet-stored', sheetId: message.sheetId, error: error instanceof Error ? error.message : String(error) })
              })
            return
          }
          if (message.type === 'phase-complete' && message.phase) {
            writes = writes.then(() => window.desktopApi.markTimelinePreviewPhaseComplete(video.path, message.phase!))
            return
          }
          if (message.type === 'progress' && message.phase) {
            const phaseBase = message.phase === 'coarse' ? 0 : 20
            const phaseShare = message.phase === 'coarse' ? 20 : 80
            updateStatus(video.path, {
              phase: playbackActiveRef.current ? 'paused' : message.phase,
              percent: phaseBase + (message.percent ?? 0) / 100 * phaseShare,
              message: playbackActiveRef.current ? 'Vorschau pausiert während der Wiedergabe' : message.phase === 'coarse' ? 'Übersicht wird erstellt' : 'Vorschau wird verfeinert'
            })
            return
          }
          if (message.type === 'urgent-frame' && message.bytes && video.path === activeVideoPath) {
            if (urgentObjectUrlRef.current) URL.revokeObjectURL(urgentObjectUrlRef.current)
            const imageUrl = bytesToObjectUrl(message.bytes)
            urgentObjectUrlRef.current = imageUrl
            setFrame({ imageUrl, column: 0, row: 0, columns: 1, rows: 1 })
            return
          }
          if (message.type === 'error') {
            updateStatus(video.path, { phase: 'unavailable', percent: 0, message: message.message ?? 'Vorschau nicht verfügbar' })
            worker.terminate()
            void generateNativePreview(video).catch(() => undefined).finally(resolve)
            return
          }
          if (message.type === 'complete') {
            writes.finally(() => {
              updateStatus(video.path, { phase: 'ready', percent: 100, message: 'Vorschau bereit' })
              worker.terminate()
              resolve()
            })
          }
        }
        worker.onerror = () => {
          worker.terminate()
          void generateNativePreview(video).catch(() => undefined).finally(resolve)
        }
        worker.postMessage({ type: 'init', sourcePath: video.path, fileSize: fileInfo.size, ...cacheState })
        worker.postMessage({ type: 'pause', paused: playbackActive })
      })
    }

    void (async () => {
      for (const video of ordered) {
        if (cancelled || stoppedRef.current) break
        await processVideo(video)
      }
    })()

    return () => {
      cancelled = true
      stoppedRef.current = true
      currentWorker?.postMessage({ type: 'stop' })
      currentWorker?.terminate()
      workerRef.current = null
      workerPathRef.current = null
      nativeCleanupRef.current?.()
      nativeCleanupRef.current = null
    }
  // signature captures every video input; active path reprioritizes the queue.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, activeVideoPath])

  useEffect(() => {
    workerRef.current?.postMessage({ type: 'pause', paused: playbackActive })
    const nativeVideo = nativeVideoRef.current
    if (nativeVideo) {
      nativeResumeSequenceRef.current += 1
      const resumeSequence = nativeResumeSequenceRef.current
      if (playbackActive) {
        nativeResumeTimeRef.current = nativeVideo.currentTime
        nativeVideo.pause()
        nativeVideo.removeAttribute('src')
        nativeVideo.load()
      } else {
        const source = nativeVideoSourceRef.current
        if (!source) return
        nativeVideo.src = source
        nativeVideo.load()
        nativeVideo.addEventListener('loadedmetadata', () => {
          if (resumeSequence !== nativeResumeSequenceRef.current || playbackActiveRef.current) return
          nativeVideo.currentTime = nativeResumeTimeRef.current
          void nativeVideo.play().catch(() => undefined)
        }, { once: true })
      }
    }
  }, [playbackActive])

  useEffect(() => () => {
    if (urgentObjectUrlRef.current) URL.revokeObjectURL(urgentObjectUrlRef.current)
  }, [])

  const requestPreview = useCallback((seconds: number | null): void => {
    if (!activeVideoPath || seconds === null) {
      hoveredSecondRef.current = null
      previewRequestSequence.current += 1
      setFrame(null)
      return
    }
    const target = Math.max(0, Math.floor(seconds))
    hoveredSecondRef.current = target
    void loadCachedFrame(target).then((found) => {
      if (!found && workerPathRef.current === activeVideoPath) workerRef.current?.postMessage({ type: 'preview-request', seconds: target })
    })
  }, [activeVideoPath, loadCachedFrame])

  return {
    frame,
    status: activeVideoPath ? (statusByPath[activeVideoPath] ?? EMPTY_STATUS) : EMPTY_STATUS,
    requestPreview
  }
}

import { cloneElement, isValidElement, useEffect, useEffectEvent, useRef, useState } from 'react'
import { buildCssFilter } from '../../../../common/filterUtils'
import { getSegmentPlaybackTransition } from '../../../../common/segmentPlayback'
import {
  findActiveSegmentIndex,
  getNextSegmentIndex,
  getPreviousSegmentIndex,
  resolveSegmentSequenceStartIndex
} from '../../../../common/segmentUtils'
import { findNextKeyframeTime, findPreviousKeyframeTime } from '../../../../common/keyframeUtils'
import { buildStreamUrl } from '../../../../common/streaming'
import { formatClockTime } from '../../../../common/timeUtils'
import type { FilterSettings, Segment, VideoFileDescriptor } from '../../../../common/types'
import { SegmentList } from './SegmentList'
import { SegmentTimeline } from './SegmentTimeline'

type FullscreenFlyout = 'top' | 'left' | 'right' | 'bottom'
type Point = { x: number, y: number }
type Size = { width: number, height: number }
type VideoRect = { left: number, top: number, width: number, height: number }

const MIN_ZOOM_LEVEL = 1
const MAX_ZOOM_LEVEL = 4
const ZOOM_STEP = 0.25
const FRAME_STEP_SECONDS = 1 / 25
const SEEK_STEP_SECONDS = 5
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

const formatRate = (rate: number): string => {
  if (rate === 0.25) return '¼×'
  if (rate === 0.5) return '½×'
  if (rate === 0.75) return '¾×'
  if (rate === 1) return 'Normal'
  if (rate === 1.25) return '1¼×'
  if (rate === 1.5) return '1½×'
  if (rate === 2) return '2×'
  return `${rate}×`
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const roundZoomLevel = (value: number): number => Math.round(value * 100) / 100
const ensureFinitePoint = (point: Point): Point => ({
  x: Number.isFinite(point.x) ? point.x : 0,
  y: Number.isFinite(point.y) ? point.y : 0
})

const getFittedVideoRect = (viewportSize: Size, intrinsicSize: Size | null): VideoRect => {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }

  if (!intrinsicSize || intrinsicSize.width <= 0 || intrinsicSize.height <= 0) {
    return { left: 0, top: 0, width: viewportSize.width, height: viewportSize.height }
  }

  const scale = Math.min(viewportSize.width / intrinsicSize.width, viewportSize.height / intrinsicSize.height)
  const width = intrinsicSize.width * scale
  const height = intrinsicSize.height * scale

  return {
    left: (viewportSize.width - width) / 2,
    top: (viewportSize.height - height) / 2,
    width,
    height
  }
}

const clampZoomOffset = (offset: Point, zoomLevel: number, viewportSize: Size, fittedVideoRect: VideoRect): Point => {
  if (zoomLevel <= MIN_ZOOM_LEVEL || fittedVideoRect.width <= 0 || fittedVideoRect.height <= 0) {
    return { x: 0, y: 0 }
  }

  const scaledWidth = fittedVideoRect.width * zoomLevel
  const scaledHeight = fittedVideoRect.height * zoomLevel
  const minX = viewportSize.width - fittedVideoRect.left - scaledWidth
  const maxX = -fittedVideoRect.left
  const minY = viewportSize.height - fittedVideoRect.top - scaledHeight
  const maxY = -fittedVideoRect.top

  return {
    x: clamp(offset.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(offset.y, Math.min(minY, maxY), Math.max(minY, maxY))
  }
}

interface VideoWorkspaceProps {
  selectedVideo?: VideoFileDescriptor
  segments: Segment[]
  filterSettings: FilterSettings
  filterOverlayVisible: boolean
  repeatSingleSegment: boolean
  onRepeatSingleSegmentChange: (value: boolean) => void
  onToggleFilterOverlay: () => void
  playbackRecoveryInProgress?: boolean
  autoPlayOnLoad?: boolean
  autoStartSegmentsOnLoad?: boolean
  onVideoLoaded?: (durationSeconds: number) => void
  onVideoError?: (message: string, recoverable: boolean) => void
  onAllSegmentsDone?: () => void
  onVideoEnded?: () => void
  children: React.ReactNode
  overlayDialogs?: React.ReactNode
}

const getMediaErrorMessage = (video: HTMLVideoElement, selectedVideo?: VideoFileDescriptor): string => {
  const fileName = selectedVideo?.fileName ?? 'Das Video'

  if (!video.error) {
    return `${fileName} konnte nicht geladen werden.`
  }

  switch (video.error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return `${fileName} wurde während des Ladevorgangs abgebrochen.`
    case MediaError.MEDIA_ERR_NETWORK:
      return `${fileName} konnte wegen eines Datei- oder Netzwerkfehlers nicht gelesen werden.`
    case MediaError.MEDIA_ERR_DECODE:
      return `${fileName} konnte nicht decodiert werden. Das Dateiformat oder der verwendete Codec wird von Electron auf diesem System wahrscheinlich nicht unterstützt.`
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return `${fileName} wird von Electron auf diesem System nicht unterstützt oder die Datei ist nicht lesbar.`
    default:
      return `${fileName} konnte nicht geladen werden.`
  }
}

const getMissingVideoTrackMessage = (selectedVideo?: VideoFileDescriptor): string => {
  const fileName = selectedVideo?.fileName ?? 'Die Datei'
  return `${fileName} wurde geladen, enthält für Electron aber keine darstellbare Videospur. Wahrscheinlich ist nur Audio decodierbar oder der Video-Codec wird auf diesem System nicht unterstützt.`
}

export function VideoWorkspace({
  selectedVideo,
  segments,
  filterSettings,
  filterOverlayVisible,
  repeatSingleSegment,
  onRepeatSingleSegmentChange,
  onToggleFilterOverlay,
  playbackRecoveryInProgress = false,
  autoPlayOnLoad = false,
  autoStartSegmentsOnLoad = false,
  onVideoLoaded,
  onVideoError,
  onAllSegmentsDone,
  onVideoEnded,
  children,
  overlayDialogs
}: VideoWorkspaceProps) {
  const playerPanelRef = useRef<HTMLElement | null>(null)
  const videoStageViewportRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const zoomDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffset: Point
  } | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSegmentMode, setIsSegmentMode] = useState(false)
  const [sequenceIndex, setSequenceIndex] = useState(-1)
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [videoError, setVideoError] = useState<string>()
  const [hoveredFullscreenFlyout, setHoveredFullscreenFlyout] = useState<FullscreenFlyout | null>(null)
  const [pinnedFullscreenFlyout, setPinnedFullscreenFlyout] = useState<FullscreenFlyout | null>(null)
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM_LEVEL)
  const [zoomOffset, setZoomOffset] = useState<Point>({ x: 0, y: 0 })
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })
  const [videoIntrinsicSize, setVideoIntrinsicSize] = useState<Size | null>(null)
  const [isPanningZoom, setIsPanningZoom] = useState(false)
  const [showZoomDock, setShowZoomDock] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const pendingAutoPlayRef = useRef(false)
  const pendingAutoStartSegmentsRef = useRef(false)
  // Stream-mode seeking: track time offset since each seek rebuilds the stream from a new start point
  const streamStartSecondsRef = useRef(0)
  const isStreamSeekRef = useRef(false)
  const [streamUrl, setStreamUrl] = useState<string | undefined>()
  const [keyframeTimes, setKeyframeTimes] = useState<number[]>([])
  const activeFullscreenFlyout = pinnedFullscreenFlyout ?? hoveredFullscreenFlyout
  const isZoomed = zoomLevel > MIN_ZOOM_LEVEL
  const fittedVideoRect = getFittedVideoRect(viewportSize, videoIntrinsicSize)

  useEffect(() => {
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setIsSegmentMode(false)
    setSequenceIndex(-1)
    setActiveSegmentIndex(-1)
    setVideoError(undefined)
    setZoomLevel(MIN_ZOOM_LEVEL)
    setZoomOffset({ x: 0, y: 0 })
    setViewportSize({ width: 0, height: 0 })
    setVideoIntrinsicSize(null)
    zoomDragRef.current = null
    setIsPanningZoom(false)
    setShowZoomDock(false)
    setPlaybackRate(1)
    pendingAutoPlayRef.current = autoPlayOnLoad || autoStartSegmentsOnLoad
    pendingAutoStartSegmentsRef.current = autoStartSegmentsOnLoad
    streamStartSecondsRef.current = 0
    isStreamSeekRef.current = false
    setStreamUrl(undefined)
    setKeyframeTimes([])
  }, [selectedVideo?.path])

  useEffect(() => {
    setKeyframeTimes([])
    if (!selectedVideo?.path || selectedVideo.playbackMode !== 'stream') {
      return
    }
    void window.desktopApi.getKeyframeTimes(selectedVideo.path)
      .then((times) => setKeyframeTimes(times))
      .catch(() => { /* keyframe data unavailable */ })
  }, [selectedVideo?.path, selectedVideo?.playbackMode])

  // When the same file switches from direct → stream mode (same path, different fileUrl), schedule auto-play
  useEffect(() => {
    if (selectedVideo?.playbackMode === 'stream') {
      streamStartSecondsRef.current = 0
      isStreamSeekRef.current = false
      setStreamUrl(undefined)
      pendingAutoPlayRef.current = true
    }
  }, [selectedVideo?.fileUrl])

  useEffect(() => {
    const viewport = videoStageViewportRef.current

    if (!viewport) {
      return
    }

    const measureViewport = (): void => {
      const rect = viewport.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }

    measureViewport()

    let resizeObserver: ResizeObserver | undefined

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureViewport())
      resizeObserver.observe(viewport)
    }

    window.addEventListener('resize', measureViewport)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measureViewport)
    }
  }, [selectedVideo?.fileUrl, isFullscreen])

  useEffect(() => {
    if (segments.length === 0) {
      setIsSegmentMode(false)
      setSequenceIndex(-1)
      setActiveSegmentIndex(-1)
      return
    }

    setActiveSegmentIndex(findActiveSegmentIndex(segments, currentTime))
  }, [segments, currentTime])

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement === playerPanelRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (!isFullscreen) {
      setHoveredFullscreenFlyout(null)
      setPinnedFullscreenFlyout(null)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen || (!videoError && !playbackRecoveryInProgress)) {
      return
    }

    setPinnedFullscreenFlyout('right')
  }, [isFullscreen, playbackRecoveryInProgress, videoError])

  useEffect(() => {
    if (playbackRecoveryInProgress) {
      setVideoError(undefined)
    }
  }, [playbackRecoveryInProgress])

  const onKeyboardShortcut = useEffectEvent((event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement

    if (isTyping) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      void togglePlayPause()
    }

    if (event.code === 'ArrowLeft' && !event.shiftKey) {
      event.preventDefault()
      jumpToPreviousSegment()
    }

    if (event.code === 'ArrowRight' && !event.shiftKey) {
      event.preventDefault()
      jumpToNextSegment()
    }

    if (event.code === 'ArrowLeft' && event.shiftKey) {
      event.preventDefault()
      jumpBySeconds(-SEEK_STEP_SECONDS)
    }

    if (event.code === 'ArrowRight' && event.shiftKey) {
      event.preventDefault()
      jumpBySeconds(SEEK_STEP_SECONDS)
    }

    if (event.key === ',') {
      event.preventDefault()
      stepFrame('backward')
    }

    if (event.key === '.') {
      event.preventDefault()
      stepFrame('forward')
    }

    if (event.key === '[') {
      event.preventDefault()
      jumpToPreviousKeyframe()
    }

    if (event.key === ']') {
      event.preventDefault()
      jumpToNextKeyframe()
    }

    if (event.key === '<') {
      event.preventDefault()
      adjustPlaybackRate('slower')
    }

    if (event.key === '>') {
      event.preventDefault()
      adjustPlaybackRate('faster')
    }

    if (event.code === 'KeyN') {
      event.preventDefault()
      void startSegmentPlayback()
    }

    if (event.code === 'KeyF') {
      event.preventDefault()
      onToggleFilterOverlay()
    }

    if (event.code === 'KeyR') {
      event.preventDefault()
      onRepeatSingleSegmentChange(!repeatSingleSegment)
    }

    if (event.code === 'F11') {
      event.preventDefault()
      void toggleFullscreen()
    }

    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault()
      zoomToViewportPoint(zoomLevel + ZOOM_STEP)
    }

    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault()
      zoomToViewportPoint(zoomLevel - ZOOM_STEP)
    }

    if (event.code === 'Digit0' || event.code === 'Numpad0') {
      event.preventDefault()
      resetZoom()
    }

    if (event.code === 'KeyZ') {
      event.preventDefault()
      setShowZoomDock(prev => !prev)
    }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => onKeyboardShortcut(event)

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const applyWheelZoom = (clientX: number, clientY: number, deltaY: number): void => {
    const zoomDelta = deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
    zoomToViewportPoint(zoomLevel + zoomDelta, resolveViewportPointFromClientPoint(clientX, clientY))
  }

  const onNativeVideoStageWheel = useEffectEvent((event: WheelEvent): void => {
    if (!selectedVideo) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    applyWheelZoom(event.clientX, event.clientY, event.deltaY)
  })

  useEffect(() => {
    const viewport = videoStageViewportRef.current

    if (!viewport || !selectedVideo) {
      return
    }

    const handleWheel = (event: WheelEvent): void => onNativeVideoStageWheel(event)

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [onNativeVideoStageWheel, selectedVideo?.fileUrl])

  const seekTo = (nextTimeSeconds: number): void => {
    if (!videoRef.current) {
      return
    }

    if (selectedVideo?.playbackMode === 'stream') {
      const wasPlaying = isPlaying
      isStreamSeekRef.current = true
      streamStartSecondsRef.current = nextTimeSeconds
      setStreamUrl(buildStreamUrl(selectedVideo.path, nextTimeSeconds))
      pendingAutoPlayRef.current = wasPlaying
      setCurrentTime(nextTimeSeconds)
      setActiveSegmentIndex(findActiveSegmentIndex(segments, nextTimeSeconds))
      return
    }

    videoRef.current.currentTime = nextTimeSeconds
    setCurrentTime(nextTimeSeconds)
    setActiveSegmentIndex(findActiveSegmentIndex(segments, nextTimeSeconds))
  }

  const pausePlayback = (): void => {
    videoRef.current?.pause()
    setIsPlaying(false)
  }

  const playPlayback = async (): Promise<void> => {
    if (!videoRef.current) {
      return
    }

    try {
      await videoRef.current.play()
      setVideoError(undefined)
      setIsPlaying(true)
    } catch (error) {
      const nextMessage = error instanceof Error
        ? error.message
        : getMediaErrorMessage(videoRef.current, selectedVideo)

      setVideoError(nextMessage)
      onVideoError?.(nextMessage, false)
      setIsPlaying(false)
    }
  }

  const jumpToSegment = (segmentIndex: number, continuePlaying = false): void => {
    const segment = segments[segmentIndex]
    if (!segment) {
      return
    }

    seekTo(segment.startSeconds)
    setActiveSegmentIndex(segmentIndex)

    setSequenceIndex(segmentIndex)

    if (continuePlaying) {
      void playPlayback()
    }
  }

  const togglePlayPause = async (): Promise<void> => {
    if (!videoRef.current) {
      return
    }

    if (videoRef.current.paused) {
      await playPlayback()
    } else {
      pausePlayback()
    }
  }

  const jumpToNextSegment = (): void => {
    const nextIndex = getNextSegmentIndex(segments, currentTime)

    if (nextIndex >= 0) {
      jumpToSegment(nextIndex)
    }
  }

  const jumpToPreviousSegment = (): void => {
    const previousIndex = getPreviousSegmentIndex(segments, currentTime)

    if (previousIndex >= 0) {
      jumpToSegment(previousIndex)
    }
  }

  const getEffectiveCurrentTime = (): number => {
    if (!videoRef.current || !selectedVideo) return 0
    if (selectedVideo.playbackMode === 'stream') {
      // While a seek is in progress the video element's currentTime still reflects
      // the old stream's position. Only add it once the new stream has loaded.
      if (isStreamSeekRef.current) return streamStartSecondsRef.current
      return streamStartSecondsRef.current + videoRef.current.currentTime
    }
    return videoRef.current.currentTime
  }

  const getEffectiveMaxDuration = (): number => {
    if (!selectedVideo) return 0
    if (selectedVideo.playbackMode === 'stream') {
      return selectedVideo.durationSeconds ?? duration
    }
    return Number.isFinite(videoRef.current?.duration) ? (videoRef.current?.duration ?? duration) : duration
  }

  const stepFrame = (direction: 'forward' | 'backward'): void => {
    if (!videoRef.current || !selectedVideo) {
      return
    }

    if (!videoRef.current.paused) {
      pausePlayback()
    }

    const delta = direction === 'forward' ? FRAME_STEP_SECONDS : -FRAME_STEP_SECONDS
    const nextTime = Math.max(0, Math.min(getEffectiveMaxDuration(), getEffectiveCurrentTime() + delta))
    seekTo(nextTime)
  }

  const jumpBySeconds = (delta: number): void => {
    if (!videoRef.current || !selectedVideo) {
      return
    }

    const nextTime = Math.max(0, Math.min(getEffectiveMaxDuration(), getEffectiveCurrentTime() + delta))
    seekTo(nextTime)
  }

  const jumpToNextKeyframe = (): void => {
    const next = findNextKeyframeTime(keyframeTimes, getEffectiveCurrentTime())
    if (next !== undefined) {
      seekTo(Math.min(next, getEffectiveMaxDuration()))
    }
  }

  const jumpToPreviousKeyframe = (): void => {
    const prev = findPreviousKeyframeTime(keyframeTimes, getEffectiveCurrentTime())
    if (prev !== undefined) {
      seekTo(Math.max(0, prev))
    }
  }

  const changePlaybackRate = (rate: number): void => {
    if (!videoRef.current) {
      return
    }

    videoRef.current.playbackRate = rate
    setPlaybackRate(rate)
  }

  const adjustPlaybackRate = (direction: 'faster' | 'slower'): void => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate)

    if (direction === 'faster' && currentIndex < PLAYBACK_RATES.length - 1) {
      changePlaybackRate(PLAYBACK_RATES[currentIndex + 1])
    } else if (direction === 'slower' && currentIndex > 0) {
      changePlaybackRate(PLAYBACK_RATES[currentIndex - 1])
    }
  }

  const startSegmentPlayback = async (): Promise<void> => {
    const startIndex = repeatSingleSegment && activeSegmentIndex >= 0
      ? activeSegmentIndex
      : resolveSegmentSequenceStartIndex(segments, currentTime)

    if (startIndex < 0) {
      return
    }

    setIsSegmentMode(true)
    setSequenceIndex(startIndex)
    jumpToSegment(startIndex)
    await playPlayback()
  }

  const toggleFullscreen = async (): Promise<void> => {
    if (!playerPanelRef.current) {
      return
    }

    if (document.fullscreenElement === playerPanelRef.current) {
      await document.exitFullscreen()
      return
    }

    await playerPanelRef.current.requestFullscreen()
  }

  const resolveViewportPointFromClientPoint = (clientX: number, clientY: number): Point | null => {
    const viewport = videoStageViewportRef.current

    if (!viewport) {
      return null
    }

    const rect = viewport.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height)
    }
  }

  const getLiveViewportMetrics = (): { viewport: Size, fittedRect: VideoRect } | null => {
    const viewport = videoStageViewportRef.current

    if (!viewport) {
      return null
    }

    const rect = viewport.getBoundingClientRect()
    const nextViewport = {
      width: rect.width,
      height: rect.height
    }

    if (nextViewport.width <= 0 || nextViewport.height <= 0) {
      return null
    }

    const intrinsicSize = videoIntrinsicSize ?? (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0
      ? { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight }
      : null)

    return {
      viewport: nextViewport,
      fittedRect: getFittedVideoRect(nextViewport, intrinsicSize)
    }
  }

  const zoomToViewportPoint = (nextZoomLevel: number, viewportPoint?: Point): void => {
    const metrics = getLiveViewportMetrics()
    const clampedZoomLevel = roundZoomLevel(clamp(nextZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL))

    if (
      clampedZoomLevel <= MIN_ZOOM_LEVEL ||
      !metrics ||
      metrics.fittedRect.width <= 0 ||
      metrics.fittedRect.height <= 0
    ) {
      setZoomLevel(MIN_ZOOM_LEVEL)
      setZoomOffset({ x: 0, y: 0 })
      zoomDragRef.current = null
      setIsPanningZoom(false)
      return
    }

    const { viewport, fittedRect } = metrics

    const anchor = viewportPoint ?? {
      x: viewport.width / 2,
      y: viewport.height / 2
    }

    const localPoint = {
      x: (anchor.x - fittedRect.left - zoomOffset.x) / zoomLevel,
      y: (anchor.y - fittedRect.top - zoomOffset.y) / zoomLevel
    }

    const unclampedOffset = {
      x: anchor.x - fittedRect.left - localPoint.x * clampedZoomLevel,
      y: anchor.y - fittedRect.top - localPoint.y * clampedZoomLevel
    }

    setZoomLevel(clampedZoomLevel)
    setZoomOffset(ensureFinitePoint(clampZoomOffset(unclampedOffset, clampedZoomLevel, viewport, fittedRect)))
  }

  const resetZoom = (): void => {
    zoomToViewportPoint(MIN_ZOOM_LEVEL)
  }

  const handleZoomStep = (direction: 'in' | 'out'): void => {
    zoomToViewportPoint(zoomLevel + (direction === 'in' ? ZOOM_STEP : -ZOOM_STEP))
  }

  const handleZoomSliderChange = (nextValue: number): void => {
    zoomToViewportPoint(nextValue)
  }

  const handleVideoStageWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (!selectedVideo) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    applyWheelZoom(event.clientX, event.clientY, event.deltaY)
  }

  const handleVideoStageDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!selectedVideo) {
      return
    }

    const nextViewportPoint = resolveViewportPointFromClientPoint(event.clientX, event.clientY)

    if (isZoomed) {
      resetZoom()
      return
    }

    zoomToViewportPoint(2, nextViewportPoint ?? undefined)
  }

  const handleZoomPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!selectedVideo || !isZoomed) {
      return
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.preventDefault()
    videoStageViewportRef.current?.setPointerCapture(event.pointerId)
    zoomDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: zoomOffset
    }
    setIsPanningZoom(true)
  }

  const handleZoomPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const activeDrag = zoomDragRef.current
    const metrics = getLiveViewportMetrics()

    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !metrics) {
      return
    }

    event.preventDefault()
    const { viewport, fittedRect } = metrics

    const nextOffset = {
      x: activeDrag.startOffset.x + (event.clientX - activeDrag.startClientX),
      y: activeDrag.startOffset.y + (event.clientY - activeDrag.startClientY)
    }

    setZoomOffset(ensureFinitePoint(clampZoomOffset(nextOffset, zoomLevel, viewport, fittedRect)))
  }

  const stopZoomPan = (pointerId?: number): void => {
    if (pointerId !== undefined) {
      videoStageViewportRef.current?.releasePointerCapture(pointerId)
    }

    zoomDragRef.current = null
    setIsPanningZoom(false)
  }

  const handleZoomPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (zoomDragRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopZoomPan(event.pointerId)
  }

  const handleZoomPointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (zoomDragRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopZoomPan(event.pointerId)
  }

  const toggleFullscreenFlyout = (flyout: FullscreenFlyout): void => {
    setHoveredFullscreenFlyout(flyout)
    setPinnedFullscreenFlyout((currentFlyout) => (currentFlyout === flyout ? null : flyout))
  }

  const handleFullscreenFlyoutMouseEnter = (flyout: FullscreenFlyout): void => {
    setHoveredFullscreenFlyout(flyout)
  }

  const handleFullscreenFlyoutMouseLeave = (flyout: FullscreenFlyout): void => {
    setHoveredFullscreenFlyout((currentFlyout) => (currentFlyout === flyout ? null : currentFlyout))
  }

  const handleTimeUpdate = (): void => {
    if (!videoRef.current) {
      return
    }

    // During a stream seek the old stream still fires timeupdate events.
    // Ignore them: streamStartSecondsRef already points to the new seek position,
    // so combining it with the old rawTime would produce a value past the total duration.
    if (isStreamSeekRef.current) {
      return
    }

    const rawTime = videoRef.current.currentTime
    const nextCurrentTime = selectedVideo?.playbackMode === 'stream'
      ? streamStartSecondsRef.current + rawTime
      : rawTime
    setCurrentTime(nextCurrentTime)

    const detectedActiveIndex = findActiveSegmentIndex(segments, nextCurrentTime)
    setActiveSegmentIndex(detectedActiveIndex)

    if (!isSegmentMode || sequenceIndex < 0) {
      return
    }

    const currentSegment = segments[sequenceIndex]
    if (!currentSegment) {
      setIsSegmentMode(false)
      setSequenceIndex(-1)
      pausePlayback()
      return
    }

    if (nextCurrentTime < currentSegment.startSeconds - 0.15) {
      seekTo(currentSegment.startSeconds)
      return
    }

    if (nextCurrentTime >= currentSegment.endSeconds - 0.05) {
      const transition = getSegmentPlaybackTransition(segments, sequenceIndex, {
        repeatSingleSegment
      })

      if (transition.action === 'pause') {
        pausePlayback()
        setIsSegmentMode(false)
        setSequenceIndex(-1)
        seekTo(transition.nextTimeSeconds)
        onAllSegmentsDone?.()
        return
      }

      setSequenceIndex(transition.nextIndex)
      seekTo(transition.nextTimeSeconds)
      void playPlayback()
    }
  }

  const handleMetadataLoaded = (): void => {
    if (!videoRef.current) {
      return
    }

    const rawDuration = videoRef.current.duration
    // In stream mode the video element only sees a partial stream (from the last seek offset
    // to the end of the file), so its duration is either Infinity (fMP4/empty_moov) or the
    // remaining duration – never the total file duration. Always use the ffprobe value.
    const nextDuration = selectedVideo?.playbackMode === 'stream'
      ? (selectedVideo.durationSeconds ?? 0)
      : (Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : (selectedVideo?.durationSeconds ?? 0))

    const wasStreamSeek = isStreamSeekRef.current
    isStreamSeekRef.current = false

    setVideoError(undefined)
    setDuration(nextDuration)

    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      const nextMessage = getMissingVideoTrackMessage(selectedVideo)
      setVideoError(nextMessage)
      onVideoError?.(nextMessage, false)
      return
    }

    setVideoIntrinsicSize({
      width: videoRef.current.videoWidth,
      height: videoRef.current.videoHeight
    })

    if (!wasStreamSeek) {
      onVideoLoaded?.(nextDuration)
    }
  }

  const handleCanPlay = (): void => {
    if (!pendingAutoPlayRef.current) {
      return
    }

    pendingAutoPlayRef.current = false
    if (pendingAutoStartSegmentsRef.current) {
      pendingAutoStartSegmentsRef.current = false
      void startSegmentPlayback()
    } else {
      void playPlayback()
    }
  }

  const handleVideoError = (): void => {
    if (!videoRef.current) {
      return
    }

    const nextMessage = getMediaErrorMessage(videoRef.current, selectedVideo)
    setVideoError(nextMessage)
    setIsPlaying(false)
    setIsSegmentMode(false)
    setSequenceIndex(-1)
    const errorCode = videoRef.current.error?.code
    const recoverable = errorCode === MediaError.MEDIA_ERR_DECODE || errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
    onVideoError?.(nextMessage, recoverable)
  }

  const playerHeader = (
    <div className="panel__header">
      <div>
        <p className="panel__eyebrow">Player</p>
        <h2>{selectedVideo?.fileName ?? 'Bitte zuerst ein Video laden'}</h2>
      </div>
      {(isSegmentMode || filterOverlayVisible || repeatSingleSegment) && (
        <div className="pill-row">
          {isSegmentMode && <span className="pill">Segmentmodus</span>}
          {filterOverlayVisible && <span className="pill pill--accent">Filter aktiv</span>}
          {repeatSingleSegment && <span className="pill">Wiederholung</span>}
        </div>
      )}
    </div>
  )

  const transportControls = (
    <div className="controls-row player-controls__transport">
      <button className="button button--primary" type="button" onClick={() => void togglePlayPause()} disabled={!selectedVideo}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button className="button" type="button" onClick={() => void startSegmentPlayback()} disabled={!selectedVideo || segments.length === 0}>
        Nur Segmente abspielen
      </button>
      <button className="button" type="button" onClick={jumpToPreviousSegment} disabled={segments.length === 0}>
        Voriges Segment
      </button>
      <button className="button" type="button" onClick={jumpToNextSegment} disabled={segments.length === 0}>
        Nächstes Segment
      </button>
    </div>
  )

  const frameNavControls = (
    <div className="controls-row frame-nav-controls" role="group" aria-label="Bildnavigation">
      <span className="frame-nav-controls__label">Bildnavigation</span>
      <button
        className="button button--subtle frame-nav-controls__btn"
        type="button"
        onClick={() => jumpBySeconds(-SEEK_STEP_SECONDS)}
        disabled={!selectedVideo}
        title={`${SEEK_STEP_SECONDS} Sekunden zurück (Shift+←)`}
      >
        &laquo;&thinsp;{SEEK_STEP_SECONDS}s
      </button>
      <button
        className="button button--subtle frame-nav-controls__btn"
        type="button"
        onClick={() => stepFrame('backward')}
        disabled={!selectedVideo}
        title="Ein Bild zurück (,)"
      >
        &#x23EE;
      </button>
      <button
        className="button button--subtle frame-nav-controls__btn"
        type="button"
        onClick={() => stepFrame('forward')}
        disabled={!selectedVideo}
        title="Ein Bild vor (.)"
      >
        &#x23ED;
      </button>
      <button
        className="button button--subtle frame-nav-controls__btn"
        type="button"
        onClick={() => jumpBySeconds(SEEK_STEP_SECONDS)}
        disabled={!selectedVideo}
        title={`${SEEK_STEP_SECONDS} Sekunden vor (Shift+→)`}
      >
        {SEEK_STEP_SECONDS}s&thinsp;&raquo;
      </button>
      <button
        className="button button--subtle frame-nav-controls__btn"
        type="button"
        onClick={jumpToPreviousKeyframe}
        disabled={!selectedVideo || keyframeTimes.length === 0}
        title="Zum vorherigen Keyframe ([)"
      >
        &#x23EE;&#x25CE;
      </button>
      <button
        className="button button--subtle frame-nav-controls__btn"
        type="button"
        onClick={jumpToNextKeyframe}
        disabled={!selectedVideo || keyframeTimes.length === 0}
        title="Zum nächsten Keyframe (])"
      >
        &#x25CE;&#x23ED;
      </button>
    </div>
  )

  const speedControls = (
    <div className="controls-row speed-controls" role="group" aria-label="Wiedergabegeschwindigkeit">
      <span className="speed-controls__label">Geschwindigkeit</span>
      <button
        className="button button--subtle speed-controls__step"
        type="button"
        onClick={() => adjustPlaybackRate('slower')}
        disabled={!selectedVideo || playbackRate <= PLAYBACK_RATES[0]}
        title="Langsamer (&lt;)"
        aria-label="Langsamer"
      >
        ◀
      </button>
      {PLAYBACK_RATES.map((rate) => (
        <button
          key={rate}
          className={`button speed-controls__rate${playbackRate === rate ? ' button--primary speed-controls__rate--active' : ' button--subtle'}`}
          type="button"
          onClick={() => changePlaybackRate(rate)}
          disabled={!selectedVideo}
          title={`Geschwindigkeit: ${formatRate(rate)}`}
          aria-pressed={playbackRate === rate}
        >
          {formatRate(rate)}
        </button>
      ))}
      <button
        className="button button--subtle speed-controls__step"
        type="button"
        onClick={() => adjustPlaybackRate('faster')}
        disabled={!selectedVideo || playbackRate >= PLAYBACK_RATES[PLAYBACK_RATES.length - 1]}
        title="Schneller (&gt;)"
        aria-label="Schneller"
      >
        ▶
      </button>
    </div>
  )

  const utilityControls = (
    <div className="controls-row player-controls__utility">
      <button
        className={`button button--subtle${filterOverlayVisible ? ' button--active' : ''}`}
        type="button"
        onClick={onToggleFilterOverlay}
        disabled={!selectedVideo}
        title={filterOverlayVisible ? 'Filter ausblenden (F)' : 'Filter einblenden (F)'}
      >
        Filter
      </button>
      <button
        className="button button--subtle"
        type="button"
        onClick={() => void toggleFullscreen()}
        disabled={!selectedVideo}
        title={isFullscreen ? 'Vollbild beenden (F11)' : 'Vollbild (F11)'}
      >
        {isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
      </button>
    </div>
  )

  const assistRow = (
    <div className="player-assist-row">
      <span className="player-assist-pill">{segments.length} Segment{segments.length !== 1 ? 'e' : ''} verfügbar</span>
      <details className="shortcut-list">
        <summary className="player-assist-pill shortcut-list__toggle">Tastenkürzel</summary>
        <div className="shortcut-list__grid">
          <kbd>Leertaste</kbd><span>Play / Pause</span>
          <kbd>← →</kbd><span>Voriges / Nächstes Segment</span>
          <kbd>Shift+← →</kbd><span>{SEEK_STEP_SECONDS} Sekunden zurück / vor</span>
          <kbd>, .</kbd><span>Ein Bild zurück / vor</span>
          <kbd>&lt; &gt;</kbd><span>Langsamer / Schneller</span>
          <kbd>N</kbd><span>Nur Segmente abspielen</span>
          <kbd>F</kbd><span>Filter ein-/ausblenden</span>
          <kbd>R</kbd><span>Einzelwiederholung umschalten</span>
          <kbd>Z</kbd><span>Zoom-Steuerung ein-/ausblenden</span>
          <kbd>F11</kbd><span>Vollbild</span>
          <kbd>+ −</kbd><span>Zoom vergrößern / verkleinern</span>
          <kbd>0</kbd><span>Zoom zurücksetzen</span>
        </div>
      </details>
    </div>
  )

  const playbackHint = selectedVideo?.playbackHint ? (
    <div className="playback-note" role="note">
      <span className="playback-note__icon" aria-hidden="true">i</span>
      <span>{selectedVideo.playbackHint}</span>
    </div>
  ) : null

  const repeatToggle = (
    <label
      className="toggle-row"
      title="Aktives Segment endlos wiederholen, statt automatisch zur nächsten Szene zu wechseln"
    >
      <input
        type="checkbox"
        checked={repeatSingleSegment}
        onChange={(event) => onRepeatSingleSegmentChange(event.target.checked)}
        disabled={segments.length === 0}
      />
      <span>Segment endlos wiederholen</span>
      <kbd className="toggle-row__hint">R</kbd>
    </label>
  )

  const timeRow = (
    <div className="time-row">
      <span>{formatClockTime(currentTime)}</span>
      <span>{formatClockTime(duration)}</span>
    </div>
  )

  const errorBanner = playbackRecoveryInProgress
    ? <p className="player-info-banner">Video wird für die Wiedergabe umgewandelt… Bitte einen Moment warten.</p>
    : videoError ? <p className="player-error-banner">{videoError}</p> : null

  const timeline = (
    <SegmentTimeline
      duration={duration}
      currentTime={currentTime}
      activeSegmentIndex={activeSegmentIndex}
      segments={segments}
      onSeek={seekTo}
    />
  )

  const segmentList = (
    <SegmentList segments={segments} activeSegmentIndex={activeSegmentIndex} onSelectSegment={jumpToSegment} />
  )

  const zoomDockInner = selectedVideo ? (
    <>
      <div className="video-stage__zoom-actions">
        <button aria-label="Zoom verkleinern" className="icon-button video-stage__zoom-button" type="button" onClick={() => handleZoomStep('out')} disabled={zoomLevel <= MIN_ZOOM_LEVEL}>
          -
        </button>
        <input
          aria-label="Zoomstufe"
          className="video-stage__zoom-slider"
          type="range"
          min={MIN_ZOOM_LEVEL}
          max={MAX_ZOOM_LEVEL}
          step={ZOOM_STEP}
          value={zoomLevel}
          onChange={(event) => handleZoomSliderChange(Number(event.target.value))}
        />
        <button aria-label="Zoom vergroessern" className="icon-button video-stage__zoom-button" type="button" onClick={() => handleZoomStep('in')} disabled={zoomLevel >= MAX_ZOOM_LEVEL}>
          +
        </button>
        <button className="button button--subtle video-stage__zoom-reset" type="button" onClick={resetZoom} disabled={!isZoomed}>
          Reset
        </button>
      </div>
      <p className="video-stage__zoom-hint" key={isZoomed ? 'zoomed' : 'idle'}>
        {isZoomed ? 'Ziehen verschiebt den Ausschnitt. Doppelklick oder Reset stellt die Gesamtansicht wieder her.' : 'Mausrad, Plus/Minus oder Doppelklick zoomen direkt auf den gewählten Bereich.'}
      </p>
    </>
  ) : null

  const zoomControls = (selectedVideo && showZoomDock && !isFullscreen) ? (
    <div className="video-stage__zoom-dock" role="group" aria-label="Video-Zoom">
      <div className="video-stage__zoom-summary">
        <span className="video-stage__zoom-label" title="Zoom-Anzeige (Z: ein-/ausblenden)">Zoom</span>
        <strong>{zoomLevel.toFixed(2)}x</strong>
        <button
          type="button"
          className="video-stage__zoom-close"
          aria-label="Zoom-Anzeige ausblenden"
          title="Ausblenden (Z)"
          onClick={() => setShowZoomDock(false)}
        >
          ×
        </button>
      </div>
      {zoomDockInner}
    </div>
  ) : null

  const zoomControlsPanel = selectedVideo ? (
    <div className="video-stage__zoom-dock video-stage__zoom-dock--panel" role="group" aria-label="Video-Zoom">
      <div className="video-stage__zoom-summary">
        <span className="video-stage__zoom-label">Zoom</span>
        <strong>{zoomLevel.toFixed(2)}x</strong>
      </div>
      {zoomDockInner}
    </div>
  ) : null

  const zoomBadge = (selectedVideo && !showZoomDock && !isFullscreen) ? (
    <button
      type="button"
      className="video-stage__zoom-badge"
      onClick={() => setShowZoomDock(true)}
      title="Zoom-Steuerung einblenden (Z)"
      aria-label="Zoom-Steuerung einblenden"
    >
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      Zoom
    </button>
  ) : null

  const fullscreenFlyouts = isFullscreen ? (
    <div className="fullscreen-flyouts" data-testid="fullscreen-flyout-shell">
      <button
        aria-controls="fullscreen-flyout-top"
        aria-expanded={activeFullscreenFlyout === 'top'}
        aria-label="Info einblenden"
        className="fullscreen-edge-trigger fullscreen-edge-trigger--top"
        type="button"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('top')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('top')}
        onFocus={() => handleFullscreenFlyoutMouseEnter('top')}
        onBlur={() => handleFullscreenFlyoutMouseLeave('top')}
        onClick={() => toggleFullscreenFlyout('top')}
      >
        Info
      </button>
      <div
        className={`fullscreen-flyout-panel fullscreen-flyout-panel--top ${activeFullscreenFlyout === 'top' ? 'fullscreen-flyout-panel--open' : ''}`}
        id="fullscreen-flyout-top"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('top')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('top')}
      >
        <div className="fullscreen-card">
          {playerHeader}
          {assistRow}
          {playbackHint}
        </div>
      </div>

      <button
        aria-controls="fullscreen-flyout-left"
        aria-expanded={activeFullscreenFlyout === 'left'}
        aria-label="Segmente einblenden"
        className="fullscreen-edge-trigger fullscreen-edge-trigger--left"
        type="button"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('left')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('left')}
        onFocus={() => handleFullscreenFlyoutMouseEnter('left')}
        onBlur={() => handleFullscreenFlyoutMouseLeave('left')}
        onClick={() => toggleFullscreenFlyout('left')}
      >
        Segmente
      </button>
      <div
        className={`fullscreen-flyout-panel fullscreen-flyout-panel--left ${activeFullscreenFlyout === 'left' ? 'fullscreen-flyout-panel--open' : ''}`}
        id="fullscreen-flyout-left"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('left')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('left')}
      >
        {segmentList}
      </div>

      <button
        aria-controls="fullscreen-flyout-right"
        aria-expanded={activeFullscreenFlyout === 'right'}
        aria-label="Werkzeuge einblenden"
        className="fullscreen-edge-trigger fullscreen-edge-trigger--right"
        type="button"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('right')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('right')}
        onFocus={() => handleFullscreenFlyoutMouseEnter('right')}
        onBlur={() => handleFullscreenFlyoutMouseLeave('right')}
        onClick={() => toggleFullscreenFlyout('right')}
      >
        Werkzeuge
      </button>
      <div
        className={`fullscreen-flyout-panel fullscreen-flyout-panel--right ${activeFullscreenFlyout === 'right' ? 'fullscreen-flyout-panel--open' : ''}`}
        data-testid="fullscreen-flyout-right-panel"
        id="fullscreen-flyout-right"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('right')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('right')}
      >
        <div className="fullscreen-card fullscreen-card--stacked">
          <div className="controls-row player-controls__utility">
            <button
              className="button button--subtle"
              type="button"
              onClick={() => void toggleFullscreen()}
              disabled={!selectedVideo}
              title="Vollbild beenden (F11)"
            >
              Vollbild beenden
            </button>
          </div>
          {zoomControlsPanel}
          {repeatToggle}
          {errorBanner}
          <div className="fullscreen-filter-slot">
            {isValidElement<{ visible: boolean }>(children)
              ? cloneElement(children, { visible: true })
              : children}
          </div>
        </div>
      </div>

      <button
        aria-controls="fullscreen-flyout-bottom"
        aria-expanded={activeFullscreenFlyout === 'bottom'}
        aria-label="Wiedergabe und Timeline einblenden"
        className="fullscreen-edge-trigger fullscreen-edge-trigger--bottom"
        type="button"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('bottom')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('bottom')}
        onFocus={() => handleFullscreenFlyoutMouseEnter('bottom')}
        onBlur={() => handleFullscreenFlyoutMouseLeave('bottom')}
        onClick={() => toggleFullscreenFlyout('bottom')}
      >
        Steuerung
      </button>
      <div
        className={`fullscreen-flyout-panel fullscreen-flyout-panel--bottom ${activeFullscreenFlyout === 'bottom' ? 'fullscreen-flyout-panel--open' : ''}`}
        id="fullscreen-flyout-bottom"
        onMouseEnter={() => handleFullscreenFlyoutMouseEnter('bottom')}
        onMouseLeave={() => handleFullscreenFlyoutMouseLeave('bottom')}
      >
        <div className="fullscreen-card fullscreen-card--stacked">
          <div className="player-controls player-controls--fullscreen">
            {transportControls}
          </div>
          {frameNavControls}
          {speedControls}
          {timeRow}
          {timeline}
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="workspace-stack">
      <section className={`panel player-panel ${isFullscreen ? 'player-panel--fullscreen' : ''}`} ref={playerPanelRef}>
        {!isFullscreen ? playerHeader : null}

        <div className={`video-stage ${isFullscreen ? 'video-stage--fullscreen' : ''}`}>
          {selectedVideo ? (
            <>
              <div
                className={`video-stage__viewport ${isZoomed ? 'video-stage__viewport--zoomed' : ''} ${isPanningZoom ? 'video-stage__viewport--panning' : ''}`}
                data-testid="video-zoom-viewport"
                ref={videoStageViewportRef}
                onDoubleClick={handleVideoStageDoubleClick}
                onPointerCancel={handleZoomPointerCancel}
                onPointerDown={handleZoomPointerDown}
                onPointerMove={handleZoomPointerMove}
                onPointerUp={handleZoomPointerUp}
                onWheel={handleVideoStageWheel}
              >
                <div
                  className="video-stage__canvas"
                  data-testid="video-zoom-canvas"
                  style={{
                    left: `${fittedVideoRect.left}px`,
                    top: `${fittedVideoRect.top}px`,
                    width: `${fittedVideoRect.width}px`,
                    height: `${fittedVideoRect.height}px`,
                    transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px)`
                  }}
                >
                  <div
                    className="video-stage__content"
                    data-testid="video-zoom-content"
                    style={{ transform: `scale(${zoomLevel})` }}
                  >
                    <video
                      key={selectedVideo.fileUrl}
                      className={`video-stage__video ${isZoomed ? 'video-stage__video--zoomed' : ''}`}
                      controls={false}
                      preload="auto"
                      ref={videoRef}
                      src={streamUrl ?? selectedVideo.fileUrl}
                      style={{ filter: buildCssFilter(filterSettings) }}
                      onCanPlay={handleCanPlay}
                      onLoadedMetadata={handleMetadataLoaded}
                      onError={handleVideoError}
                      onTimeUpdate={handleTimeUpdate}
                      onPause={() => setIsPlaying(false)}
                      onPlay={() => setIsPlaying(true)}
                      onEnded={() => {
                        setIsPlaying(false)
                        setIsSegmentMode(false)
                        setSequenceIndex(-1)
                        onVideoEnded?.()
                      }}
                    />
                  </div>
                </div>
              </div>
              {zoomControls}
              {zoomBadge}
              {!isFullscreen ? children : null}
            </>
          ) : (
            <div className="video-stage__empty">
              <h3>Kein Video geladen</h3>
              <p>Nach dem Laden eines Videos erscheinen hier Wiedergabe, Filter-Overlay und Segmentnavigation.</p>
            </div>
          )}
        </div>

        {!isFullscreen ? (
          <>
            {timeline}
            <div className="player-controls" data-testid="player-inline-controls">
              {transportControls}
              {utilityControls}
            </div>
            {frameNavControls}
            {speedControls}

            {assistRow}
            {playbackHint}
            {repeatToggle}
            {timeRow}
            {errorBanner}
            {overlayDialogs}
          </>
        ) : (
          <>
            {fullscreenFlyouts}
            {overlayDialogs}
          </>
        )}

      </section>

      {!isFullscreen ? segmentList : null}
    </div>
  )
}

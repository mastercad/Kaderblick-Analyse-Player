import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VideoFileDescriptor } from '../../../../common/types'
import { MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL, ZOOM_STEP } from './playerTypes'
import type { Point, Size, VideoRect } from './playerTypes'
import {
  clamp,
  clampZoomOffset,
  ensureFinitePoint,
  getFittedVideoRect,
  roundZoomLevel
} from './playerUtils'

interface UseZoomOptions {
  videoStageViewportRef: RefObject<HTMLDivElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  selectedVideo: VideoFileDescriptor | undefined
  isFullscreen: boolean
  isInterstitialActiveRef: RefObject<boolean>
}

export function useZoom({ videoStageViewportRef, videoRef, selectedVideo, isFullscreen, isInterstitialActiveRef }: UseZoomOptions) {
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM_LEVEL)
  const [zoomOffset, setZoomOffset] = useState<Point>({ x: 0, y: 0 })
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })
  const [videoIntrinsicSize, setVideoIntrinsicSize] = useState<Size | null>(null)
  const [isPanningZoom, setIsPanningZoom] = useState(false)
  const [showZoomDock, setShowZoomDock] = useState(false)
  const zoomDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffset: Point
  } | null>(null)
  const previousLayoutRef = useRef<{ viewport: Size; fittedRect: VideoRect; zoomLevel: number } | null>(null)

  const fittedVideoRect = getFittedVideoRect(viewportSize, videoIntrinsicSize)
  const isZoomed = zoomLevel > MIN_ZOOM_LEVEL

  // Reset all zoom state when a different video file is opened
  useEffect(() => {
    setZoomLevel(MIN_ZOOM_LEVEL)
    setZoomOffset({ x: 0, y: 0 })
    setViewportSize({ width: 0, height: 0 })
    setVideoIntrinsicSize(null)
    zoomDragRef.current = null
    setIsPanningZoom(false)
    setShowZoomDock(false)
  }, [selectedVideo?.path])

  // Measure the viewport whenever the video or fullscreen state changes
  useEffect(() => {
    const viewport = videoStageViewportRef.current
    if (!viewport) return

    const measureViewport = (): void => {
      const rect = viewport.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }

    measureViewport()
    let firstLayoutFrame = requestAnimationFrame(() => {
      firstLayoutFrame = 0
      secondLayoutFrame = requestAnimationFrame(measureViewport)
    })
    let secondLayoutFrame = 0

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureViewport())
      resizeObserver.observe(viewport)
    }

    window.addEventListener('resize', measureViewport)
    return () => {
      if (firstLayoutFrame) cancelAnimationFrame(firstLayoutFrame)
      if (secondLayoutFrame) cancelAnimationFrame(secondLayoutFrame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measureViewport)
    }
  }, [selectedVideo?.fileUrl, isFullscreen])

  useLayoutEffect(() => {
    const nextLayout = { viewport: viewportSize, fittedRect: fittedVideoRect, zoomLevel }
    const previousLayout = previousLayoutRef.current
    previousLayoutRef.current = nextLayout

    if (fittedVideoRect.width <= 0 || fittedVideoRect.height <= 0) return
    if (zoomLevel <= MIN_ZOOM_LEVEL) {
      setZoomOffset({ x: 0, y: 0 })
      return
    }

    const viewportChanged = previousLayout && (
      previousLayout.viewport.width !== viewportSize.width ||
      previousLayout.viewport.height !== viewportSize.height ||
      previousLayout.fittedRect.width !== fittedVideoRect.width ||
      previousLayout.fittedRect.height !== fittedVideoRect.height
    )

    setZoomOffset((currentOffset) => {
      if (!viewportChanged || previousLayout.fittedRect.width <= 0 || previousLayout.fittedRect.height <= 0) {
        return ensureFinitePoint(clampZoomOffset(currentOffset, zoomLevel, viewportSize, fittedVideoRect))
      }

      const focalPoint = {
        x: (
          previousLayout.viewport.width / 2 -
          previousLayout.fittedRect.left -
          currentOffset.x
        ) / (previousLayout.fittedRect.width * previousLayout.zoomLevel),
        y: (
          previousLayout.viewport.height / 2 -
          previousLayout.fittedRect.top -
          currentOffset.y
        ) / (previousLayout.fittedRect.height * previousLayout.zoomLevel)
      }
      const remappedOffset = {
        x: viewportSize.width / 2 - fittedVideoRect.left - focalPoint.x * fittedVideoRect.width * zoomLevel,
        y: viewportSize.height / 2 - fittedVideoRect.top - focalPoint.y * fittedVideoRect.height * zoomLevel
      }
      return ensureFinitePoint(clampZoomOffset(remappedOffset, zoomLevel, viewportSize, fittedVideoRect))
    })
  }, [
    viewportSize.width,
    viewportSize.height,
    fittedVideoRect.left,
    fittedVideoRect.top,
    fittedVideoRect.width,
    fittedVideoRect.height,
    zoomLevel
  ])

  // --- internal helpers ---

  const resolveViewportPointFromClientPoint = (clientX: number, clientY: number): Point | null => {
    const viewport = videoStageViewportRef.current
    if (!viewport) return null
    const rect = viewport.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height)
    }
  }

  const getLiveViewportMetrics = (): { viewport: Size; fittedRect: VideoRect } | null => {
    const viewport = videoStageViewportRef.current
    if (!viewport) return null
    const rect = viewport.getBoundingClientRect()
    const nextViewport = { width: rect.width, height: rect.height }
    if (nextViewport.width <= 0 || nextViewport.height <= 0) return null
    const intrinsicSize =
      videoIntrinsicSize ??
      (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0
        ? { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight }
        : null)
    return { viewport: nextViewport, fittedRect: getFittedVideoRect(nextViewport, intrinsicSize) }
  }

  // --- public zoom operations ---

  const zoomToViewportPoint = (nextZoomLevel: number, viewportPoint?: Point): void => {
    const metrics = getLiveViewportMetrics()
    const clampedZoomLevel = roundZoomLevel(clamp(nextZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL))

    if (clampedZoomLevel <= MIN_ZOOM_LEVEL || !metrics || metrics.fittedRect.width <= 0 || metrics.fittedRect.height <= 0) {
      setZoomLevel(MIN_ZOOM_LEVEL)
      setZoomOffset({ x: 0, y: 0 })
      zoomDragRef.current = null
      setIsPanningZoom(false)
      return
    }

    const { viewport, fittedRect } = metrics
    const anchor = viewportPoint ?? { x: viewport.width / 2, y: viewport.height / 2 }
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

  const resetZoom = (): void => zoomToViewportPoint(MIN_ZOOM_LEVEL)

  const handleZoomStep = (direction: 'in' | 'out'): void => {
    zoomToViewportPoint(zoomLevel + (direction === 'in' ? ZOOM_STEP : -ZOOM_STEP))
  }

  const handleZoomSliderChange = (nextValue: number): void => {
    zoomToViewportPoint(nextValue)
  }

  const applyWheelZoom = (clientX: number, clientY: number, deltaY: number): void => {
    const zoomDelta = deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
    zoomToViewportPoint(zoomLevel + zoomDelta, resolveViewportPointFromClientPoint(clientX, clientY) ?? undefined)
  }

  // Native (non-passive) wheel listener — required to call preventDefault on scroll-to-zoom
  const onNativeVideoStageWheel = useEffectEvent((event: WheelEvent): void => {
    if (!selectedVideo || isInterstitialActiveRef.current) return
    event.preventDefault()
    event.stopPropagation()
    applyWheelZoom(event.clientX, event.clientY, event.deltaY)
  })

  useEffect(() => {
    const viewport = videoStageViewportRef.current
    if (!viewport || !selectedVideo) return
    const handleWheel = (event: WheelEvent): void => onNativeVideoStageWheel(event)
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [onNativeVideoStageWheel, selectedVideo?.fileUrl])

  // --- React event handlers (used as JSX props in VideoWorkspace) ---

  const handleVideoStageWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (!selectedVideo) return
    event.preventDefault()
    event.stopPropagation()
    applyWheelZoom(event.clientX, event.clientY, event.deltaY)
  }

  const handleVideoStageDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!selectedVideo) return
    const viewportPoint = resolveViewportPointFromClientPoint(event.clientX, event.clientY)
    if (isZoomed) {
      resetZoom()
      return
    }
    zoomToViewportPoint(2, viewportPoint ?? undefined)
  }

  const stopZoomPan = (pointerId?: number): void => {
    if (pointerId !== undefined) {
      videoStageViewportRef.current?.releasePointerCapture(pointerId)
    }
    zoomDragRef.current = null
    setIsPanningZoom(false)
  }

  const handleZoomPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!selectedVideo || !isZoomed) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
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
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !metrics) return
    event.preventDefault()
    const { viewport, fittedRect } = metrics
    const nextOffset = {
      x: activeDrag.startOffset.x + (event.clientX - activeDrag.startClientX),
      y: activeDrag.startOffset.y + (event.clientY - activeDrag.startClientY)
    }
    setZoomOffset(ensureFinitePoint(clampZoomOffset(nextOffset, zoomLevel, viewport, fittedRect)))
  }

  const handleZoomPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (zoomDragRef.current?.pointerId !== event.pointerId) return
    stopZoomPan(event.pointerId)
  }

  const handleZoomPointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (zoomDragRef.current?.pointerId !== event.pointerId) return
    stopZoomPan(event.pointerId)
  }

  return {
    zoomLevel,
    zoomOffset,
    viewportSize,
    videoIntrinsicSize,
    setVideoIntrinsicSize,
    isPanningZoom,
    showZoomDock,
    setShowZoomDock,
    fittedVideoRect,
    isZoomed,
    zoomToViewportPoint,
    resetZoom,
    handleZoomStep,
    handleZoomSliderChange,
    handleVideoStageWheel,
    handleVideoStageDoubleClick,
    handleZoomPointerDown,
    handleZoomPointerMove,
    handleZoomPointerUp,
    handleZoomPointerCancel
  }
}

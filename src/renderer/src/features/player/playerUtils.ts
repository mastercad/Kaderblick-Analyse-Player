import type { VideoFileDescriptor } from '../../../../common/types'
import { MIN_ZOOM_LEVEL } from './playerTypes'
import type { Point, Size, VideoRect } from './playerTypes'

export const formatRate = (rate: number): string => {
  if (rate === 0.25) return '¼×'
  if (rate === 0.5) return '½×'
  if (rate === 0.75) return '¾×'
  if (rate === 1) return 'Normal'
  if (rate === 1.25) return '1¼×'
  if (rate === 1.5) return '1½×'
  if (rate === 2) return '2×'
  return `${rate}×`
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const roundZoomLevel = (value: number): number =>
  Math.round(value * 100) / 100

export const ensureFinitePoint = (point: Point): Point => ({
  x: Number.isFinite(point.x) ? point.x : 0,
  y: Number.isFinite(point.y) ? point.y : 0
})

export const getFittedVideoRect = (viewportSize: Size, intrinsicSize: Size | null): VideoRect => {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  if (!intrinsicSize || intrinsicSize.width <= 0 || intrinsicSize.height <= 0) {
    return { left: 0, top: 0, width: viewportSize.width, height: viewportSize.height }
  }
  const scale = Math.min(
    viewportSize.width / intrinsicSize.width,
    viewportSize.height / intrinsicSize.height
  )
  const width = intrinsicSize.width * scale
  const height = intrinsicSize.height * scale
  return {
    left: (viewportSize.width - width) / 2,
    top: (viewportSize.height - height) / 2,
    width,
    height
  }
}

export const clampZoomOffset = (
  offset: Point,
  zoomLevel: number,
  viewportSize: Size,
  fittedVideoRect: VideoRect
): Point => {
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

export const getMediaErrorMessage = (
  video: HTMLVideoElement,
  selectedVideo?: VideoFileDescriptor
): string => {
  const fileName = selectedVideo?.fileName ?? 'Das Video'
  if (!video.error) return `${fileName} konnte nicht geladen werden.`
  switch (video.error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return `${fileName} wurde während des Ladevorgangs abgebrochen.`
    case MediaError.MEDIA_ERR_NETWORK:
      return `${fileName} konnte wegen eines Datei- oder Netzwerkfehlers nicht gelesen werden.`
    case MediaError.MEDIA_ERR_DECODE:
      return `${fileName} konnte nicht decodiert werden. Das Dateiformat oder der verwendete Codec wird nicht unterstützt.`
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return `${fileName} wird nicht unterstützt oder die Datei ist nicht lesbar.`
    default:
      return `${fileName} konnte nicht geladen werden.`
  }
}

export const getMissingVideoTrackMessage = (selectedVideo?: VideoFileDescriptor): string => {
  const fileName = selectedVideo?.fileName ?? 'Die Datei'
  return `${fileName} enthält keine abspielbare Videospur. Möglicherweise wird der Videocodec nicht unterstützt.`
}

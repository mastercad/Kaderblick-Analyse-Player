import { describe, it, expect } from 'vitest'
import {
  formatRate,
  clamp,
  roundZoomLevel,
  ensureFinitePoint,
  getFittedVideoRect,
  clampZoomOffset,
  getMediaErrorMessage,
  getMissingVideoTrackMessage
} from './playerUtils'
import { MIN_ZOOM_LEVEL } from './playerTypes'
import type { VideoFileDescriptor } from '../../../../common/types'

// W3C MediaError codes (mirrored from setup.ts / window.MediaError)
const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

// ---------------------------------------------------------------------------
// formatRate
// ---------------------------------------------------------------------------

describe('formatRate', () => {
  it.each([
    [0.25, '¼×'],
    [0.5, '½×'],
    [0.75, '¾×'],
    [1, 'Normal'],
    [1.25, '1¼×'],
    [1.5, '1½×'],
    [2, '2×']
  ])('formats %s to "%s"', (rate, expected) => {
    expect(formatRate(rate)).toBe(expected)
  })

  it('falls back to "{rate}×" for unknown rates', () => {
    expect(formatRate(3)).toBe('3×')
    expect(formatRate(0.1)).toBe('0.1×')
  })
})

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps to min when value is below', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('clamps to max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('returns min when value exactly equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0)
  })

  it('returns max when value exactly equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// roundZoomLevel
// ---------------------------------------------------------------------------

describe('roundZoomLevel', () => {
  it('rounds down to 2 decimal places', () => {
    expect(roundZoomLevel(1.254)).toBe(1.25)
  })

  it('rounds up to 2 decimal places', () => {
    // 1.256 * 100 = 125.6 → Math.round = 126 → 1.26
    expect(roundZoomLevel(1.256)).toBe(1.26)
  })

  it('leaves an integer value unchanged', () => {
    expect(roundZoomLevel(1)).toBe(1)
    expect(roundZoomLevel(4)).toBe(4)
  })

  it('handles values already at 2 decimal places', () => {
    expect(roundZoomLevel(2.75)).toBe(2.75)
  })
})

// ---------------------------------------------------------------------------
// ensureFinitePoint
// ---------------------------------------------------------------------------

describe('ensureFinitePoint', () => {
  it('passes through finite points unchanged', () => {
    expect(ensureFinitePoint({ x: 5, y: -3 })).toEqual({ x: 5, y: -3 })
  })

  it('replaces NaN x with 0', () => {
    expect(ensureFinitePoint({ x: NaN, y: 2 })).toEqual({ x: 0, y: 2 })
  })

  it('replaces NaN y with 0', () => {
    expect(ensureFinitePoint({ x: 2, y: NaN })).toEqual({ x: 2, y: 0 })
  })

  it('replaces +Infinity with 0', () => {
    expect(ensureFinitePoint({ x: Infinity, y: 5 })).toEqual({ x: 0, y: 5 })
  })

  it('replaces -Infinity with 0', () => {
    expect(ensureFinitePoint({ x: 5, y: -Infinity })).toEqual({ x: 5, y: 0 })
  })

  it('replaces both NaN with 0', () => {
    expect(ensureFinitePoint({ x: NaN, y: NaN })).toEqual({ x: 0, y: 0 })
  })
})

// ---------------------------------------------------------------------------
// getFittedVideoRect
// ---------------------------------------------------------------------------

describe('getFittedVideoRect', () => {
  it('returns a zero rect when viewport width is 0', () => {
    expect(getFittedVideoRect({ width: 0, height: 200 }, { width: 1920, height: 1080 }))
      .toEqual({ left: 0, top: 0, width: 0, height: 0 })
  })

  it('returns a zero rect when viewport height is 0', () => {
    expect(getFittedVideoRect({ width: 400, height: 0 }, { width: 1920, height: 1080 }))
      .toEqual({ left: 0, top: 0, width: 0, height: 0 })
  })

  it('fills the viewport when intrinsicSize is null', () => {
    expect(getFittedVideoRect({ width: 400, height: 200 }, null))
      .toEqual({ left: 0, top: 0, width: 400, height: 200 })
  })

  it('fills the viewport when intrinsicSize has zero width', () => {
    expect(getFittedVideoRect({ width: 400, height: 200 }, { width: 0, height: 1080 }))
      .toEqual({ left: 0, top: 0, width: 400, height: 200 })
  })

  it('fills the viewport when intrinsicSize has zero height', () => {
    expect(getFittedVideoRect({ width: 400, height: 200 }, { width: 1920, height: 0 }))
      .toEqual({ left: 0, top: 0, width: 400, height: 200 })
  })

  it('letterboxes a wide video in a taller viewport (horizontal bars top/bottom)', () => {
    // 1920×1080 in 400×300: scale = min(400/1920, 300/1080) = min(0.208, 0.278) = 0.208
    // → width=400, height=225, left=0, top=37.5
    const rect = getFittedVideoRect({ width: 400, height: 300 }, { width: 1920, height: 1080 })
    expect(rect.width).toBeCloseTo(400)
    expect(rect.height).toBeCloseTo(225)
    expect(rect.left).toBeCloseTo(0)
    expect(rect.top).toBeCloseTo(37.5)
  })

  it('pillarboxes a tall video in a wider viewport (vertical bars left/right)', () => {
    // 1080×1920 in 400×300: scale = min(400/1080, 300/1920) = min(0.370, 0.156) = 0.156
    // → width=168.75, height=300, left=115.625, top=0
    const rect = getFittedVideoRect({ width: 400, height: 300 }, { width: 1080, height: 1920 })
    expect(rect.height).toBeCloseTo(300)
    expect(rect.width).toBeCloseTo(168.75)
    expect(rect.left).toBeCloseTo(115.625)
    expect(rect.top).toBeCloseTo(0)
  })

  it('produces zero margins when aspect ratios match exactly', () => {
    expect(getFittedVideoRect({ width: 400, height: 200 }, { width: 400, height: 200 }))
      .toEqual({ left: 0, top: 0, width: 400, height: 200 })
  })
})

// ---------------------------------------------------------------------------
// clampZoomOffset
// ---------------------------------------------------------------------------

describe('clampZoomOffset', () => {
  // Viewport 400×200, video perfectly fills it (no letterbox/pillarbox)
  const viewport = { width: 400, height: 200 }
  const fittedRect = { left: 0, top: 0, width: 400, height: 200 }
  // At zoom=2: scaledW=800, scaledH=400 → valid x ∈ [-400,0], y ∈ [-200,0]

  // Pillarboxed rect where left>0 and top>0 to avoid -0 in maxX/maxY
  // viewport=400×200, left=50, top=25, w=300, h=150
  // zoom=2: scaledW=600, scaledH=300 → minX=-250, maxX=-50, minY=-125, maxY=-25
  const rectWithMargins = { left: 50, top: 25, width: 300, height: 150 }

  it('returns {0,0} when zoomLevel equals MIN_ZOOM_LEVEL', () => {
    expect(clampZoomOffset({ x: 100, y: 100 }, MIN_ZOOM_LEVEL, viewport, fittedRect))
      .toEqual({ x: 0, y: 0 })
  })

  it('returns {0,0} when fittedRect has zero width', () => {
    expect(clampZoomOffset({ x: 50, y: 50 }, 2, viewport, { left: 0, top: 0, width: 0, height: 200 }))
      .toEqual({ x: 0, y: 0 })
  })

  it('returns {0,0} when fittedRect has zero height', () => {
    expect(clampZoomOffset({ x: 50, y: 50 }, 2, viewport, { left: 0, top: 0, width: 400, height: 0 }))
      .toEqual({ x: 0, y: 0 })
  })

  it('leaves offset unchanged when within valid bounds', () => {
    expect(clampZoomOffset({ x: -100, y: -50 }, 2, viewport, fittedRect))
      .toEqual({ x: -100, y: -50 })
  })

  it('clamps x to maxX when offset.x exceeds the upper bound', () => {
    // x=0 > maxX=-50 → clamped to -50
    expect(clampZoomOffset({ x: 0, y: -80 }, 2, viewport, rectWithMargins))
      .toEqual({ x: -50, y: -80 })
  })

  it('clamps x to minX (-400) when offset.x is too negative', () => {
    expect(clampZoomOffset({ x: -500, y: -50 }, 2, viewport, fittedRect))
      .toEqual({ x: -400, y: -50 })
  })

  it('clamps y to maxY when offset.y exceeds the upper bound', () => {
    // y=0 > maxY=-25 → clamped to -25
    expect(clampZoomOffset({ x: -100, y: 0 }, 2, viewport, rectWithMargins))
      .toEqual({ x: -100, y: -25 })
  })

  it('clamps y to minY (-200) when offset.y is too negative', () => {
    expect(clampZoomOffset({ x: -100, y: -300 }, 2, viewport, fittedRect))
      .toEqual({ x: -100, y: -200 })
  })
})

// ---------------------------------------------------------------------------
// getMediaErrorMessage
// ---------------------------------------------------------------------------

describe('getMediaErrorMessage', () => {
  const selectedVideo = { fileName: 'mein-film.mp4' } as VideoFileDescriptor

  const makeVideoEl = (code?: number): HTMLVideoElement => {
    const el = document.createElement('video')
    if (code !== undefined) {
      Object.defineProperty(el, 'error', { value: { code } as MediaError, configurable: true })
    }
    return el
  }

  it('returns a generic fallback when video.error is null', () => {
    // A freshly created <video> has error=null
    expect(getMediaErrorMessage(makeVideoEl(), selectedVideo))
      .toBe('mein-film.mp4 konnte nicht geladen werden.')
  })

  it('uses "Das Video" as filename when selectedVideo is undefined', () => {
    expect(getMediaErrorMessage(makeVideoEl(MEDIA_ERR_DECODE)))
      .toContain('Das Video')
  })

  it('returns ABORTED message for code 1', () => {
    expect(getMediaErrorMessage(makeVideoEl(MEDIA_ERR_ABORTED), selectedVideo))
      .toMatch(/abgebrochen/)
  })

  it('returns NETWORK message for code 2', () => {
    expect(getMediaErrorMessage(makeVideoEl(MEDIA_ERR_NETWORK), selectedVideo))
      .toMatch(/Netzwerkfehler|Datei/)
  })

  it('returns DECODE message for code 3', () => {
    expect(getMediaErrorMessage(makeVideoEl(MEDIA_ERR_DECODE), selectedVideo))
      .toMatch(/decodiert/)
  })

  it('returns SRC_NOT_SUPPORTED message for code 4', () => {
    expect(getMediaErrorMessage(makeVideoEl(MEDIA_ERR_SRC_NOT_SUPPORTED), selectedVideo))
      .toMatch(/nicht unterstützt/)
  })

  it('returns a generic fallback for an unknown error code', () => {
    expect(getMediaErrorMessage(makeVideoEl(99), selectedVideo))
      .toBe('mein-film.mp4 konnte nicht geladen werden.')
  })

  it('includes the filename in all messages', () => {
    expect(getMediaErrorMessage(makeVideoEl(MEDIA_ERR_DECODE), selectedVideo))
      .toContain('mein-film.mp4')
  })
})

// ---------------------------------------------------------------------------
// getMissingVideoTrackMessage
// ---------------------------------------------------------------------------

describe('getMissingVideoTrackMessage', () => {
  it('includes the filename from selectedVideo', () => {
    expect(getMissingVideoTrackMessage({ fileName: 'clip.mov' } as VideoFileDescriptor))
      .toContain('clip.mov')
  })

  it('mentions "Videospur"', () => {
    expect(getMissingVideoTrackMessage({ fileName: 'x.mp4' } as VideoFileDescriptor))
      .toMatch(/Videospur/)
  })

  it('uses "Die Datei" as fallback when selectedVideo is undefined', () => {
    expect(getMissingVideoTrackMessage()).toMatch(/^Die Datei/)
  })
})

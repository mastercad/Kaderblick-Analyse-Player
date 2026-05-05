import { act, renderHook } from '@testing-library/react'
import { useOnlineVideoPlayback } from './useOnlineVideoPlayback'
import type { VideoFileDescriptor, Segment } from '../../../../common/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let ytReadyCallback: ((event: { target: typeof mockYtPlayer }) => void) | undefined
let ytStateChangeCallback: ((event: { data: number }) => void) | undefined
let ytErrorCallback: ((event: { data: number }) => void) | undefined

const mockYtPlayer = {
  playVideo: vi.fn(),
  pauseVideo: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 120),
  setVolume: vi.fn(),
  mute: vi.fn(),
  unMute: vi.fn(),
  destroy: vi.fn()
}

const MockYTPlayer = vi.fn().mockImplementation((_container, options) => {
  ytReadyCallback = options.events?.onReady
  ytStateChangeCallback = options.events?.onStateChange
  ytErrorCallback = options.events?.onError
  return mockYtPlayer
})

const YTState = { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3, CUED: 5 }

beforeAll(() => {
  // Stub YouTube IFrame API on window
  Object.defineProperty(window, 'YT', {
    value: { Player: MockYTPlayer, PlayerState: YTState },
    writable: true,
    configurable: true
  })

  // When the hook injects the YouTube <script> tag, immediately fire the
  // API-ready callback so ensureYouTubeApiLoaded() resolves synchronously.
  vi.spyOn(document.head, 'appendChild').mockImplementation((child) => {
    if (child instanceof HTMLScriptElement) {
      window.onYouTubeIframeAPIReady?.()
    }
    return child
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  // Re-apply MockYTPlayer implementation after clearAllMocks
  MockYTPlayer.mockImplementation((_container, options) => {
    ytReadyCallback = options.events?.onReady
    ytStateChangeCallback = options.events?.onStateChange
    ytErrorCallback = options.events?.onError
    return mockYtPlayer
  })
  mockYtPlayer.getCurrentTime.mockReturnValue(0)
  mockYtPlayer.getDuration.mockReturnValue(120)
  ytReadyCallback = undefined
  ytStateChangeCallback = undefined
  ytErrorCallback = undefined
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const onlineVideo: VideoFileDescriptor = {
  path: 'youtube:dQw4w9WgXcQ',
  fileName: 'youtube:dQw4w9WgXcQ',
  fileUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  playbackMode: 'online',
  onlinePlatform: 'youtube',
  onlineVideoId: 'dQw4w9WgXcQ'
}

const localVideo: VideoFileDescriptor = {
  path: '/tmp/test.mp4',
  fileName: 'test.mp4',
  fileUrl: 'file:///tmp/test.mp4',
  playbackMode: 'direct'
}

const makeSegment = (start: number, end: number, index = 0): Segment => ({
  sourceVideoName: 'youtube:dQw4w9WgXcQ',
  startSeconds: start,
  endSeconds: end,
  title: `Szene ${index + 1}`,
  subTitle: '',
  audioTrack: '1'
})

interface SetupOptions {
  selectedVideo?: VideoFileDescriptor
  segments?: Segment[]
  repeatSingleSegment?: boolean
  interstitialDuration?: number
  autoPlayOnLoad?: boolean
  autoStartSegmentsOnLoad?: boolean
}

async function setup(overrides: SetupOptions = {}) {
  const containerEl = document.createElement('div')
  const containerRef = { current: containerEl }

  const onVideoLoaded = vi.fn()
  const onVideoError = vi.fn()
  const onAllSegmentsDone = vi.fn()
  const onFirstSegmentReached = vi.fn()
  const onVideoEnded = vi.fn()
  const onSegmentModeChange = vi.fn()
  const onCurrentTimeChange = vi.fn()

  const hookResult = renderHook(() =>
    useOnlineVideoPlayback({
      containerRef,
      selectedVideo: onlineVideo,
      segments: [],
      repeatSingleSegment: false,
      interstitialDuration: 0,
      autoPlayOnLoad: false,
      autoStartSegmentsOnLoad: false,
      onVideoLoaded,
      onVideoError,
      onAllSegmentsDone,
      onFirstSegmentReached,
      onVideoEnded,
      onSegmentModeChange,
      onCurrentTimeChange,
      ...overrides
    })
  )

  // Flush effects and microtasks so initYouTube() runs and MockYTPlayer is invoked
  // (setting ytReadyCallback etc.), but onReady has not yet been called.
  await act(async () => {})

  const fireReady = () => act(() => {
    ytReadyCallback?.({ target: mockYtPlayer })
  })

  const fireStateChange = (state: number) => act(() => {
    ytStateChangeCallback?.({ data: state })
  })

  const fireError = (code: number) => act(() => {
    ytErrorCallback?.({ data: code })
  })

  return {
    result: hookResult.result,
    onVideoLoaded,
    onVideoError,
    onAllSegmentsDone,
    onFirstSegmentReached,
    onVideoEnded,
    onSegmentModeChange,
    onCurrentTimeChange,
    fireReady,
    fireStateChange,
    fireError
  }
}

// ---------------------------------------------------------------------------
// No-op when not an online video
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – no-op for non-online video', () => {
  it('returns zero duration and not playing when selectedVideo is local', async () => {
    const { result } = await setup({ selectedVideo: localVideo })

    expect(result.current.duration).toBe(0)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.hasEverPlayed).toBe(false)
  })

  it('returns zero duration when selectedVideo is undefined', async () => {
    const { result } = await setup({ selectedVideo: undefined })

    expect(result.current.duration).toBe(0)
    expect(result.current.isPlaying).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Initial state (before onReady fires)
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – initial state', () => {
  it('exposes the expected initial state before the player fires onReady', async () => {
    const { result } = await setup()

    expect(result.current.duration).toBe(0)
    expect(result.current.currentTime).toBe(0)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isSegmentMode).toBe(false)
    expect(result.current.sequenceIndex).toBe(-1)
    expect(result.current.activeSegmentIndex).toBe(-1)
    expect(result.current.hasEverPlayed).toBe(false)
    expect(result.current.videoError).toBeUndefined()
    expect(result.current.interstitialSegment).toBeNull()
    expect(result.current.keyframeTimes).toEqual([])
    expect(result.current.streamUrl).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// onVideoLoaded callback
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – onVideoLoaded', () => {
  it('sets duration and calls onVideoLoaded when player fires onReady', async () => {
    const { result, onVideoLoaded, fireReady } = await setup()

    fireReady()

    expect(result.current.duration).toBe(120)
    expect(onVideoLoaded).toHaveBeenCalledWith(120)
  })
})

// ---------------------------------------------------------------------------
// Play/Pause via YT state changes
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – play/pause state from SDK', () => {
  it('isPlaying becomes true when YT fires PLAYING state', async () => {
    const { result, fireReady, fireStateChange } = await setup()
    fireReady()

    fireStateChange(YTState.PLAYING)

    expect(result.current.isPlaying).toBe(true)
    expect(result.current.hasEverPlayed).toBe(true)
  })

  it('isPlaying becomes false when YT fires PAUSED state', async () => {
    const { result, fireReady, fireStateChange } = await setup()
    fireReady()

    fireStateChange(YTState.PLAYING)
    fireStateChange(YTState.PAUSED)

    expect(result.current.isPlaying).toBe(false)
  })

  it('calls onVideoEnded and resets segment mode when YT fires ENDED', async () => {
    const { result, onVideoEnded, fireReady, fireStateChange } = await setup()
    fireReady()
    fireStateChange(YTState.PLAYING)

    fireStateChange(YTState.ENDED)

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isSegmentMode).toBe(false)
    expect(result.current.sequenceIndex).toBe(-1)
    expect(onVideoEnded).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// togglePlayPause
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – togglePlayPause', () => {
  it('calls playVideo when not playing', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    await act(async () => { await result.current.togglePlayPause() })

    expect(mockYtPlayer.playVideo).toHaveBeenCalled()
  })

  it('calls pauseVideo when playing', async () => {
    const { result, fireReady, fireStateChange } = await setup()
    fireReady()
    fireStateChange(YTState.PLAYING)

    await act(async () => { await result.current.togglePlayPause() })

    expect(mockYtPlayer.pauseVideo).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// seekTo
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – seekTo', () => {
  it('calls player.seekTo and updates currentTime', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    act(() => { result.current.seekTo(60) })

    expect(mockYtPlayer.seekTo).toHaveBeenCalledWith(60, true)
    expect(result.current.currentTime).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// jumpBySeconds
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – jumpBySeconds', () => {
  it('seeks forward by the given delta', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    act(() => { result.current.seekTo(30) })
    act(() => { result.current.jumpBySeconds(15) })

    expect(mockYtPlayer.seekTo).toHaveBeenLastCalledWith(45, true)
  })

  it('clamps to 0 when seeking before the start', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    act(() => { result.current.jumpBySeconds(-999) })

    expect(mockYtPlayer.seekTo).toHaveBeenLastCalledWith(0, true)
  })

  it('clamps to duration when seeking past the end', async () => {
    const { result, fireReady } = await setup()
    fireReady() // sets durationRef = 120

    act(() => { result.current.jumpBySeconds(9999) })

    expect(mockYtPlayer.seekTo).toHaveBeenLastCalledWith(120, true)
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – error handling', () => {
  it('sets videoError and calls onVideoError on YT player error', async () => {
    const { result, onVideoError, fireReady, fireError } = await setup()
    fireReady()

    fireError(100)

    expect(result.current.videoError).toMatch(/nicht gefunden|privat/i)
    expect(onVideoError).toHaveBeenCalledTimes(1)
    expect(onVideoError).toHaveBeenCalledWith(expect.stringMatching(/nicht gefunden|privat/i), false)
  })

  it('falls back to a generic error message for unknown error codes', async () => {
    const { result, fireReady, fireError } = await setup()
    fireReady()

    fireError(999)

    expect(result.current.videoError).toMatch(/999/)
  })
})

// ---------------------------------------------------------------------------
// Segment mode
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – segment mode', () => {
  const segments = [makeSegment(10, 30, 0), makeSegment(50, 80, 1)]

  it('startSegmentPlayback sets isSegmentMode=true and seeks to first segment', async () => {
    const { result, fireReady } = await setup({ segments })
    fireReady()

    await act(async () => { await result.current.startSegmentPlayback() })

    expect(result.current.isSegmentMode).toBe(true)
    expect(result.current.sequenceIndex).toBe(0)
    expect(mockYtPlayer.seekTo).toHaveBeenCalledWith(10, true)
  })

  it('exitSegmentMode resets isSegmentMode and sequenceIndex', async () => {
    const { result, fireReady } = await setup({ segments })
    fireReady()

    await act(async () => { await result.current.startSegmentPlayback() })
    act(() => { result.current.exitSegmentMode() })

    expect(result.current.isSegmentMode).toBe(false)
    expect(result.current.sequenceIndex).toBe(-1)
  })

  it('jumpToNextSegment seeks to the next segment start', async () => {
    const { result, fireReady } = await setup({ segments })
    fireReady()

    act(() => { result.current.seekTo(15) }) // inside segment 0
    act(() => { result.current.jumpToNextSegment() })

    expect(mockYtPlayer.seekTo).toHaveBeenLastCalledWith(50, true)
  })

  it('jumpToPreviousSegment calls onFirstSegmentReached when before all segments', async () => {
    const { result, onFirstSegmentReached, fireReady } = await setup({ segments })
    fireReady()

    act(() => { result.current.seekTo(5) }) // before any segment
    act(() => { result.current.jumpToPreviousSegment() })

    expect(onFirstSegmentReached).toHaveBeenCalledTimes(1)
  })

  it('calls onSegmentModeChange when segment mode changes', async () => {
    const { result, onSegmentModeChange, fireReady } = await setup({ segments })
    fireReady()

    await act(async () => { await result.current.startSegmentPlayback() })
    expect(onSegmentModeChange).toHaveBeenCalledWith(true)

    act(() => { result.current.exitSegmentMode() })
    expect(onSegmentModeChange).toHaveBeenCalledWith(false)
  })

  it('calls onAllSegmentsDone when jumpToNextSegment goes past the last segment', async () => {
    const { result, onAllSegmentsDone, fireReady } = await setup({ segments })
    fireReady()

    act(() => { result.current.seekTo(90) }) // after all segments
    act(() => { result.current.jumpToNextSegment() })

    expect(onAllSegmentsDone).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Volume / mute
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – volume', () => {
  it('calls ytPlayer.setVolume (scaled 0-100) when volume changes', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    act(() => { result.current.setVolume(0.5) })

    expect(mockYtPlayer.setVolume).toHaveBeenCalledWith(50)
  })

  it('calls setVolume(0) when muted', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    act(() => { result.current.setUserMuted(true) })

    expect(mockYtPlayer.setVolume).toHaveBeenCalledWith(0)
  })
})

// ---------------------------------------------------------------------------
// No-op methods must not throw
// ---------------------------------------------------------------------------

describe('useOnlineVideoPlayback – no-op methods', () => {
  it('stepFrame, jumpToNextKeyframe, jumpToPreviousKeyframe, changePlaybackRate do not throw', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    expect(() => result.current.stepFrame('forward')).not.toThrow()
    expect(() => result.current.stepFrame('backward')).not.toThrow()
    expect(() => result.current.jumpToNextKeyframe()).not.toThrow()
    expect(() => result.current.jumpToPreviousKeyframe()).not.toThrow()
    expect(() => result.current.changePlaybackRate(2)).not.toThrow()
    expect(() => result.current.adjustPlaybackRate('faster')).not.toThrow()
  })

  it('scrub methods do not throw and return correct stubs', async () => {
    const { result, fireReady } = await setup()
    fireReady()

    expect(() => result.current.startScrub()).not.toThrow()
    expect(() => result.current.scrubTo(30)).not.toThrow()
    expect(() => result.current.endScrub()).not.toThrow()
    expect(result.current.getWasPlayingBeforeScrub()).toBe(false)
    expect(result.current.isScrubActive()).toBe(false)
  })
})

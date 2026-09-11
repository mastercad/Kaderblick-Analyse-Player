import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VideoFileDescriptor } from '../../../../common/types'
import { VideoWorkspace } from './VideoWorkspace'

// ---------------------------------------------------------------------------
// Shared test doubles
// ---------------------------------------------------------------------------

const defaultFilter = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0
}

const directVideo: VideoFileDescriptor = {
  path: '/tmp/test.mp4',
  fileName: 'test.mp4',
  fileUrl: 'file:///tmp/test.mp4',
  playbackMode: 'direct'
}

const baseProps = {
  segments: [],
  filterSettings: defaultFilter,
  filterOverlayVisible: false,
  repeatSingleSegment: false,
  onRepeatSingleSegmentChange: () => {},
  onToggleFilterOverlay: () => {}
}

const MEDIA_ERR_DECODE = 3

/** Fires a video error event with the given MediaError code. */
const fireVideoError = (videoEl: HTMLVideoElement, code: number): void => {
  Object.defineProperty(videoEl, 'error', { value: { code } as MediaError, configurable: true })
  act(() => { fireEvent(videoEl, new Event('error')) })
}

/** Fires loadedmetadata with valid video dimensions (videoWidth/videoHeight > 0). */
const fireLoadedMetadata = (videoEl: HTMLVideoElement, duration = 120): void => {
  Object.defineProperty(videoEl, 'duration', { value: duration, configurable: true })
  Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true })
  Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true })
  act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
}

// ---------------------------------------------------------------------------
// playbackRecoveryInProgress banner logic
// ---------------------------------------------------------------------------

describe('VideoWorkspace – playbackRecoveryInProgress', () => {
  it('shows the error banner when a video error has occurred', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    fireVideoError(videoEl, MEDIA_ERR_DECODE)

    expect(screen.getAllByText(/konnte nicht decodiert/).length).toBeGreaterThan(0)
  })

  it('shows the recovery banner instead of the error banner when playbackRecoveryInProgress is true', () => {
    const { rerender } = render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} playbackRecoveryInProgress={false}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    fireVideoError(videoEl, MEDIA_ERR_DECODE)
    // Error banner is visible
    expect(screen.getAllByText(/konnte nicht decodiert/).length).toBeGreaterThan(0)

    // Signal recovery in progress
    act(() => {
      rerender(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} playbackRecoveryInProgress={true}>
          <div />
        </VideoWorkspace>
      )
    })

    expect(screen.queryByText(/konnte nicht decodiert/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/wird für die Wiedergabe umgewandelt/).length).toBeGreaterThan(0)
  })

  it('shows no banner when there is no error and recovery is not in progress', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} playbackRecoveryInProgress={false}>
        <div />
      </VideoWorkspace>
    )

    expect(screen.queryByText(/konnte nicht/)).not.toBeInTheDocument()
    expect(screen.queryByText(/wird für die Wiedergabe umgewandelt/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onVideoEnded callback
// ---------------------------------------------------------------------------

describe('VideoWorkspace – onVideoEnded', () => {
  it('calls onVideoEnded when the video fires the ended event', () => {
    const onVideoEnded = vi.fn()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoEnded={onVideoEnded}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    act(() => { fireEvent(videoEl, new Event('ended')) })

    expect(onVideoEnded).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// onVideoLoaded callback
// ---------------------------------------------------------------------------

describe('VideoWorkspace – onVideoLoaded', () => {
  it('calls onVideoLoaded with the duration after loadedmetadata with valid video dimensions', () => {
    const onVideoLoaded = vi.fn()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoLoaded={onVideoLoaded}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    fireLoadedMetadata(videoEl, 90)

    expect(onVideoLoaded).toHaveBeenCalledOnce()
    expect(onVideoLoaded).toHaveBeenCalledWith(90)
  })

  it('does NOT call onVideoLoaded when videoWidth is 0 (missing video track)', () => {
    const onVideoLoaded = vi.fn()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoLoaded={onVideoLoaded}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'duration', { value: 120, configurable: true })
    Object.defineProperty(videoEl, 'videoWidth', { value: 0, configurable: true })
    Object.defineProperty(videoEl, 'videoHeight', { value: 0, configurable: true })
    act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })

    expect(onVideoLoaded).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// onCurrentTimeChange callback
// ---------------------------------------------------------------------------

describe('VideoWorkspace – onCurrentTimeChange', () => {
  it('calls onCurrentTimeChange with the video currentTime on timeupdate', () => {
    const onCurrentTimeChange = vi.fn()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} onCurrentTimeChange={onCurrentTimeChange}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'currentTime', { value: 42, configurable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    expect(onCurrentTimeChange).toHaveBeenCalledWith(42)
  })
})

// ---------------------------------------------------------------------------
// Speed controls
// ---------------------------------------------------------------------------

describe('VideoWorkspace – speed controls', () => {
  it('plays backwards over time without assigning a negative native playbackRate', () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    act(() => { fireEvent.play(video) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    act(() => { vi.advanceTimersByTime(1000) })

    expect(video.playbackRate).toBe(1)
    expect(video.currentTime).toBeLessThanOrEqual(9.1)
    expect(video.currentTime).toBeGreaterThanOrEqual(8.8)
    expect(screen.getByRole('button', { name: 'Vorwärts' })).toHaveAttribute('aria-pressed', 'true')
    vi.useRealTimers()
  })

  it('keeps reverse playback synchronized to elapsed time while the decoder is seeking', () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    let seeking = false
    Object.defineProperty(video, 'seeking', { configurable: true, get: () => seeking })
    video.currentTime = 10
    act(() => { fireEvent.play(video) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    seeking = true
    act(() => { vi.advanceTimersByTime(1000) })
    expect(video.currentTime).toBeCloseTo(10)

    seeking = false
    act(() => { vi.advanceTimersByTime(16) })
    expect(video.currentTime).toBeLessThanOrEqual(9)
    expect(video.currentTime).toBeGreaterThanOrEqual(8.9)
    vi.useRealTimers()
  })

  it('toggles reverse playback with Shift+R', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    act(() => { fireEvent.keyDown(window, { code: 'KeyR', key: 'R', shiftKey: true }) })

    expect(screen.getByRole('button', { name: 'Vorwärts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('keeps playback paused when selecting either direction', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    video.play = vi.fn().mockResolvedValue(undefined)

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(video.play).not.toHaveBeenCalled()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Vorwärts' })) })
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(video.play).not.toHaveBeenCalled()
  })

  it('does not revive a stopped reverse timer during paused direction changes', () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    act(() => { fireEvent.play(video) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { fireEvent.keyDown(window, { code: 'Space', key: ' ' }) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Vorwärts' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    const pausedAt = video.currentTime
    act(() => { vi.advanceTimersByTime(1000) })

    expect(video.currentTime).toBeCloseTo(pausedAt)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vorwärts' })).toHaveAttribute('aria-pressed', 'true')
    vi.useRealTimers()
  })

  it('can resume after changing reverse speed to three-quarter and half speed', () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    act(() => { fireEvent.play(video) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    act(() => { fireEvent.click(screen.getByTitle('Geschwindigkeit: ¾×')) })
    act(() => { fireEvent.click(screen.getByTitle('Geschwindigkeit: ½×')) })
    act(() => { vi.advanceTimersByTime(250) })

    act(() => { fireEvent.keyDown(window, { code: 'Space', key: ' ' }) })
    const pausedAt = video.currentTime
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(250) })
    expect(video.currentTime).toBeCloseTo(pausedAt)

    act(() => { fireEvent.keyDown(window, { code: 'Space', key: ' ' }) })
    act(() => { vi.advanceTimersByTime(500) })
    expect(video.currentTime).toBeLessThan(pausedAt)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('preserves segment mode when switching between reverse and forward', async () => {
    const onSegmentModeChange = vi.fn()
    render(
      <VideoWorkspace
        {...baseProps}
        segments={[{
          id: 'segment-1',
          sourceVideoName: 'test.mp4',
          sourceVideoPath: '/tmp/test.mp4',
          startSeconds: 5,
          endSeconds: 15,
          lengthSeconds: 10,
          title: 'Szene',
          subTitle: '',
          audioTrack: '1'
        }]}
        interstitialDuration={0}
        selectedVideo={directVideo}
        onSegmentModeChange={onSegmentModeChange}
      >
        <div />
      </VideoWorkspace>
    )

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toHaveAttribute('aria-pressed', 'true')
    onSegmentModeChange.mockClear()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Vorwärts' })) })
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(onSegmentModeChange).not.toHaveBeenCalledWith(false)
  })

  it('stops reverse playback at the active segment start and can play forward again', async () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace
        {...baseProps}
        segments={[{
          id: 'segment-1',
          sourceVideoName: 'test.mp4',
          sourceVideoPath: '/tmp/test.mp4',
          startSeconds: 5,
          endSeconds: 15,
          lengthSeconds: 10,
          title: 'Szene',
          subTitle: '',
          audioTrack: '1'
        }]}
        interstitialDuration={0}
        selectedVideo={directVideo}
      >
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })
    video.currentTime = 7
    act(() => { fireEvent(video, new Event('timeupdate')) })
    act(() => { fireEvent.play(video) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Rückwärts' })) })
    act(() => { vi.advanceTimersByTime(3000) })

    expect(video.currentTime).toBe(5)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rückwärts' })).toHaveAttribute('aria-pressed', 'false')

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('uses Space only for resume/pause and preserves reverse direction while the direction button has focus', () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    const directionButton = screen.getByRole('button', { name: 'Rückwärts' })
    act(() => { directionButton.focus() })
    act(() => { fireEvent.click(directionButton) })
    act(() => { vi.advanceTimersByTime(500) })
    expect(video.currentTime).toBe(10)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(directionButton, { code: 'Space', key: ' ' })
      fireEvent.keyUp(directionButton, { code: 'Space', key: ' ' })
    })
    expect(screen.getByRole('button', { name: 'Vorwärts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(500) })
    const pausedAt = video.currentTime
    expect(pausedAt).toBeLessThan(10)

    act(() => {
      fireEvent.keyDown(directionButton, { code: 'Space', key: ' ' })
      fireEvent.keyUp(directionButton, { code: 'Space', key: ' ' })
    })
    expect(screen.getByRole('button', { name: 'Vorwärts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(500) })
    expect(video.currentTime).toBeCloseTo(pausedAt)
    vi.useRealTimers()
  })

  it('derives the Play/Pause label from native video playback events', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    act(() => { fireEvent.play(video) })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    act(() => { fireEvent.pause(video) })
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('rejects a delayed native play after switching directions while paused', async () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    video.currentTime = 10
    let resolvePlay: (() => void) | undefined
    video.play = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolvePlay = resolve }))
      .mockResolvedValue(undefined)
    video.pause = vi.fn()

    // Start forward playback, but keep its asynchronous play() request pending.
    act(() => { fireEvent.keyDown(window, { code: 'Space', key: ' ' }) })
    // Select reverse and then forward again while that old request is still unresolved.
    // Both direction changes must preserve the currently paused transport state.
    act(() => { fireEvent.keyDown(window, { code: 'KeyR', key: 'R', shiftKey: true }) })
    act(() => { fireEvent.keyDown(window, { code: 'KeyR', key: 'R', shiftKey: true }) })
    const pauseCallsBeforeDelayedPlay = vi.mocked(video.pause).mock.calls.length

    // The browser may deliver the old play event only after the direction is forward again.
    // It must be actively rejected instead of reviving playback and changing the button to Pause.
    act(() => { fireEvent.play(video) })
    await act(async () => {
      resolvePlay?.()
      await Promise.resolve()
    })

    expect(video.pause).toHaveBeenCalledTimes(pauseCallsBeforeDelayedPlay + 2)
    expect(screen.getByRole('button', { name: 'Rückwärts' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    await act(async () => { fireEvent.keyDown(window, { code: 'Space', key: ' ' }) })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('activates the clicked playback-rate button (aria-pressed=true)', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    // Default rate is 1 (Normal) – clicking ½× should activate it
    const halfSpeedBtn = screen.getByTitle('Geschwindigkeit: ½×')
    act(() => { fireEvent.click(halfSpeedBtn) })

    expect(halfSpeedBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('deactivates the previously active rate button when switching', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const normalBtn = screen.getByTitle('Geschwindigkeit: Normal')
    const halfSpeedBtn = screen.getByTitle('Geschwindigkeit: ½×')

    // Normal is active by default
    expect(normalBtn).toHaveAttribute('aria-pressed', 'true')

    act(() => { fireEvent.click(halfSpeedBtn) })

    expect(halfSpeedBtn).toHaveAttribute('aria-pressed', 'true')
    expect(normalBtn).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('VideoWorkspace – frame navigation while playing', () => {
  it('keeps the logical play state while stepping a frame', async () => {
    const onPlayStateChange = vi.fn()
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo} onPlayStateChange={onPlayStateChange}>
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video') as HTMLVideoElement
    fireLoadedMetadata(video)
    video.currentTime = 10
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    onPlayStateChange.mockClear()

    act(() => { fireEvent.keyDown(window, { key: '.', code: 'Period' }) })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(onPlayStateChange).not.toHaveBeenCalledWith(false)
  })
})

// ---------------------------------------------------------------------------
// Mute button
// ---------------------------------------------------------------------------

describe('VideoWorkspace – mute button', () => {
  it('shows "Stummschalten (M)" title when not muted', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    expect(screen.getByTitle('Stummschalten (M)')).toBeInTheDocument()
  })

  it('toggles to "Ton einschalten (M)" title after clicking mute', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const muteBtn = screen.getByTitle('Stummschalten (M)')
    act(() => { fireEvent.click(muteBtn) })

    expect(screen.getByTitle('Ton einschalten (M)')).toBeInTheDocument()
  })

  it('mute button label changes from "Ton" to "Stumm" after clicking', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const muteBtn = screen.getByTitle('Stummschalten (M)')
    act(() => { fireEvent.click(muteBtn) })

    // The button text changes to "Stumm"
    expect(screen.getByTitle('Ton einschalten (M)')).toHaveTextContent('Stumm')
  })
})

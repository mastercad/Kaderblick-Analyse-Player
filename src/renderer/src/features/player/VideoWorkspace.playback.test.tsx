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

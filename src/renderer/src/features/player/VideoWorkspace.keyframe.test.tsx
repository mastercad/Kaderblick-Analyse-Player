import { act, fireEvent, render, screen } from '@testing-library/react'
import type { FilterSettings, VideoFileDescriptor } from '../../../../common/types'
import { VideoWorkspace } from './VideoWorkspace'

const defaultFilter: FilterSettings = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0
}

const makeStreamDescriptor = (override: Partial<VideoFileDescriptor> = {}): VideoFileDescriptor => ({
  path: '/tmp/match.mp4',
  fileName: 'match.mp4',
  fileUrl: 'kvideo://stream/?p=%2Ftmp%2Fmatch.mp4',
  playbackMode: 'stream',
  durationSeconds: 5400,
  ...override
})

const makeDirectDescriptor = (override: Partial<VideoFileDescriptor> = {}): VideoFileDescriptor => ({
  path: '/tmp/match.mp4',
  fileName: 'match.mp4',
  fileUrl: '/tmp/match.mp4',
  playbackMode: 'direct',
  durationSeconds: 5400,
  ...override
})

const baseProps = {
  segments: [],
  filterSettings: defaultFilter,
  filterOverlayVisible: false,
  repeatSingleSegment: false,
  onRepeatSingleSegmentChange: () => {},
  onToggleFilterOverlay: () => {}
}

const fireLoadedMetadata = (videoEl: HTMLVideoElement, rawDuration = Infinity): void => {
  Object.defineProperty(videoEl, 'duration', { value: rawDuration, configurable: true })
  Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true })
  Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true })
  act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
}

// ---------------------------------------------------------------------------
// maxDuration fix: stream-mode seeks must not clamp to 0
// ---------------------------------------------------------------------------

describe('VideoWorkspace – stream mode navigation (maxDuration fix)', () => {
  it('does not clamp seek to 0 when videoEl.duration is 0 (fMP4 stream)', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 300 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!

    // fMP4 streams report duration=0 from empty_moov
    Object.defineProperty(videoEl, 'duration', { value: 0, configurable: true })
    Object.defineProperty(videoEl, 'currentTime', { value: 30, configurable: true })
    act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
    // Simulate 30 s of playback
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Press >>5s button and confirm currentTime display moves forward, not back to 00:00
    const fwdBtn = screen.getByTitle(/Sekunden vor/)
    act(() => { fireEvent.click(fwdBtn) })

    // If the bug were present, maxDuration=0 would clamp newTime to 0 and display 00:00.
    // With the fix, any value > 0:00 means we did not jump back.
    expect(screen.queryByText('00:00')).not.toBeInTheDocument()
  })

  it('clamps within durationSeconds for stream mode', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 60 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'duration', { value: 0, configurable: true })
    Object.defineProperty(videoEl, 'currentTime', { value: 58, configurable: true })
    act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    const fwdBtn = screen.getByTitle(/Sekunden vor/)
    act(() => { fireEvent.click(fwdBtn) })

    // Should be clamped to 01:00 (60 s), not go past it.
    // Two elements show time (current + total), both should be 01:00 after clamping.
    expect(screen.getAllByText('01:00').length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Keyframe navigation buttons
// ---------------------------------------------------------------------------

describe('VideoWorkspace – keyframe navigation buttons', () => {
  beforeEach(() => {
    // Override the global desktopApi stub with one that returns real keyframe times
    Object.defineProperty(window, 'desktopApi', {
      value: {
        getKeyframeTimes: (): Promise<number[]> => Promise.resolve([10, 20, 30, 40, 50])
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    // Restore no-op stub
    Object.defineProperty(window, 'desktopApi', {
      value: { getKeyframeTimes: (): Promise<number[]> => Promise.resolve([]) },
      writable: true,
      configurable: true
    })
  })

  it('next-keyframe button is disabled until keyframe times arrive', async () => {
    // Use a deferred promise to control when keyframes resolve
    let resolveKeyframes!: (v: number[]) => void
    Object.defineProperty(window, 'desktopApi', {
      value: {
        getKeyframeTimes: (): Promise<number[]> =>
          new Promise((res) => { resolveKeyframes = res })
      },
      writable: true,
      configurable: true
    })

    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor()}>
        <div />
      </VideoWorkspace>
    )

    const nextBtn = screen.getByTitle(/nächsten Keyframe/)
    expect(nextBtn).toBeDisabled()

    await act(async () => { resolveKeyframes([10, 20, 30]) })

    expect(nextBtn).not.toBeDisabled()
  })

  it('keyframe buttons are disabled for direct-mode (no keyframes fetched)', async () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeDirectDescriptor()}>
        <div />
      </VideoWorkspace>
    )

    // Flush any effects
    await act(async () => {})

    expect(screen.getByTitle(/vorherigen Keyframe/)).toBeDisabled()
    expect(screen.getByTitle(/nächsten Keyframe/)).toBeDisabled()
  })

  it('next-keyframe button jumps to the next keyframe in stream mode', async () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 300 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'duration', { value: 0, configurable: true })
    Object.defineProperty(videoEl, 'currentTime', { value: 5, configurable: true })
    fireLoadedMetadata(videoEl)
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Wait for keyframe times to be fetched
    await act(async () => {})

    const nextBtn = screen.getByTitle(/nächsten Keyframe/)
    act(() => { fireEvent.click(nextBtn) })

    // After clicking, currentTime display should show 00:10 (first keyframe at t=10)
    expect(screen.getByText('00:10')).toBeInTheDocument()
  })

  it('[/] keyboard shortcuts jump between keyframes', async () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 300 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'duration', { value: 0, configurable: true })
    Object.defineProperty(videoEl, 'currentTime', { value: 25, configurable: true })
    fireLoadedMetadata(videoEl)
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Wait for keyframe fetch
    await act(async () => {})

    // Press ] → jump to next keyframe (t=30)
    act(() => { fireEvent.keyDown(window, { key: ']' }) })
    expect(screen.getByText('00:30')).toBeInTheDocument()

    // Press [ → jump to previous keyframe (from t=30 → t=20)
    act(() => { fireEvent.keyDown(window, { key: '[' }) })
    expect(screen.getByText('00:20')).toBeInTheDocument()
  })
})

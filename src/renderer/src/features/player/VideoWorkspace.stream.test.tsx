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

describe('VideoWorkspace – stream mode duration', () => {
  it('shows durationSeconds as total duration when rawDuration is Infinity (fMP4 stream)', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 5400 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    fireLoadedMetadata(videoEl, Infinity)

    // 5400 s = 01:30:00
    expect(screen.getByText('01:30:00')).toBeInTheDocument()
  })

  it('uses durationSeconds instead of rawDuration to prevent partial-stream duration replacing total duration', () => {
    // After a seek the new ffmpeg stream starts at the seek position.
    // Its duration may be the remaining time (e.g. 600 s) rather than the total file duration.
    // The component must always display the full file duration from ffprobe.
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 5400 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    // Simulate loadedmetadata from a partial stream that reports 600 s remaining
    fireLoadedMetadata(videoEl, 600)

    // Should show 5400 s (01:30:00), NOT 600 s (10:00)
    expect(screen.getByText('01:30:00')).toBeInTheDocument()
    expect(screen.queryByText('10:00')).not.toBeInTheDocument()
  })

  it('shows 00:00 duration when durationSeconds is missing and rawDuration is Infinity', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: undefined })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    fireLoadedMetadata(videoEl, Infinity)

    // Both currentTime (0 s) and duration (0 s, fallback from missing durationSeconds) show '00:00'
    expect(screen.getAllByText('00:00')).toHaveLength(2)
  })
})

describe('VideoWorkspace – stream seek / timeupdate guard', () => {
  it('ignores timeupdate from old stream after seekTo to prevent currentTime overshooting duration', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 5400 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!

    // Step 1 – initial stream loaded, duration = 5400 s
    fireLoadedMetadata(videoEl, Infinity)
    expect(screen.getByText('01:30:00')).toBeInTheDocument()

    // Step 2 – user plays for 30 s (timeupdate with currentTime = 30)
    Object.defineProperty(videoEl, 'currentTime', { value: 30, configurable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })
    expect(screen.getByText('00:30')).toBeInTheDocument()

    // Step 3 – user seeks to 45:00 via the SegmentTimeline (50 % of 5400 = 2700 s)
    // seekTo sets isStreamSeekRef = true and currentTime state = 2700 immediately
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200 }),
      configurable: true
    })
    act(() => { fireEvent.click(timeline, { clientX: 100 }) }) // 100/200 = 50 % → 2700 s

    // Step 4 – old stream fires one last timeupdate (currentTime = 35 now from continued buffering)
    // This MUST be ignored: adding 35 to the new streamStartSeconds (2700) would give 2735,
    // pushing the scrubber past 45:00 even though the new stream hasn't started yet.
    Object.defineProperty(videoEl, 'currentTime', { value: 35, configurable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // currentTime display should still show 45:00 (2700 s), not 45:35 (2735 s)
    expect(screen.getByText('45:00')).toBeInTheDocument()
    expect(screen.queryByText('45:35')).not.toBeInTheDocument()
  })

  it('resumes correct time tracking after new stream loadedmetadata clears the seek flag', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={makeStreamDescriptor({ durationSeconds: 5400 })}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    fireLoadedMetadata(videoEl, Infinity)

    // Seek to 2700 s
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200 }),
      configurable: true
    })
    act(() => { fireEvent.click(timeline, { clientX: 100 }) })

    // New stream fires loadedmetadata → isStreamSeekRef cleared
    fireLoadedMetadata(videoEl, Infinity)

    // New stream plays from the start of its pipe (rawTime = 5 → absolute 2700 + 5 = 2705 s)
    Object.defineProperty(videoEl, 'currentTime', { value: 5, configurable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // 2705 s = 45:05
    expect(screen.getByText('45:05')).toBeInTheDocument()
  })
})

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

/** Enters fullscreen by pointing fullscreenElement at the player panel and firing the event. */
const enterFullscreen = (): HTMLElement => {
  const panel = document.querySelector('.player-panel') as HTMLElement
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => panel
  })
  act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
  return panel
}

/** Exits fullscreen. */
const exitFullscreen = (): void => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => null
  })
  act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoWorkspace – Splash Screen', () => {
  it('is not visible in normal (non-fullscreen) mode', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const splash = document.querySelector('.video-splash')!
    expect(splash).toHaveClass('video-splash--hidden')
  })

  it('becomes visible when fullscreen is entered', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    enterFullscreen()

    const splash = document.querySelector('.video-splash')!
    expect(splash).not.toHaveClass('video-splash--hidden')
  })

  it('hides when playback starts while in fullscreen', async () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    enterFullscreen()

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Click Play → playPlayback() is called → isPlaying becomes true
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    const splash = document.querySelector('.video-splash')!
    expect(splash).toHaveClass('video-splash--hidden')
  })

  it('shows the splash again when fullscreen is exited and re-entered', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    // First enter: splash visible
    enterFullscreen()
    expect(document.querySelector('.video-splash')).not.toHaveClass('video-splash--hidden')

    // Exit
    exitFullscreen()
    expect(document.querySelector('.video-splash')).toHaveClass('video-splash--hidden')

    // Re-enter: splash visible again
    enterFullscreen()
    expect(document.querySelector('.video-splash')).not.toHaveClass('video-splash--hidden')
  })

  it('is not rendered at all without a selected video', () => {
    render(
      <VideoWorkspace {...baseProps}>
        <div />
      </VideoWorkspace>
    )

    // Splash is only rendered when a video is loaded
    expect(document.querySelector('.video-splash')).toBeNull()
  })

  it('pressing Space on the splash title does not reveal the splash in non-fullscreen mode', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const title = document.querySelector('.video-splash__title')!
    act(() => { fireEvent.keyDown(title, { code: 'Space' }) })

    expect(document.querySelector('.video-splash')).toHaveClass('video-splash--hidden')
  })
})

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
    expect(screen.queryByTestId('fullscreen-flyout-shell')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Aktuell verfügbare Zusatzperspektiven')).not.toBeInTheDocument()
  })

  it('shows no fullscreen controls, dialogs, or active perspectives before playback starts', () => {
    const mainVideo = {
      ...directVideo,
      matchGroupId: 'Spiel 1',
      durationSeconds: 2700,
      matchTimeRanges: [{ id: 'main', videoStartSeconds: 0, videoEndSeconds: 2700, matchStartSeconds: 0, matchEndSeconds: 2700 }]
    }
    const perspectiveVideo = {
      ...directVideo,
      path: '/tmp/perspective.mp4',
      fileName: 'perspective.mp4',
      fileUrl: 'file:///tmp/perspective.mp4',
      matchGroupId: 'Spiel 1',
      durationSeconds: 2700,
      matchTimeRanges: [{ id: 'perspective', videoStartSeconds: 0, videoEndSeconds: 2700, matchStartSeconds: 0, matchEndSeconds: 2700 }]
    }
    localStorage.setItem('kaderblick-perspectives-visible', 'true')
    localStorage.setItem('kaderblick-perspective-paths', JSON.stringify([perspectiveVideo.path]))

    try {
      render(
        <VideoWorkspace
          {...baseProps}
          selectedVideo={mainVideo}
          matchVideos={[mainVideo, perspectiveVideo]}
          overlayDialogs={<div data-testid="workspace-overlay">Dialog</div>}
        >
          <div />
        </VideoWorkspace>
      )

      const video = document.querySelector('video')!
      video.currentTime = 30
      fireEvent.timeUpdate(video)
      expect(screen.getByLabelText('Aktuell verfügbare Zusatzperspektiven')).toBeInTheDocument()

      enterFullscreen()

      expect(screen.queryByTestId('fullscreen-flyout-shell')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Aktuell verfügbare Zusatzperspektiven')).not.toBeInTheDocument()
      expect(screen.queryByTestId('workspace-overlay')).not.toBeInTheDocument()

      act(() => { fireEvent.play(video) })
      expect(screen.getByTestId('fullscreen-flyout-shell')).toBeInTheDocument()
      expect(screen.getByLabelText('Aktuell verfügbare Zusatzperspektiven')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-overlay')).toBeInTheDocument()
    } finally {
      localStorage.removeItem('kaderblick-perspectives-visible')
      localStorage.removeItem('kaderblick-perspective-paths')
    }
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

    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await Promise.resolve()
    })

    const splash = document.querySelector('.video-splash')!
    expect(splash).toHaveClass('video-splash--hidden')
    expect(screen.getByTestId('fullscreen-flyout-shell')).toBeInTheDocument()
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

  it('allows spaces in the splash title without starting playback', async () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)
    enterFullscreen()
    const title = document.querySelector('.video-splash__title')!
    let keyDownWasAllowed = false
    let keyUpWasAllowed = false
    await act(async () => {
      keyDownWasAllowed = fireEvent.keyDown(title, { code: 'Space', key: ' ' })
      keyUpWasAllowed = fireEvent.keyUp(title, { code: 'Space', key: ' ' })
      await Promise.resolve()
    })

    expect(keyDownWasAllowed).toBe(true)
    expect(keyUpWasAllowed).toBe(true)
    expect(videoEl.play).not.toHaveBeenCalled()
    expect(document.querySelector('.video-splash')).not.toHaveClass('video-splash--hidden')
  })
})

/**
 * VideoWorkspace – online-video integration tests
 *
 * Covers the three changes made for online-video support:
 *  1. Filter is applied to video-stage__canvas (not __content) for online videos
 *  2. video-stage__content has no filter style for online videos
 *  3. The event-capture overlay is rendered inside OnlineVideoPlayer
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { defaultFilterSettings } from '../../../../common/filterPresets'
import type { FilterSettings } from '../../../../common/types'
import { VideoWorkspace } from './VideoWorkspace'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const onlineVideo = {
  path: '',
  fileName: 'test-yt.txt',
  fileUrl: '',
  playbackMode: 'online' as const,
  onlinePlatform: 'youtube' as const,
  onlineVideoId: 'dQw4w9WgXcQ'
}

const localVideo = {
  path: '/tmp/local.mp4',
  fileName: 'local.mp4',
  fileUrl: 'file:///tmp/local.mp4',
  playbackMode: 'direct' as const
}

const baseProps = {
  segments: [],
  filterSettings: defaultFilterSettings,
  filterOverlayVisible: false,
  repeatSingleSegment: false,
  onRepeatSingleSegmentChange: () => undefined,
  onToggleFilterOverlay: () => undefined
}

const activeFilter: FilterSettings = {
  ...defaultFilterSettings,
  brightness: 150,
  contrast: 120
}

// ---------------------------------------------------------------------------
// 1. Filter on video-stage__canvas for online videos
// ---------------------------------------------------------------------------

describe('VideoWorkspace – filter on canvas for online videos', () => {
  it('applies CSS filter to video-stage__canvas when an online video is loaded and filter is active', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} filterSettings={activeFilter} />)
    const canvas = screen.getByTestId('video-zoom-canvas')
    expect(canvas.style.filter).toBeTruthy()
    expect(canvas.style.filter).toContain('brightness(150%)')
    expect(canvas.style.filter).toContain('contrast(120%)')
  })

  it('applies no filter to video-stage__canvas for a local video (filter goes on the video element instead)', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={localVideo} filterSettings={activeFilter} />)
    const canvas = screen.getByTestId('video-zoom-canvas')
    expect(canvas.style.filter).toBeFalsy()
  })

  it('applies the default (neutral) filter string to the canvas when filterSettings are at defaults for online video', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} filterSettings={defaultFilterSettings} />)
    const canvas = screen.getByTestId('video-zoom-canvas')
    // buildCssFilter always produces a string even for defaults; just verify it's set
    expect(canvas.style.filter).toBeTruthy()
    expect(canvas.style.filter).toContain('brightness(100%)')
  })
})

// ---------------------------------------------------------------------------
// 2. Filter is NOT on video-stage__content for online videos
// ---------------------------------------------------------------------------

describe('VideoWorkspace – filter NOT on video-stage__content for online videos', () => {
  it('video-stage__content has no inline filter style for online videos', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} filterSettings={activeFilter} />)
    const content = screen.getByTestId('video-zoom-content')
    expect(content.style.filter).toBeFalsy()
  })

  it('video-stage__content has no inline filter style for local videos either', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={localVideo} filterSettings={activeFilter} />)
    const content = screen.getByTestId('video-zoom-content')
    expect(content.style.filter).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// 3. Event-capture overlay is rendered for online videos
// ---------------------------------------------------------------------------

describe('VideoWorkspace – event-capture overlay for online videos', () => {
  it('renders the event-capture overlay when an online video is selected', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} />)
    expect(document.querySelector('.online-video-player__event-capture')).toBeInTheDocument()
  })

  it('does NOT render the event-capture overlay for a local video', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={localVideo} />)
    expect(document.querySelector('.online-video-player__event-capture')).not.toBeInTheDocument()
  })

  it('does NOT render the event-capture overlay when no video is selected', () => {
    render(<VideoWorkspace {...baseProps} />)
    expect(document.querySelector('.online-video-player__event-capture')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Wheel events on the viewport still trigger zoom for online videos
//    (the overlay must not block events from reaching the native listener)
// ---------------------------------------------------------------------------

describe('VideoWorkspace – wheel zoom still works for online videos', () => {
  it('changes zoom level when wheel event fires on video-stage__viewport', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} />)

    const viewport = screen.getByTestId('video-zoom-viewport')

    // Give the viewport real dimensions so useZoom can compute coordinates
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0,
      right: 400, bottom: 300, width: 400, height: 300,
      toJSON: () => ({})
    } as DOMRect)

    act(() => { fireEvent(window, new Event('resize')) })

    // Open zoom dock to read the current zoom level
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom-Steuerung einblenden' })) })

    expect(screen.getByText(/1\.00\s*x/)).toBeInTheDocument()

    // Fire a wheel event directly on the viewport (simulates native listener path)
    act(() => {
      viewport.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -100  // scroll up → zoom in
      }))
    })

    // Zoom should have increased from 1.00
    expect(screen.queryByText(/1\.00\s*x/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 5. fullscreenchange with a descendant element keeps isFullscreen = true
// ---------------------------------------------------------------------------

describe('VideoWorkspace – fullscreen with descendant element', () => {
  afterEach(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null
    })
  })

  it('keeps player-panel--fullscreen when a child of the panel becomes fullscreenElement', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} />)
    const playerPanel = document.querySelector('.player-panel') as HTMLElement

    // Simulate YouTube iframe calling requestFullscreen()
    const childEl = document.createElement('div')
    playerPanel.appendChild(childEl)

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => childEl
    })

    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    expect(playerPanel).toHaveClass('player-panel--fullscreen')
  })

  it('exits fullscreen layout when an unrelated element becomes fullscreenElement', () => {
    render(<VideoWorkspace {...baseProps} selectedVideo={onlineVideo} />)
    const playerPanel = document.querySelector('.player-panel') as HTMLElement

    const unrelated = document.createElement('div')
    document.body.appendChild(unrelated)

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => unrelated
    })

    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    expect(playerPanel).not.toHaveClass('player-panel--fullscreen')
    document.body.removeChild(unrelated)
  })
})

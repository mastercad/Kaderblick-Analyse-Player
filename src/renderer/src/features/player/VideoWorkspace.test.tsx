import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { defaultFilterSettings } from '../../../../common/filterPresets'
import { VideoWorkspace } from './VideoWorkspace'

const selectedVideo = {
  path: '/tmp/test-video.mp4',
  fileName: 'test-video.mp4',
  fileUrl: 'file:///tmp/test-video.mp4',
  playbackMode: 'direct' as const
}

describe('VideoWorkspace', () => {
  it('renders overlay dialogs inside the player panel', () => {
    render(
      <VideoWorkspace
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        overlayDialogs={<div data-testid="workspace-overlay">Dialog im Player</div>}
      >
        <div>Overlay-Inhalt</div>
      </VideoWorkspace>
    )

    const playerPanel = screen.getByText('Bitte zuerst ein Video laden').closest('section')

    expect(playerPanel).not.toBeNull()
    expect(within(playerPanel as HTMLElement).getByTestId('workspace-overlay')).toBeInTheDocument()
  })

  it('switches to edge flyouts in fullscreen mode', () => {
    render(
      <VideoWorkspace
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        overlayDialogs={<div data-testid="workspace-overlay">Dialog im Player</div>}
      >
        <div>Overlay-Inhalt</div>
      </VideoWorkspace>
    )

    const playerPanel = screen.getByText('Bitte zuerst ein Video laden').closest('section') as HTMLElement

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => playerPanel
    })

    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(playerPanel).toHaveClass('player-panel--fullscreen')
    expect(screen.queryByTestId('player-inline-controls')).not.toBeInTheDocument()
    expect(screen.getByTestId('fullscreen-flyout-shell')).toBeInTheDocument()
    expect(screen.getByLabelText('Segmente einblenden')).toBeInTheDocument()
    expect(screen.getByLabelText('Werkzeuge einblenden')).toBeInTheDocument()
    expect(within(screen.getByTestId('fullscreen-flyout-right-panel')).getByText('Overlay-Inhalt')).toBeInTheDocument()
  })

  it('zooms with the controls and can be reset', () => {
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div>Overlay-Inhalt</div>
      </VideoWorkspace>
    )

    const viewport = screen.getByTestId('video-zoom-viewport')
    const canvas = screen.getByTestId('video-zoom-canvas')
  const content = screen.getByTestId('video-zoom-content')

    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 200,
      width: 400,
      height: 200,
      toJSON: () => ({})
    } as DOMRect)

    act(() => {
      fireEvent(window, new Event('resize'))
    })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom-Steuerung einblenden' }))
    })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom vergroessern' }))
    })

    expect(screen.getByText(/1\.25\s*x/)).toBeInTheDocument()
    expect(canvas.style.transform).toBe('translate(-50px, -25px)')
    expect(content.style.transform).toBe('scale(1.25)')

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom vergroessern' }))
    })

    expect(screen.getByText(/1\.50\s*x/)).toBeInTheDocument()
    expect(canvas.style.transform).toBe('translate(-100px, -50px)')
    expect(content.style.transform).toBe('scale(1.5)')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.getByText(/1\.00\s*x/)).toBeInTheDocument()
    expect(canvas.style.transform).toBe('translate(0px, 0px)')
    expect(content.style.transform).toBe('scale(1)')
  })
})
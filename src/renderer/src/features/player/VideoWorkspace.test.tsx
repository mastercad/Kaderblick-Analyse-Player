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

  it('keeps a hovered fullscreen flyout open while moving from its trigger into the panel', () => {
    vi.useFakeTimers()
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

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    const toolsTrigger = screen.getByRole('button', { name: 'Werkzeuge einblenden' })
    const toolsPanel = screen.getByTestId('fullscreen-flyout-right-panel')
    fireEvent.mouseEnter(toolsTrigger)
    expect(toolsTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(toolsTrigger).toHaveAttribute('aria-pressed', 'false')
    expect(toolsTrigger).not.toHaveClass('fullscreen-edge-trigger--pinned')
    expect(toolsPanel).not.toHaveAttribute('inert')

    fireEvent.mouseLeave(toolsTrigger)
    fireEvent.mouseEnter(toolsPanel)
    act(() => { vi.advanceTimersByTime(240) })
    expect(toolsTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(toolsPanel).toHaveClass('fullscreen-flyout-panel--open')
    expect(toolsPanel).not.toHaveAttribute('inert')
    vi.useRealTimers()
  })

  it('shows clearly when a fullscreen flyout is pinned', () => {
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

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    fireEvent.click(screen.getByRole('button', { name: 'Werkzeuge einblenden' }))

    const pinnedTrigger = screen.getByRole('button', { name: 'Werkzeuge angeheftet; klicken zum Lösen' })
    expect(pinnedTrigger).toHaveAttribute('aria-pressed', 'true')
    expect(pinnedTrigger).toHaveClass('fullscreen-edge-trigger--pinned')
    expect(pinnedTrigger.querySelector('.fullscreen-edge-trigger__pin')).toBeInTheDocument()
  })

  it('offers segment repeat directly in the fullscreen playback toolbar', () => {
    const onRepeatSingleSegmentChange = vi.fn()
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[{
          id: 'segment-1', sourceVideoName: selectedVideo.fileName, sourceVideoPath: selectedVideo.path,
          startSeconds: 10, endSeconds: 20, lengthSeconds: 10, title: 'Testszene', subTitle: '', audioTrack: '1'
        }]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={onRepeatSingleSegmentChange}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    const controlsTrigger = screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' })
    fireEvent.mouseEnter(controlsTrigger)
    const controlsPanel = document.getElementById('fullscreen-flyout-bottom')!
    const repeatButton = within(controlsPanel).getByRole('button', { name: 'Segment endlos wiederholen' })

    expect(repeatButton).toHaveAttribute('title', 'Segment endlos wiederholen (R)')
    expect(repeatButton).toHaveAttribute('aria-pressed', 'false')
    expect(repeatButton).toHaveTextContent('R')
    fireEvent.click(repeatButton)
    expect(onRepeatSingleSegmentChange).toHaveBeenCalledWith(true)
  })

  it('offers a kickoff jump with its shortcut in the fullscreen playback toolbar', () => {
    render(
      <VideoWorkspace
        selectedVideo={{ ...selectedVideo, matchHalf: 2, kickoffVideoSeconds: 47 }}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video')!
    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' }))

    const controlsPanel = document.getElementById('fullscreen-flyout-bottom')!
    const kickoffButton = within(controlsPanel).getByRole('button', { name: 'Zum Anstoß springen' })
    expect(kickoffButton).toHaveAttribute('title', 'Zum Anstoß springen (A)')
    expect(kickoffButton).toHaveTextContent('A')

    fireEvent.click(kickoffButton)
    expect(video.currentTime).toBe(47)
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Anstoß')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Spielzeit 45:00')
  })

  it('closes a hover-opened segment flyout after selecting a segment', () => {
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[{
          id: 'segment-1',
          sourceVideoName: selectedVideo.fileName,
          sourceVideoPath: selectedVideo.path,
          startSeconds: 10,
          endSeconds: 20,
          lengthSeconds: 10,
          title: 'Testszene',
          subTitle: '',
          audioTrack: '1'
        }]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    const segmentTrigger = screen.getByRole('button', { name: 'Segmente einblenden' })
    fireEvent.mouseEnter(segmentTrigger)
    expect(segmentTrigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByText('Testszene').closest('button')!)

    expect(segmentTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('fullscreen-flyout-left')).toHaveAttribute('inert')
  })

  it('removes focus from a closed jump panel so Space controls playback', async () => {
    render(
      <VideoWorkspace
        selectedVideo={{ ...selectedVideo, matchHalf: 1, kickoffVideoSeconds: 0 }}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video')!
    video.play = vi.fn().mockResolvedValue(undefined)
    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    const controlsTrigger = screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' })
    fireEvent.click(controlsTrigger)
    const jumpInput = screen.getByLabelText('Springe zu Spielzeit')
    act(() => { jumpInput.focus() })
    fireEvent.change(jumpInput, { target: { value: '09:00' } })
    act(() => { controlsTrigger.focus() })
    fireEvent.click(controlsTrigger)
    fireEvent.mouseLeave(controlsTrigger)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 240)) })

    expect(jumpInput).not.toHaveFocus()
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await Promise.resolve()
    })
    expect(video.play).toHaveBeenCalledOnce()
  })

  it('shows transient fullscreen feedback for keyboard actions', () => {
    vi.useFakeTimers()
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div>Overlay-Inhalt</div>
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    fireEvent.keyDown(window, { code: 'ArrowRight', key: 'ArrowRight', shiftKey: true })
    const hud = screen.getByTestId('fullscreen-keyboard-hud')
    expect(hud).toHaveTextContent('Vorgesprungen')
    expect(hud).toHaveTextContent('5 s')

    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.queryByTestId('fullscreen-keyboard-hud')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows fullscreen feedback for every state-toggle shortcut', () => {
    vi.useFakeTimers()
    const onToggleFilterOverlay = vi.fn()
    const onRepeatSingleSegmentChange = vi.fn()
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[{
          id: 'segment-1',
          sourceVideoName: selectedVideo.fileName,
          sourceVideoPath: selectedVideo.path,
          startSeconds: 10,
          endSeconds: 20,
          lengthSeconds: 10,
          title: 'Testszene',
          subTitle: '',
          audioTrack: '1'
        }]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={onRepeatSingleSegmentChange}
        onToggleFilterOverlay={onToggleFilterOverlay}
      >
        <div />
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    fireEvent.keyDown(window, { code: 'KeyN', key: 'n' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Segmentmodus aktiv')

    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Filter eingeblendet')
    expect(onToggleFilterOverlay).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { code: 'KeyR', key: 'r' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Wiederholung aktiv')
    expect(onRepeatSingleSegmentChange).toHaveBeenCalledWith(true)

    fireEvent.keyDown(window, { code: 'KeyZ', key: 'z' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zoomsteuerung eingeblendet')

    fireEvent.keyDown(window, { code: 'KeyM', key: 'm' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Ton ausgeschaltet')

    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Anstoß nicht festgelegt')
    vi.useRealTimers()
  })

  it('shows useful fullscreen orientation data and lets the user persistently hide it', async () => {
    window.localStorage.removeItem('kaderblick-fullscreen-orientation-visible')
    render(
      <VideoWorkspace
        selectedVideo={{ ...selectedVideo, matchHalf: 1, kickoffVideoSeconds: 60 }}
        segments={[{
          id: 'segment-1', sourceVideoName: selectedVideo.fileName, sourceVideoPath: selectedVideo.path,
          startSeconds: 300, endSeconds: 360, lengthSeconds: 60, title: 'Testszene', subTitle: '', audioTrack: '1'
        }]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 600 })
    video.currentTime = 330
    video.play = vi.fn().mockResolvedValue(undefined)
    fireEvent.loadedMetadata(video)
    fireEvent.timeUpdate(video)

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await Promise.resolve()
      fireEvent.play(video)
    })

    const orientation = screen.getByTestId('fullscreen-orientation')
    expect(orientation).toHaveTextContent('Spielzeit04:30')
    expect(orientation).toHaveTextContent('Video05:30 / 10:00noch 04:30')
    expect(orientation).toHaveTextContent('Segment 1/1noch 00:30')

    fireEvent.keyDown(window, { code: 'KeyT', key: 't' })
    expect(screen.queryByTestId('fullscreen-orientation')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('kaderblick-fullscreen-orientation-visible')).toBe('false')

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Info einblenden' }))
    expect(screen.getByText('Aktuelles Video')).toBeInTheDocument()
    expect(screen.getByText('Vorwärts · Normal')).toBeInTheDocument()
    const orientationToggle = screen.getByRole('checkbox', { name: /Zeiten und Segment anzeigen/ })
    expect(orientationToggle).not.toBeChecked()

    fireEvent.click(orientationToggle)
    expect(screen.getByTestId('fullscreen-orientation')).toBeInTheDocument()
    expect(window.localStorage.getItem('kaderblick-fullscreen-orientation-visible')).toBe('true')
    window.localStorage.removeItem('kaderblick-fullscreen-orientation-visible')
  })

  it('describes the actual two-step previous-segment action in the fullscreen HUD', () => {
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[
          {
            id: 'segment-1', sourceVideoName: selectedVideo.fileName, sourceVideoPath: selectedVideo.path,
            startSeconds: 0, endSeconds: 5, lengthSeconds: 5, title: 'Erste Szene', subTitle: '', audioTrack: '1'
          },
          {
            id: 'segment-2', sourceVideoName: selectedVideo.fileName, sourceVideoPath: selectedVideo.path,
            startSeconds: 10, endSeconds: 20, lengthSeconds: 10, title: 'Zweite Szene', subTitle: '', audioTrack: '1'
          }
        ]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const video = document.querySelector('video')!
    video.currentTime = 15
    act(() => { fireEvent(video, new Event('timeupdate')) })
    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    fireEvent.keyDown(window, { code: 'ArrowLeft', key: 'ArrowLeft' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Segmentanfang')
    expect(video.currentTime).toBe(10)

    fireEvent.keyDown(window, { code: 'ArrowLeft', key: 'ArrowLeft' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Voriges Segment')
    expect(video.currentTime).toBe(0)
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

  it('documents the available keyboard controls in button tooltips and shortcut help', () => {
    render(
      <VideoWorkspace
        selectedVideo={{ ...selectedVideo, matchHalf: 1, kickoffVideoSeconds: 0 }}
        segments={[{
          id: 'segment-1', sourceVideoName: selectedVideo.fileName, sourceVideoPath: selectedVideo.path,
          startSeconds: 10, endSeconds: 20, lengthSeconds: 10, title: 'Testszene', subTitle: '', audioTrack: '1'
        }]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('title', 'Play / Pause (Leertaste)')
    expect(screen.getByRole('button', { name: 'Nur Segmente abspielen' })).toHaveAttribute('title', expect.stringContaining('(N)'))
    expect(screen.getByRole('button', { name: 'Voriges Segment' })).toHaveAttribute('title', expect.stringContaining('(←)'))
    expect(screen.getByRole('button', { name: 'Nächstes Segment' })).toHaveAttribute('title', expect.stringContaining('(→)'))
    expect(screen.getByRole('button', { name: 'Rückwärts' })).toHaveAttribute('title', expect.stringContaining('(Shift+R'))
    expect(screen.getByRole('button', { name: 'Langsamer' })).toHaveAttribute('title', 'Langsamer (<)')
    expect(screen.getByRole('button', { name: 'Schneller' })).toHaveAttribute('title', 'Schneller (>)')
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveAttribute('title', 'Filter einblenden (F)')
    expect(screen.getByRole('button', { name: 'Vollbild' })).toHaveAttribute('title', 'Vollbild (F11)')
    expect(screen.getByRole('button', { name: 'Springen' })).toHaveAttribute('title', expect.stringContaining('(Enter)'))

    fireEvent.click(screen.getByText('Tastenkürzel'))
    expect(screen.getByText('Segmentanfang; zweimal: voriges Segment')).toBeInTheDocument()
    expect(screen.getByText('Nur Segmente abspielen ein-/ausschalten')).toBeInTheDocument()
  })
})

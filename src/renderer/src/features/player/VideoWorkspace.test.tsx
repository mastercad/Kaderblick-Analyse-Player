import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { defaultFilterSettings } from '../../../../common/filterPresets'
import type { Segment } from '../../../../common/types'
import { VideoWorkspace } from './VideoWorkspace'

const selectedVideo = {
  path: '/tmp/test-video.mp4',
  fileName: 'test-video.mp4',
  fileUrl: 'file:///tmp/test-video.mp4',
  playbackMode: 'direct' as const
}

const finishFullscreenSplash = (): void => {
  const video = document.querySelector('video')
  if (video) act(() => { fireEvent.play(video) })
}

describe('VideoWorkspace', () => {
  it.each([
    { storedStart: 54 * 60 + 45, storedEnd: 56 * 60, expected: '54:45 bis 56:00' },
    { storedStart: 73 * 60 + 17, storedEnd: 74 * 60 + 32, expected: '73:17 bis 74:32' }
  ])('shows the segment\'s own stored times ($expected) while playback uses resolved video positions', ({ storedStart, storedEnd, expected }) => {
    const playbackSegment: Segment = {
      id: 'second-half', sourceVideoName: 'test-video.mp4', sourceVideoPath: selectedVideo.path,
      startSeconds: 11 * 60 + 15, endSeconds: 12 * 60 + 30, lengthSeconds: 75,
      title: 'Szene', subTitle: '', audioTrack: '1'
    }
    const storedSegment = {
      ...playbackSegment,
      startSeconds: storedStart,
      endSeconds: storedEnd
    }

    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        segments={[playbackSegment]}
        segmentDisplayTimes={[storedSegment]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div>Overlay-Inhalt</div>
      </VideoWorkspace>
    )

    expect(screen.getByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('11:15 bis 12:30')).not.toBeInTheDocument()
  })

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
    finishFullscreenSplash()

    const infoPanel = document.getElementById('fullscreen-flyout-top')!
    expect(within(infoPanel).queryByText('Zusatzperspektiven')).not.toBeInTheDocument()

    const toolsTrigger = screen.getByRole('button', { name: 'Werkzeuge einblenden' })
    const toolsPanel = screen.getByTestId('fullscreen-flyout-right-panel')
    fireEvent.mouseEnter(toolsTrigger)
    expect(toolsTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(toolsTrigger).toHaveAttribute('aria-pressed', 'false')
    expect(toolsTrigger).not.toHaveClass('fullscreen-edge-trigger--pinned')
    expect(toolsPanel).not.toHaveAttribute('inert')
    expect(within(toolsPanel).getByText('Perspektiven')).toBeInTheDocument()
    expect(within(toolsPanel).queryByText('Segment endlos wiederholen')).not.toBeInTheDocument()

    fireEvent.click(within(toolsPanel).getByText('Perspektiven'))
    expect(within(toolsPanel).getByText('Keine weiteren Videos dieses Spiels geladen.')).toBeInTheDocument()

    const viewport = screen.getByTestId('video-zoom-viewport')
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450,
      toJSON: () => ({})
    } as DOMRect)
    act(() => { fireEvent(window, new Event('resize')) })
    fireEvent.click(within(toolsPanel).getByRole('button', { name: 'Zoom vergroessern' }))
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zoom vergrößert')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('1.25×')

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
    finishFullscreenSplash()

    fireEvent.click(screen.getByRole('button', { name: 'Werkzeuge einblenden' }))

    const pinnedTrigger = screen.getByRole('button', { name: 'Werkzeuge angeheftet; klicken zum Lösen' })
    expect(pinnedTrigger).toHaveAttribute('aria-pressed', 'true')
    expect(pinnedTrigger).toHaveClass('fullscreen-edge-trigger--pinned')
    expect(pinnedTrigger.querySelector('.fullscreen-edge-trigger__pin')).toBeInTheDocument()
  })

  it('shows and changes the shared time interpretation in fullscreen info', () => {
    const onJumpTimeModeChange = vi.fn()
    render(
      <VideoWorkspace
        selectedVideo={{
          ...selectedVideo,
          matchGroupId: 'Spiel 1',
          durationSeconds: 50 * 60,
          matchTimeRanges: [{ id: 'first', videoStartSeconds: 3 * 60, videoEndSeconds: 48 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
        }}
        jumpTimeMode="match-cumulative"
        onJumpTimeModeChange={onJumpTimeModeChange}
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

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    finishFullscreenSplash()
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Info einblenden' }))

    const infoPanel = document.getElementById('fullscreen-flyout-top')!
    const toolsPanel = screen.getByTestId('fullscreen-flyout-right-panel')
    const modeSelect = within(infoPanel).getByRole('combobox', { name: 'Zeitbezug für Segmente und Sprungziele' })
    expect(modeSelect).toHaveValue('match-cumulative')
    expect(within(infoPanel).getByText(/Gespeicherte Segmentzeiten und Eingaben bei „Springe zu Zeit“/)).toHaveTextContent('entspricht der Spieluhr')
    expect(within(toolsPanel).queryByRole('combobox', { name: 'Zeitbezug für Segmente und Sprungziele' })).not.toBeInTheDocument()

    fireEvent.change(modeSelect, { target: { value: 'match-per-part' } })
    expect(onJumpTimeModeChange).toHaveBeenCalledWith('match-per-part')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zeitbezug geändert')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Spielzeit – je Halbzeit/Teil')
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
    finishFullscreenSplash()

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
    finishFullscreenSplash()
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' }))

    const controlsPanel = document.getElementById('fullscreen-flyout-bottom')!
    const kickoffButton = within(controlsPanel).getByRole('button', { name: 'Zum Beginn der Zeitzuordnung springen' })
    expect(kickoffButton).toHaveAttribute('title', 'Zum Beginn der Zeitzuordnung springen (A)')
    expect(kickoffButton).toHaveTextContent('A')

    fireEvent.click(kickoffButton)
    expect(video.currentTime).toBe(47)
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Beginn der Zeitzuordnung')
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
    finishFullscreenSplash()

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
    finishFullscreenSplash()
    act(() => { fireEvent.pause(video) })

    const controlsTrigger = screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' })
    fireEvent.click(controlsTrigger)
    const jumpInput = screen.getByLabelText(/Springe zu Zeit/)
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

  it('seeks to 62:00 in a 35-minute second half instead of comparing match time with video duration', () => {
    render(
      <VideoWorkspace
        selectedVideo={{
          ...selectedVideo,
          matchHalf: 2,
          kickoffVideoSeconds: 2 * 60,
          matchDurationSeconds: 35 * 60
        }}
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
    Object.defineProperty(video, 'duration', { configurable: true, value: 55 * 60 })
    fireEvent.loadedMetadata(video)

    const jumpInput = screen.getByLabelText(/Springe zu Zeit/)
    fireEvent.change(jumpInput, { target: { value: '62:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(video.currentTime).toBe(29 * 60)

    fireEvent.change(jumpInput, { target: { value: '36:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(video.currentTime).toBe(3 * 60)
  })

  it('switches from the second half to the grouped first-half video for 23:10', () => {
    const firstHalf = {
      ...selectedVideo,
      path: '/tmp/spiel1-hz1.mp4',
      fileName: 'spiel1-hz1.mp4',
      matchGroupId: 'Spiel 1',
      matchHalf: 1 as const,
      kickoffVideoSeconds: 2 * 60,
      matchDurationSeconds: 35 * 60
    }
    const secondHalf = {
      ...selectedVideo,
      path: '/tmp/spiel1-hz2.mp4',
      fileName: 'spiel1-hz2.mp4',
      matchGroupId: 'Spiel 1',
      matchHalf: 2 as const,
      kickoffVideoSeconds: 3 * 60,
      matchDurationSeconds: 35 * 60
    }
    const otherMatchFirstHalf = {
      ...firstHalf,
      path: '/tmp/spiel2-hz1.mp4',
      fileName: 'spiel2-hz1.mp4',
      matchGroupId: 'Spiel 2'
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={secondHalf}
        matchVideos={[otherMatchFirstHalf, firstHalf, secondHalf]}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '23:10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(onMatchVideoSeek).toHaveBeenCalledWith(firstHalf, 25 * 60 + 10)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('normalizes 45:60 and switches from the first to the second video', () => {
    const firstHalf = {
      ...selectedVideo,
      path: '/tmp/spiel1-hz1.mp4',
      fileName: 'spiel1-hz1.mp4',
      durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1',
      matchHalf: 1 as const,
      kickoffVideoSeconds: 2 * 60,
      matchDurationSeconds: 45 * 60
    }
    const secondHalf = {
      ...selectedVideo,
      path: '/tmp/spiel1-hz2.mp4',
      fileName: 'spiel1-hz2.mp4',
      durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1',
      matchHalf: 2 as const,
      kickoffVideoSeconds: 3 * 60,
      matchDurationSeconds: 45 * 60
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={firstHalf}
        matchVideos={[firstHalf, secondHalf]}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '45:60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(onMatchVideoSeek).toHaveBeenCalledWith(secondHalf, 4 * 60)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('treats exactly 45:00 as the beginning of the second half in continuous match time', () => {
    const firstHalf = {
      ...selectedVideo,
      path: '/tmp/spiel1-hz1.mp4', fileName: 'spiel1-hz1.mp4', durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1', matchHalf: 1 as const,
      kickoffVideoSeconds: 4 * 60 + 14, matchDurationSeconds: 45 * 60
    }
    const secondHalf = {
      ...selectedVideo,
      path: '/tmp/spiel1-hz2.mp4', fileName: 'spiel1-hz2.mp4', durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1', matchHalf: 2 as const,
      kickoffVideoSeconds: 3 * 60 + 20, matchDurationSeconds: 45 * 60
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={firstHalf}
        matchVideos={[firstHalf, secondHalf]}
        jumpTimeMode="match-cumulative"
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '45:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(onMatchVideoSeek).toHaveBeenCalledWith(secondHalf, 3 * 60 + 20)
    expect(onMatchVideoSeek).not.toHaveBeenCalledWith(firstHalf, 49 * 60 + 14)
  })

  it('jumps to 45:60 across two 45-minute videos even when both have the same half assignment', () => {
    const firstVideo = {
      ...selectedVideo,
      path: '/tmp/first-part.mp4', fileName: 'first-part.mp4', durationSeconds: 55 * 60,
      matchHalf: 1 as const, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondVideo = {
      ...selectedVideo,
      path: '/tmp/second-part.mp4', fileName: 'second-part.mp4', durationSeconds: 52 * 60,
      matchHalf: 1 as const, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={firstVideo}
        matchVideos={[firstVideo, secondVideo]}
        jumpTimeMode="match-cumulative"
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '45:60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(onMatchVideoSeek).toHaveBeenCalledWith(secondVideo, 4 * 60)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects 47:00 in match-per-part mode when the configured part lasts 45 minutes', () => {
    const video = {
      ...selectedVideo,
      durationSeconds: 55 * 60,
      matchHalf: 1 as const,
      kickoffVideoSeconds: 2 * 60,
      matchDurationSeconds: 45 * 60
    }

    render(
      <VideoWorkspace
        selectedVideo={video}
        matchVideos={[video]}
        jumpTimeMode="match-per-part"
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

    const videoElement = document.querySelector('video')!
    Object.defineProperty(videoElement, 'duration', { configurable: true, value: 55 * 60 })
    fireEvent.loadedMetadata(videoElement)
    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '47:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(videoElement.currentTime).toBe(0)
    expect(screen.getByRole('alert')).toHaveTextContent('Für diese Zeit wurde kein passendes Video gefunden.')
  })

  it('jumps to 47:00 in the current file in video-per-file mode', () => {
    const video = {
      ...selectedVideo,
      durationSeconds: 55 * 60,
      matchHalf: 1 as const,
      kickoffVideoSeconds: 2 * 60,
      matchDurationSeconds: 45 * 60
    }

    render(
      <VideoWorkspace
        selectedVideo={video}
        matchVideos={[video]}
        jumpTimeMode="video-per-file"
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

    const videoElement = document.querySelector('video')!
    Object.defineProperty(videoElement, 'duration', { configurable: true, value: 55 * 60 })
    fireEvent.loadedMetadata(videoElement)
    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '47:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(videoElement.currentTime).toBe(47 * 60)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('switches to the corresponding file for 47:00 in video-cumulative mode', () => {
    const firstVideo = {
      ...selectedVideo,
      path: '/tmp/video-1.mp4',
      fileName: 'video-1.mp4',
      durationSeconds: 45 * 60,
      matchGroupId: 'Spiel 1'
    }
    const secondVideo = {
      ...selectedVideo,
      path: '/tmp/video-2.mp4',
      fileName: 'video-2.mp4',
      durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1'
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={firstVideo}
        matchVideos={[firstVideo, secondVideo]}
        jumpTimeMode="video-cumulative"
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '47:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(onMatchVideoSeek).toHaveBeenCalledWith(secondVideo, 2 * 60)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('switches to the corresponding part for 47:00 in match-cumulative mode', () => {
    const firstHalf = {
      ...selectedVideo,
      path: '/tmp/half-1.mp4',
      fileName: 'half-1.mp4',
      durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1',
      matchHalf: 1 as const,
      kickoffVideoSeconds: 2 * 60,
      matchDurationSeconds: 45 * 60
    }
    const secondHalf = {
      ...selectedVideo,
      path: '/tmp/half-2.mp4',
      fileName: 'half-2.mp4',
      durationSeconds: 55 * 60,
      matchGroupId: 'Spiel 1',
      matchHalf: 2 as const,
      kickoffVideoSeconds: 3 * 60,
      matchDurationSeconds: 45 * 60
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={firstHalf}
        matchVideos={[firstHalf, secondHalf]}
        jumpTimeMode="match-cumulative"
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    fireEvent.change(screen.getByLabelText(/Springe zu Zeit/), { target: { value: '47:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Springen' }))

    expect(onMatchVideoSeek).toHaveBeenCalledWith(secondHalf, 5 * 60)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('applies a pending match-time seek after the target video has loaded', () => {
    const onSeekOnLoadApplied = vi.fn()
    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        seekOnLoadSeconds={23 * 60 + 10}
        onSeekOnLoadApplied={onSeekOnLoadApplied}
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
    Object.defineProperty(video, 'duration', { configurable: true, value: 55 * 60 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent.loadedMetadata(video)

    expect(video.currentTime).toBe(23 * 60 + 10)
    expect(onSeekOnLoadApplied).toHaveBeenCalledOnce()
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
    finishFullscreenSplash()

    fireEvent.keyDown(window, { code: 'ArrowRight', key: 'ArrowRight', shiftKey: true })
    const hud = screen.getByTestId('fullscreen-keyboard-hud')
    expect(hud).toHaveTextContent('Vorgesprungen')
    expect(hud).toHaveTextContent('5 s')

    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.queryByTestId('fullscreen-keyboard-hud')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('switches videos with Ctrl+Arrow and shows the selected filename in the fullscreen HUD', () => {
    const firstVideo = { ...selectedVideo, path: '/tmp/first.mp4', fileName: 'first.mp4' }
    const currentVideo = { ...selectedVideo, path: '/tmp/current.mp4', fileName: 'current.mp4' }
    const nextVideo = { ...selectedVideo, path: '/tmp/next.mp4', fileName: 'next.mp4' }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={currentVideo}
        matchVideos={[firstVideo, currentVideo, nextVideo]}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    finishFullscreenSplash()

    fireEvent.keyDown(window, { code: 'ArrowLeft', key: 'ArrowLeft', ctrlKey: true })
    expect(onMatchVideoSeek).toHaveBeenLastCalledWith(firstVideo, 0)
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Video gewechselt')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('first.mp4')

    fireEvent.keyDown(window, { code: 'ArrowRight', key: 'ArrowRight', ctrlKey: true })
    expect(onMatchVideoSeek).toHaveBeenLastCalledWith(nextVideo, 0)
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('next.mp4')
  })

  it('keeps the current video and reports the list boundary for Ctrl+Arrow', () => {
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={selectedVideo}
        matchVideos={[selectedVideo]}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        onMatchVideoSeek={onMatchVideoSeek}
      >
        <div />
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    finishFullscreenSplash()

    fireEvent.keyDown(window, { code: 'ArrowLeft', key: 'ArrowLeft', ctrlKey: true })
    expect(onMatchVideoSeek).not.toHaveBeenCalled()
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Kein vorheriges Video')

    fireEvent.keyDown(window, { code: 'ArrowRight', key: 'ArrowRight', ctrlKey: true })
    expect(onMatchVideoSeek).not.toHaveBeenCalled()
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Kein nächstes Video')
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
    finishFullscreenSplash()

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

    const viewport = screen.getByTestId('video-zoom-viewport')
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450,
      toJSON: () => ({})
    } as DOMRect)
    act(() => { fireEvent(window, new Event('resize')) })

    fireEvent.keyDown(window, { code: 'BracketRight', key: '+' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zoom vergrößert')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('1.25×')

    fireEvent.keyDown(window, { code: 'BracketRight', key: '+' })
    fireEvent.keyDown(window, { code: 'Minus', key: '-' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zoom verkleinert')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('1.25×')

    fireEvent.keyDown(window, { code: 'Digit0', key: '0' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zoom zurückgesetzt')
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('1.00×')

    fireEvent.keyDown(window, { code: 'KeyM', key: 'm' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Ton ausgeschaltet')

    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
    expect(screen.getByTestId('fullscreen-keyboard-hud')).toHaveTextContent('Zeitzuordnung nicht festgelegt')
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

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' }))
    expect(screen.getByTestId('fullscreen-orientation')).toHaveClass('fullscreen-orientation--controls-open')

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
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })
    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    finishFullscreenSplash()

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

    const zoomSlider = screen.getByRole('slider', { name: 'Zoomstufe' })
    expect(zoomSlider).toHaveAttribute('max', '10')

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

    fireEvent.change(zoomSlider, { target: { value: '10' } })

    expect(screen.getByText(/10\.00\s*x/)).toBeInTheDocument()
    expect(content.style.transform).toBe('scale(10)')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.getByText(/1\.00\s*x/)).toBeInTheDocument()
    expect(canvas.style.transform).toBe('translate(0px, 0px)')
    expect(content.style.transform).toBe('scale(1)')
  })

  it('keeps a zoomed video visible when returning from fullscreen', () => {
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement
    })

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
        <div />
      </VideoWorkspace>
    )

    const viewport = screen.getByTestId('video-zoom-viewport')
    const canvas = screen.getByTestId('video-zoom-canvas')
    const content = screen.getByTestId('video-zoom-content')
    const playerPanel = viewport.closest('section') as HTMLElement
    vi.spyOn(viewport, 'getBoundingClientRect').mockImplementation(() => {
      const width = fullscreenElement ? 1920 : 640
      const height = fullscreenElement ? 1080 : 360
      return {
        x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height,
        toJSON: () => ({})
      } as DOMRect
    })

    const video = document.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 600 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent.loadedMetadata(video)
    act(() => { fireEvent(window, new Event('resize')) })

    fireEvent.click(screen.getByRole('button', { name: 'Zoom-Steuerung einblenden' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Zoomstufe' }), { target: { value: '10' } })
    expect(canvas.style.transform).toBe('translate(-2880px, -1620px)')

    fullscreenElement = playerPanel
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    act(() => { fireEvent(window, new Event('resize')) })
    expect(canvas.style.transform).toBe('translate(-8640px, -4860px)')

    fullscreenElement = null
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    act(() => { fireEvent(window, new Event('resize')) })

    expect(canvas.style.width).toBe('640px')
    expect(canvas.style.height).toBe('360px')
    expect(canvas.style.transform).toBe('translate(-2880px, -1620px)')
    expect(content.style.transform).toBe('scale(10)')
  })

  it('saves the visible video view as a screenshot when S is pressed', async () => {
    const captureScreenshot = vi.spyOn(window.desktopApi, 'captureScreenshot').mockResolvedValue({
      filePath: '/tmp/Kaderblick Screenshots/test-video.png'
    })
    const drawImage = vi.fn()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      drawImage,
      fillStyle: '',
      filter: 'none'
    } as unknown as CanvasRenderingContext2D)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }))
    })

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
        <div />
      </VideoWorkspace>
    )

    const viewport = screen.getByTestId('video-zoom-viewport')
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 12,
      y: 24,
      left: 12,
      top: 24,
      right: 652,
      bottom: 384,
      width: 640,
      height: 360,
      toJSON: () => ({})
    } as DOMRect)
    const video = document.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 600 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 })
    video.currentTime = 65
    fireEvent.loadedMetadata(video)
    fireEvent.timeUpdate(video)
    act(() => { fireEvent(window, new Event('resize')) })

    await act(async () => {
      fireEvent.keyDown(window, { code: 'KeyS', key: 's' })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(captureScreenshot).toHaveBeenCalledOnce()
    const [imageBytes, suggestedName] = captureScreenshot.mock.calls[0]
    expect(imageBytes).toBeInstanceOf(Uint8Array)
    expect(suggestedName).toBe('test-video_01-05')
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360)
    expect(screen.getByRole('status')).toHaveTextContent('Screenshot gespeichert: test-video.png')
    captureScreenshot.mockRestore()
    getContext.mockRestore()
    toBlob.mockRestore()
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
    expect(screen.getByRole('button', { name: 'Voriges Segment' })).toHaveAttribute('title', 'Zum Segmentanfang; erneut drücken für das vorige Segment')
    expect(screen.getByRole('button', { name: 'Nächstes Segment' })).toHaveAttribute('title', 'Nächstes Segment')
    expect(screen.getByRole('button', { name: 'Rückwärts' })).toHaveAttribute('title', expect.stringContaining('(Shift+R'))
    expect(screen.getByRole('button', { name: 'Langsamer' })).toHaveAttribute('title', 'Langsamer (<)')
    expect(screen.getByRole('button', { name: 'Schneller' })).toHaveAttribute('title', 'Schneller (>)')
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveAttribute('title', 'Filter einblenden (F)')
    expect(screen.getByRole('button', { name: 'Vollbild' })).toHaveAttribute('title', 'Vollbild (F11)')
    expect(screen.getByRole('button', { name: 'Springen' })).toHaveAttribute('title', expect.stringContaining('(Enter)'))

    fireEvent.click(screen.getByText('Tastenkürzel'))
    expect(screen.getByText('Ein Bild zurück')).toBeInTheDocument()
    expect(screen.getByText('Ein Bild vor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    expect(screen.getByRole('button', { name: 'Voriges Segment' })).toHaveAttribute('title', expect.stringContaining('(←)'))
    expect(screen.getByRole('button', { name: 'Nächstes Segment' })).toHaveAttribute('title', expect.stringContaining('(→)'))
    expect(screen.getByText('Segmentanfang; zweimal: voriges Segment')).toBeInTheDocument()
    expect(screen.getByText('Nächstes Segment', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Nur Segmente abspielen ein-/ausschalten')).toBeInTheDocument()
    expect(screen.getByText('Screenshot speichern')).toBeInTheDocument()
  })

  it('shows only manually selected perspective videos and synchronizes them by match time', () => {
    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
    const mainVideo = {
      ...selectedVideo,
      matchGroupId: 'Spiel 1',
      durationSeconds: 105 * 60,
      matchTimeRanges: [
        { id: 'first', videoStartSeconds: 2 * 60, videoEndSeconds: 47 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 },
        { id: 'second', videoStartSeconds: 58 * 60, videoEndSeconds: 103 * 60, matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 }
      ]
    }
    const rightCamera = {
      ...selectedVideo,
      path: '/tmp/camera-right.mp4', fileName: 'camera-right.mp4', fileUrl: 'file:///tmp/camera-right.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 105 * 60,
      matchTimeRanges: [
        { id: 'first', videoStartSeconds: 60, videoEndSeconds: 46 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 },
        { id: 'second', videoStartSeconds: 57 * 60, videoEndSeconds: 102 * 60, matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 }
      ]
    }
    const phoneClip = {
      ...selectedVideo,
      path: '/tmp/phone.mp4', fileName: 'phone.mp4', fileUrl: 'file:///tmp/phone.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 180,
      matchTimeRanges: [{ id: 'clip', videoStartSeconds: 10, videoEndSeconds: 130, matchStartSeconds: 63 * 60, matchEndSeconds: 65 * 60 }]
    }
    const unconfiguredCamera = {
      ...selectedVideo,
      path: '/tmp/unconfigured.mp4', fileName: 'unconfigured.mp4', fileUrl: 'file:///tmp/unconfigured.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 105 * 60
    }
    const onMatchVideoSeek = vi.fn()

    render(
      <VideoWorkspace
        selectedVideo={mainVideo}
        matchVideos={[mainVideo, rightCamera, phoneClip, unconfiguredCamera]}
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible={false}
        repeatSingleSegment={false}
        onMatchVideoSeek={onMatchVideoSeek}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
      >
        <div />
      </VideoWorkspace>
    )

    const mainElement = document.querySelector('video')!
    Object.defineProperty(mainElement, 'duration', { configurable: true, value: 105 * 60 })
    mainElement.currentTime = 32 * 60
    fireEvent.loadedMetadata(mainElement)
    fireEvent.timeUpdate(mainElement)

    const perspectiveButton = screen.getByRole('button', { name: 'Perspektiven' })
    expect(perspectiveButton.tagName).toBe('BUTTON')
    expect(perspectiveButton).toHaveAttribute('type', 'button')
    expect(perspectiveButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(perspectiveButton)
    expect(perspectiveButton).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zusatzperspektiven anzeigen' }))
    expect(perspectiveButton).toHaveClass('button--active')
    expect(screen.queryByLabelText('Zusatzperspektive camera-right.mp4')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Zusatzperspektive phone.mp4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'camera-right.mp4' }))
    const preview = screen.getByLabelText('Zusatzperspektive camera-right.mp4') as HTMLVideoElement
    fireEvent.loadedMetadata(preview)
    expect(preview.src).toBe(rightCamera.fileUrl)
    expect(preview.currentTime).toBe(31 * 60)
    expect(screen.queryByLabelText('Zusatzperspektive phone.mp4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'phone.mp4' }))
    expect(screen.queryByTestId('perspective-preview-/tmp/phone.mp4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'unconfigured.mp4' }))
    expect(screen.queryByTestId('perspective-preview-/tmp/unconfigured.mp4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'camera-right.mp4 als Hauptansicht öffnen' }))
    expect(onMatchVideoSeek).toHaveBeenCalledWith(rightCamera, 31 * 60)

    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
  })

  it('shows synchronized perspectives before kickoff when the target recordings already contain footage', () => {
    const leftCamera = {
      ...selectedVideo,
      path: '/tmp/left.mp4', fileName: 'left.mp4', fileUrl: 'file:///tmp/left.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 110 * 60,
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 30 * 60, videoEndSeconds: 75 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const rightCamera = {
      ...selectedVideo,
      path: '/tmp/right.mp4', fileName: 'right.mp4', fileUrl: 'file:///tmp/right.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 110 * 60,
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 29 * 60, videoEndSeconds: 74 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const camcorder = {
      ...selectedVideo,
      path: '/tmp/camcorder.mp4', fileName: 'camcorder.mp4', fileUrl: 'file:///tmp/camcorder.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 3 * 60, videoEndSeconds: 48 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const videos = [leftCamera, rightCamera, camcorder]
    localStorage.setItem('kaderblick-perspectives-visible', 'true')
    localStorage.setItem('kaderblick-perspective-paths', JSON.stringify(videos.map((video) => video.path)))

    try {
      const { rerender } = render(
        <VideoWorkspace
          selectedVideo={leftCamera}
          matchVideos={videos}
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

      let mainElement = document.querySelector('video')!
      mainElement.currentTime = 5 * 60
      fireEvent.timeUpdate(mainElement)

      const rightPreview = screen.getByLabelText('Zusatzperspektive right.mp4') as HTMLVideoElement
      fireEvent.loadedMetadata(rightPreview)
      expect(rightPreview.currentTime).toBe(4 * 60)
      expect(screen.queryByLabelText('Zusatzperspektive camcorder.mp4')).not.toBeInTheDocument()

      rerender(
        <VideoWorkspace
          selectedVideo={camcorder}
          matchVideos={videos}
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

      mainElement = document.querySelector('video')!
      mainElement.currentTime = 2 * 60
      fireEvent.timeUpdate(mainElement)
      expect(screen.getByLabelText('Zusatzperspektive left.mp4')).toBeInTheDocument()
      expect(screen.getByLabelText('Zusatzperspektive right.mp4')).toBeInTheDocument()
    } finally {
      localStorage.removeItem('kaderblick-perspectives-visible')
      localStorage.removeItem('kaderblick-perspective-paths')
    }
  })

  it('moves available perspectives away from opened fullscreen flyouts', () => {
    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
    const mainVideo = {
      ...selectedVideo,
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'main', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const otherVideo = {
      ...selectedVideo,
      path: '/tmp/other.mp4', fileName: 'other.mp4', fileUrl: 'file:///tmp/other.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'other', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    render(
      <VideoWorkspace
        selectedVideo={mainVideo}
        matchVideos={[mainVideo, otherVideo]}
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

    const mainElement = document.querySelector('video')!
    mainElement.currentTime = 10 * 60
    fireEvent.timeUpdate(mainElement)
    fireEvent.click(screen.getByText('Perspektiven'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zusatzperspektiven anzeigen' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'other.mp4' }))

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    finishFullscreenSplash()

    const stack = screen.getByLabelText('Aktuell verfügbare Zusatzperspektiven')
    expect(stack).toHaveClass('perspective-preview-stack--right', 'perspective-preview-stack--top')

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Werkzeuge einblenden' }))
    expect(stack).toHaveClass('perspective-preview-stack--left', 'perspective-preview-stack--top')

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Info einblenden' }))
    expect(stack).toHaveClass('perspective-preview-stack--right', 'perspective-preview-stack--bottom')

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' }))
    expect(stack).toHaveClass('perspective-preview-stack--right', 'perspective-preview-stack--top')

    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
  })

  it('does not restart a playing perspective on every main-video time update', () => {
    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const mainVideo = {
      ...selectedVideo,
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'main', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const otherVideo = {
      ...selectedVideo,
      path: '/tmp/stable.mp4', fileName: 'stable.mp4', fileUrl: 'file:///tmp/stable.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'other', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    render(
      <VideoWorkspace
        selectedVideo={mainVideo}
        matchVideos={[mainVideo, otherVideo]}
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

    const mainElement = document.querySelector('video')!
    mainElement.currentTime = 10 * 60
    fireEvent.timeUpdate(mainElement)
    fireEvent.play(mainElement)
    fireEvent.click(screen.getByText('Perspektiven'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zusatzperspektiven anzeigen' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'stable.mp4' }))
    const playCallsAfterMount = playSpy.mock.calls.length
    const previewElement = screen.getByLabelText('Zusatzperspektive stable.mp4') as HTMLVideoElement
    Object.defineProperty(previewElement, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA })
    const initialPreviewSource = previewElement.src

    for (let step = 1; step <= 6; step += 1) {
      mainElement.currentTime = 10 * 60 + step * 0.25
      fireEvent.timeUpdate(mainElement)
    }

    expect(playSpy).toHaveBeenCalledTimes(playCallsAfterMount)
    expect(previewElement.src).toBe(initialPreviewSource)

    mainElement.currentTime = 11 * 60
    fireEvent.timeUpdate(mainElement)
    expect(previewElement.src).toBe(initialPreviewSource)
    expect(previewElement.currentTime).toBe(11 * 60)
    playSpy.mockRestore()
    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
  })

  it('reduces only a perspective that repeatedly drops video frames', () => {
    vi.useFakeTimers()
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    localStorage.removeItem('kaderblick-perspectives-visible')
    localStorage.removeItem('kaderblick-perspective-paths')
    const mainVideo = {
      ...selectedVideo,
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'main', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const choppyVideo = {
      ...selectedVideo,
      path: '/tmp/choppy.mp4', fileName: 'choppy.mp4', fileUrl: 'file:///tmp/choppy.mp4',
      matchGroupId: 'Spiel 1', durationSeconds: 50 * 60,
      matchTimeRanges: [{ id: 'other', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }

    try {
      render(
        <VideoWorkspace
          selectedVideo={mainVideo}
          matchVideos={[mainVideo, choppyVideo]}
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

      const mainElement = document.querySelector('video')!
      mainElement.currentTime = 10 * 60
      fireEvent.timeUpdate(mainElement)
      fireEvent.play(mainElement)
      fireEvent.click(screen.getByText('Perspektiven'))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Zusatzperspektiven anzeigen' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'choppy.mp4' }))

      const preview = screen.getByLabelText('Zusatzperspektive choppy.mp4') as HTMLVideoElement
      const qualitySamples = [
        { totalVideoFrames: 0, droppedVideoFrames: 0 },
        { totalVideoFrames: 30, droppedVideoFrames: 5 },
        { totalVideoFrames: 60, droppedVideoFrames: 10 }
      ]
      Object.defineProperty(preview, 'getVideoPlaybackQuality', {
        configurable: true,
        value: vi.fn(() => qualitySamples.shift() ?? { totalVideoFrames: 60, droppedVideoFrames: 10 })
      })

      expect(preview.src).toBe(choppyVideo.fileUrl)
      act(() => { vi.advanceTimersByTime(6000) })

      expect(new URL(preview.src).searchParams.get('preview')).toBe('1')
      expect(new URL(preview.src).searchParams.get('t')).toBe(String(10 * 60))
      expect(screen.getByText('Optimierte Vorschau')).toBeInTheDocument()
    } finally {
      playSpy.mockRestore()
      vi.useRealTimers()
      localStorage.removeItem('kaderblick-perspectives-visible')
      localStorage.removeItem('kaderblick-perspective-paths')
    }
  })
})

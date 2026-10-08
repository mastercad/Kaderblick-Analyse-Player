import { act, fireEvent, render, screen } from '@testing-library/react'
import { defaultFilterSettings } from '../../../../common/filterPresets'

const requestPreview = vi.fn()

vi.mock('./useTimelinePreview', () => ({
  useTimelinePreview: () => ({
    frame: {
      imageUrl: 'data:image/webp;base64,dGVzdA==',
      column: 2,
      row: 1,
      columns: 5,
      rows: 5
    },
    status: { phase: 'ready', percent: 100, message: 'Vorschau bereit' },
    requestPreview
  })
}))

import { VideoWorkspace } from './VideoWorkspace'

describe('VideoWorkspace – timeline preview in fullscreen', () => {
  it('shows the generated storyboard frame above the fullscreen timeline', () => {
    render(
      <VideoWorkspace
        selectedVideo={{
          path: '/tmp/test.mp4',
          fileName: 'test.mp4',
          fileUrl: 'file:///tmp/test.mp4',
          playbackMode: 'direct'
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
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent.loadedMetadata(video)

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    fireEvent.click(screen.getByRole('button', { name: 'Wiedergabe und Timeline einblenden' }))
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 200 })
    })
    fireEvent.mouseMove(timeline, { clientX: 100 })

    expect(requestPreview).toHaveBeenCalledWith(50)
    const preview = timeline.querySelector('.timeline__preview-image')
    expect(preview).toHaveStyle({
      backgroundImage: 'url("data:image/webp;base64,dGVzdA==")',
      backgroundSize: '500% 500%'
    })
    expect(timeline.closest('.fullscreen-card--stacked')).not.toBeNull()
  })
})

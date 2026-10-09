import { fireEvent, render, screen, within } from '@testing-library/react'
import type { VideoFileDescriptor } from '../../../../common/types'
import { LibraryToolbar } from './LibraryToolbar'

const makeVideo = (index: number): VideoFileDescriptor => ({
  path: `/videos/camera-${index}-vollstaendiger-dateiname.mp4`,
  fileName: `camera-${index}-vollstaendiger-dateiname.mp4`,
  fileUrl: `file:///videos/camera-${index}.mp4`,
  playbackMode: 'direct',
  durationSeconds: 90 * 60
})

const baseProps = {
  compact: true,
  videoLibrary: Array.from({ length: 6 }, (_, index) => makeVideo(index + 1)),
  activeVideoIndex: 1,
  matchedSegmentCount: 1,
  totalSegmentCount: 1,
  onLoadVideos: async () => undefined,
  onAddVideos: async () => undefined,
  onAddOnlineVideo: () => undefined,
  onSelectVideo: () => undefined,
  onRemoveVideo: () => undefined,
  onLoadCsv: async () => undefined
}

describe('LibraryToolbar', () => {
  it('keeps all loaded videos in the compact overview and marks the active one', () => {
    render(<LibraryToolbar {...baseProps} />)

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    expect(within(list).getByText('camera-6-vollstaendiger-dateiname.mp4')).toBeInTheDocument()
    expect(within(list).getByText('Aktiv')).toBeInTheDocument()
    expect(within(list).getAllByText('01:30:00')).toHaveLength(6)
  })

  it('shows CSV and segment information as compact status values', () => {
    render(<LibraryToolbar {...baseProps} selectedCsv={{ path: '/segments/game.csv', fileName: 'game.csv', content: '' }} />)

    const status = screen.getByLabelText('Bibliotheksstatus')
    expect(status).toHaveTextContent('CSV')
    expect(status).toHaveTextContent('game.csv')
    expect(status).toHaveTextContent('Segmente')
    expect(status).toHaveTextContent('1 / 1')
  })

  it('selects only the video explicitly clicked by the user', () => {
    const onSelectVideo = vi.fn()
    render(<LibraryToolbar {...baseProps} onSelectVideo={onSelectVideo} />)

    fireEvent.click(screen.getByTitle('/videos/camera-5-vollstaendiger-dateiname.mp4'))

    expect(onSelectVideo).toHaveBeenCalledOnce()
    expect(onSelectVideo).toHaveBeenCalledWith(4)
  })

  it('requests removal of the selected list item without selecting it', () => {
    const onRemoveVideo = vi.fn()
    const onSelectVideo = vi.fn()
    render(<LibraryToolbar {...baseProps} onRemoveVideo={onRemoveVideo} onSelectVideo={onSelectVideo} />)

    fireEvent.click(screen.getByRole('button', { name: 'camera-3-vollstaendiger-dateiname.mp4 aus der Bibliothek entfernen' }))

    expect(onRemoveVideo).toHaveBeenCalledOnce()
    expect(onRemoveVideo).toHaveBeenCalledWith(2)
    expect(onSelectVideo).not.toHaveBeenCalled()
  })
})

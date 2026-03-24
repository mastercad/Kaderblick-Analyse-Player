import { fireEvent, render, screen } from '@testing-library/react'
import type { Segment } from '../../../../common/types'
import { SegmentTimeline } from './SegmentTimeline'

const segments: Segment[] = [
  {
    id: 'segment-1',
    sourceVideoName: 'Testspiel.mp4',
    sourceVideoPath: '/tmp/Testspiel.mp4',
    startSeconds: 30,
    endSeconds: 40,
    lengthSeconds: 10,
    title: 'Tor',
    subTitle: '',
    audioTrack: '1'
  },
  {
    id: 'segment-2',
    sourceVideoName: 'Testspiel.mp4',
    sourceVideoPath: '/tmp/Testspiel.mp4',
    startSeconds: 70,
    endSeconds: 82,
    lengthSeconds: 12,
    title: 'Chance',
    subTitle: '',
    audioTrack: '1'
  }
]

describe('SegmentTimeline', () => {
  it('renders a marker for every segment', () => {
    render(
      <SegmentTimeline duration={100} currentTime={35} activeSegmentIndex={0} segments={segments} onSeek={() => undefined} />
    )

    expect(screen.getAllByTestId('timeline-segment')).toHaveLength(2)
  })

  it('seeks when the timeline is clicked', () => {
    const onSeek = vi.fn()

    render(<SegmentTimeline duration={100} currentTime={0} activeSegmentIndex={-1} segments={segments} onSeek={onSeek} />)

    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200 }),
      configurable: true
    })

    fireEvent.click(timeline, { clientX: 100 })

    expect(onSeek).toHaveBeenCalledWith(50)
  })
})

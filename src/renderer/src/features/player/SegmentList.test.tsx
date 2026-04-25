import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Segment } from '../../../../common/types'
import { SegmentList } from './SegmentList'

const makeSegment = (id: string, start: number, end: number, title: string, subTitle = ''): Segment => ({
  id,
  sourceVideoName: 'test.mp4',
  sourceVideoPath: '/tmp/test.mp4',
  startSeconds: start,
  endSeconds: end,
  lengthSeconds: end - start,
  title,
  subTitle,
  audioTrack: '1'
})

const twoSegments = [
  makeSegment('s1', 60, 90, 'Erstes Tor', 'Spieltag 1'),
  makeSegment('s2', 90, 120, 'Zweites Tor', 'Spieltag 2')
]

describe('SegmentList', () => {
  it('renders a card for each segment', () => {
    render(<SegmentList segments={twoSegments} activeSegmentIndex={-1} onSelectSegment={() => {}} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('marks the active segment with segment-card--active class', () => {
    render(<SegmentList segments={twoSegments} activeSegmentIndex={1} onSelectSegment={() => {}} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).not.toHaveClass('segment-card--active')
    expect(buttons[1]).toHaveClass('segment-card--active')
  })

  it('calls onSelectSegment with the correct index when a card is clicked', () => {
    const onSelectSegment = vi.fn()
    render(<SegmentList segments={twoSegments} activeSegmentIndex={-1} onSelectSegment={onSelectSegment} />)

    fireEvent.click(screen.getAllByRole('button')[1])

    expect(onSelectSegment).toHaveBeenCalledWith(1)
  })

  it('shows "Ohne Titel" when a segment has no title', () => {
    render(<SegmentList segments={[makeSegment('u1', 0, 30, '')]} activeSegmentIndex={-1} onSelectSegment={() => {}} />)

    expect(screen.getByText('Ohne Titel')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no segments', () => {
    render(<SegmentList segments={[]} activeSegmentIndex={-1} onSelectSegment={() => {}} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/Nach dem Laden/)).toBeInTheDocument()
  })

  it('does NOT call scrollIntoView when activeSegmentIndex changes', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    const { rerender } = render(
      <SegmentList segments={twoSegments} activeSegmentIndex={-1} onSelectSegment={() => {}} />
    )
    act(() => {
      rerender(<SegmentList segments={twoSegments} activeSegmentIndex={0} onSelectSegment={() => {}} />)
    })
    act(() => {
      rerender(<SegmentList segments={twoSegments} activeSegmentIndex={1} onSelectSegment={() => {}} />)
    })

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

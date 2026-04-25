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

// ---------------------------------------------------------------------------
// Drag support
// ---------------------------------------------------------------------------

describe('SegmentTimeline – drag', () => {
  const setupTimeline = (onSeek: ReturnType<typeof vi.fn>, extra?: { onScrubStart?: ReturnType<typeof vi.fn>, onScrub?: ReturnType<typeof vi.fn> }) => {
    render(<SegmentTimeline duration={100} currentTime={0} activeSegmentIndex={-1} segments={[]} onSeek={onSeek} onScrubStart={extra?.onScrubStart} onScrub={extra?.onScrub} />)
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200 }),
      configurable: true
    })
    // setPointerCapture / releasePointerCapture are not implemented in happy-dom
    Object.defineProperty(timeline, 'setPointerCapture', { value: vi.fn(), configurable: true })
    Object.defineProperty(timeline, 'releasePointerCapture', { value: vi.fn(), configurable: true })
    return timeline
  }

  it('calls onSeek with the final position on pointerup after dragging', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    fireEvent.pointerDown(timeline, { clientX: 20 })
    fireEvent.pointerMove(timeline, { clientX: 80 })
    fireEvent.pointerUp(timeline, { clientX: 150 })

    // 150 / 200 * 100 = 75
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(75)
  })

  it('does NOT call onSeek during pointermove — only on pointerup', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    fireEvent.pointerDown(timeline, { clientX: 0 })
    fireEvent.pointerMove(timeline, { clientX: 40 })
    fireEvent.pointerMove(timeline, { clientX: 80 })
    fireEvent.pointerMove(timeline, { clientX: 120 })

    expect(onSeek).not.toHaveBeenCalled()
  })

  it('calls onScrub on each pointermove during drag', () => {
    const onSeek = vi.fn()
    const onScrub = vi.fn()
    render(<SegmentTimeline duration={100} currentTime={0} activeSegmentIndex={-1} segments={[]} onSeek={onSeek} onScrub={onScrub} />)
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', { value: () => ({ left: 0, width: 200 }), configurable: true })
    Object.defineProperty(timeline, 'setPointerCapture', { value: vi.fn(), configurable: true })
    Object.defineProperty(timeline, 'releasePointerCapture', { value: vi.fn(), configurable: true })

    fireEvent.pointerDown(timeline, { clientX: 0 })
    fireEvent.pointerMove(timeline, { clientX: 100 }) // 50
    fireEvent.pointerMove(timeline, { clientX: 150 }) // 75

    expect(onScrub).toHaveBeenCalledTimes(2)
    expect(onScrub).toHaveBeenNthCalledWith(1, 50)
    expect(onScrub).toHaveBeenNthCalledWith(2, 75)
    // onSeek must NOT have been called yet
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('does NOT call onSeek on pointerdown alone (no movement)', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    fireEvent.pointerDown(timeline, { clientX: 100 })

    expect(onSeek).not.toHaveBeenCalled()
  })

  it('calls onSeek via pointerup when no drag occurred (simple click)', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    // pointerdown without pointermove → pointerup now always calls onSeek and
    // suppresses the subsequent click so that setDragRatio(null) and the seek
    // state updates are batched in the same React event.
    fireEvent.pointerDown(timeline, { clientX: 100 })
    fireEvent.pointerUp(timeline, { clientX: 100 })
    fireEvent.click(timeline, { clientX: 100 })

    // 100 / 200 * 100 = 50
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(50)
  })

  it('suppresses the click event that fires right after a drag pointerup', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    fireEvent.pointerDown(timeline, { clientX: 0 })
    fireEvent.pointerMove(timeline, { clientX: 100 })
    fireEvent.pointerUp(timeline, { clientX: 100 })
    // Browser fires click after pointerup — should be suppressed
    fireEvent.click(timeline, { clientX: 100 })

    expect(onSeek).toHaveBeenCalledTimes(1) // only from pointerup, not from click
  })

  it('shows the tooltip at the drag position while dragging', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    fireEvent.pointerDown(timeline, { clientX: 0 })
    fireEvent.pointerMove(timeline, { clientX: 100 }) // 100/200 * 100s = 50s → 00:50

    expect(screen.getByText('00:50')).toBeInTheDocument()
  })

  it('moves the needle to the drag position during drag', () => {
    const onSeek = vi.fn()
    const timeline = setupTimeline(onSeek)

    fireEvent.pointerDown(timeline, { clientX: 0 })
    fireEvent.pointerMove(timeline, { clientX: 100 }) // 50%

    // eslint-disable-next-line testing-library/no-node-access
    const needle = timeline.querySelector('.timeline__needle')
    expect(needle).toHaveStyle({ left: '50%' })
  })
})

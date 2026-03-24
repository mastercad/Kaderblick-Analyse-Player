import { getSegmentPlaybackTransition } from './segmentPlayback'
import type { Segment } from './types'

const segments: Segment[] = [
  {
    id: 'segment-1',
    sourceVideoName: 'match.mp4',
    sourceVideoPath: '/tmp/match.mp4',
    startSeconds: 12,
    endSeconds: 18,
    lengthSeconds: 6,
    title: 'Erstes Segment',
    subTitle: '',
    audioTrack: '1'
  },
  {
    id: 'segment-2',
    sourceVideoName: 'match.mp4',
    sourceVideoPath: '/tmp/match.mp4',
    startSeconds: 30,
    endSeconds: 36,
    lengthSeconds: 6,
    title: 'Zweites Segment',
    subTitle: '',
    audioTrack: '1'
  }
]

describe('segmentPlayback', () => {
  it('repeats the current segment when repeat mode is enabled', () => {
    expect(getSegmentPlaybackTransition(segments, 0, { repeatSingleSegment: true })).toEqual({
      action: 'repeat-current',
      nextIndex: 0,
      nextTimeSeconds: 12
    })
  })

  it('moves to the next segment in normal segment mode', () => {
    expect(getSegmentPlaybackTransition(segments, 0, { repeatSingleSegment: false })).toEqual({
      action: 'seek-next',
      nextIndex: 1,
      nextTimeSeconds: 30
    })
  })

  it('pauses after the final segment when repeat mode is disabled', () => {
    expect(getSegmentPlaybackTransition(segments, 1, { repeatSingleSegment: false })).toEqual({
      action: 'pause',
      nextIndex: -1,
      nextTimeSeconds: 36
    })
  })
})

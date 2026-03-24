import type { Segment, SegmentPlaybackOptions } from './types'

export interface SegmentPlaybackTransition {
  action: 'repeat-current' | 'seek-next' | 'pause'
  nextIndex: number
  nextTimeSeconds: number
}

export const getSegmentPlaybackTransition = (
  segments: Segment[],
  sequenceIndex: number,
  options: SegmentPlaybackOptions
): SegmentPlaybackTransition => {
  const currentSegment = segments[sequenceIndex]

  if (!currentSegment) {
    return {
      action: 'pause',
      nextIndex: -1,
      nextTimeSeconds: 0
    }
  }

  if (options.repeatSingleSegment) {
    return {
      action: 'repeat-current',
      nextIndex: sequenceIndex,
      nextTimeSeconds: currentSegment.startSeconds
    }
  }

  const nextSegment = segments[sequenceIndex + 1]

  if (!nextSegment) {
    return {
      action: 'pause',
      nextIndex: -1,
      nextTimeSeconds: currentSegment.endSeconds
    }
  }

  return {
    action: 'seek-next',
    nextIndex: sequenceIndex + 1,
    nextTimeSeconds: nextSegment.startSeconds
  }
}

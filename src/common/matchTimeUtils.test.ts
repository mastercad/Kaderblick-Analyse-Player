import { describe, expect, it } from 'vitest'
import type { VideoFileDescriptor } from './types'
import { findMatchVideoSeekTarget, findSynchronizedPerspectiveTime, findVideoTimeForMatchTime, matchTimeToVideoTime, playerInputToVideoTime, resolvePlayerJumpTarget, resolveSegmentForPlayback, videoTimeToMatchTime, videoTimeToPlayerInput } from './matchTimeUtils'
import type { Segment } from './types'

describe('match time conversion', () => {
  it('uses the kickoff position for the first half', () => {
    expect(matchTimeToVideoTime(9 * 60, 4 * 60, 1)).toBe(13 * 60)
    expect(videoTimeToMatchTime(13 * 60, 4 * 60, 1)).toBe(9 * 60)
  })

  it('subtracts the 45-minute baseline for the second half', () => {
    expect(matchTimeToVideoTime(45 * 60 + 12, 2 * 60 + 41, 2)).toBe(2 * 60 + 53)
    expect(matchTimeToVideoTime(85 * 60, 2 * 60 + 41, 2)).toBe(42 * 60 + 41)
  })

  it('uses the configured half duration for shorter matches', () => {
    expect(matchTimeToVideoTime(36 * 60, 2 * 60, 2, 35 * 60)).toBe(3 * 60)
    expect(matchTimeToVideoTime(62 * 60, 2 * 60, 2, 35 * 60)).toBe(29 * 60)
    expect(videoTimeToMatchTime(29 * 60, 2 * 60, 2, 35 * 60)).toBe(62 * 60)
  })

  it('finds the first-half video in the same match for an earlier match time', () => {
    const makeVideo = (path: string, group: string, half: 1 | 2, kickoff: number): VideoFileDescriptor => ({
      path,
      fileName: `${path}.mp4`,
      fileUrl: `file://${path}.mp4`,
      playbackMode: 'direct',
      durationSeconds: 55 * 60,
      matchGroupId: group,
      matchHalf: half,
      kickoffVideoSeconds: kickoff,
      matchDurationSeconds: 35 * 60
    })
    const otherMatch = makeVideo('/other-first', 'Spiel 2', 1, 20 * 60)
    const firstHalf = makeVideo('/first', 'Spiel 1', 1, 2 * 60)
    const secondHalf = makeVideo('/second', 'Spiel 1', 2, 3 * 60)

    expect(findMatchVideoSeekTarget([otherMatch, firstHalf, secondHalf], secondHalf, 23 * 60 + 10)).toEqual({
      video: firstHalf,
      videoSeconds: 25 * 60 + 10
    })

    expect(resolvePlayerJumpTarget('video-per-file', [firstHalf, secondHalf], secondHalf, 23 * 60 + 10)).toEqual({
      video: secondHalf,
      videoSeconds: 23 * 60 + 10
    })
    expect(resolvePlayerJumpTarget('video-cumulative', [firstHalf, secondHalf], secondHalf, 60 * 60 + 10)).toEqual({
      video: secondHalf,
      videoSeconds: 5 * 60 + 10
    })
    expect(resolvePlayerJumpTarget('video-cumulative', [firstHalf, secondHalf], secondHalf, 55 * 60)).toEqual({
      video: secondHalf,
      videoSeconds: 0
    })
    expect(resolvePlayerJumpTarget('match-per-part', [firstHalf, secondHalf], secondHalf, 23 * 60 + 10)).toEqual({
      video: secondHalf,
      videoSeconds: 26 * 60 + 10
    })
    expect(resolvePlayerJumpTarget('match-cumulative', [firstHalf, secondHalf], secondHalf, 23 * 60 + 10)).toEqual({
      video: firstHalf,
      videoSeconds: 25 * 60 + 10
    })
  })

  it('automatically treats ungrouped halves as videos of the same game', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first',
      fileName: 'first.mp4',
      fileUrl: 'file:///first.mp4',
      playbackMode: 'direct',
      durationSeconds: 3290.88,
      matchHalf: 1,
      kickoffVideoSeconds: 90,
      matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second',
      fileName: 'second.mp4',
      fileUrl: 'file:///second.mp4',
      playbackMode: 'direct',
      durationSeconds: 3027.84,
      matchHalf: 2,
      kickoffVideoSeconds: 254,
      matchDurationSeconds: 45 * 60
    }

    expect(resolvePlayerJumpTarget(
      'match-cumulative',
      [secondHalf, firstHalf],
      secondHalf,
      23 * 60 + 45
    )).toEqual({
      video: firstHalf,
      videoSeconds: 25 * 60 + 15
    })
  })

  it('uses the first fitting ungrouped video when several files represent the same half', () => {
    const currentVideo: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 50 * 60, matchHalf: 2, kickoffVideoSeconds: 4 * 60, matchDurationSeconds: 45 * 60
    }
    const makeFirstHalf = (path: string): VideoFileDescriptor => ({
      path, fileName: `${path}.mp4`, fileUrl: `file://${path}.mp4`, playbackMode: 'direct',
      durationSeconds: 50 * 60, matchHalf: 1, kickoffVideoSeconds: 90, matchDurationSeconds: 45 * 60
    })

    const firstHalfA = makeFirstHalf('/first-a')
    const firstHalfB = makeFirstHalf('/first-b')
    expect(resolvePlayerJumpTarget(
      'match-cumulative',
      [firstHalfA, currentVideo, firstHalfB],
      currentVideo,
      23 * 60 + 45
    )).toEqual({
      video: firstHalfA,
      videoSeconds: 25 * 60 + 15
    })
  })

  it('uses library order for a cumulative match timeline when half assignments are duplicated', () => {
    const firstVideo: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondVideo: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 52 * 60, matchHalf: 1, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }

    expect(resolvePlayerJumpTarget('match-cumulative', [firstVideo, secondVideo], firstVideo, 46 * 60)).toEqual({
      video: secondVideo,
      videoSeconds: 4 * 60
    })
  })

  it('converts absolute video positions back to all supported input formats', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 50 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }
    const videos = [firstHalf, secondHalf]

    expect(videoTimeToPlayerInput('video-per-file', videos, secondHalf, 12 * 60 + 45)).toBe(12 * 60 + 45)
    expect(videoTimeToPlayerInput('video-cumulative', videos, secondHalf, 12 * 60 + 45)).toBe(67 * 60 + 45)
    expect(videoTimeToPlayerInput('match-per-part', videos, secondHalf, 12 * 60 + 45)).toBe(9 * 60 + 45)
    expect(videoTimeToPlayerInput('match-cumulative', videos, secondHalf, 12 * 60 + 45)).toBe(54 * 60 + 45)
  })

  it.each([
    ['video-per-file', 20 * 60],
    ['video-cumulative', 75 * 60],
    ['match-per-part', 17 * 60],
    ['match-cumulative', 62 * 60]
  ] as const)('keeps a segment on its selected video in %s mode', (mode, inputSeconds) => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 50 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }

    expect(playerInputToVideoTime(mode, [firstHalf, secondHalf], secondHalf, inputSeconds)).toBe(20 * 60)
  })

  it('resolves minute 65 to the second-half video and its configured video position', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 50 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }

    expect(resolvePlayerJumpTarget('match-cumulative', [firstHalf, secondHalf], secondHalf, 65 * 60)).toEqual({
      video: secondHalf,
      videoSeconds: 23 * 60
    })
  })

  it('maps an arbitrary match-time clip from its configured video position', () => {
    const clip: VideoFileDescriptor = {
      path: '/clip', fileName: 'clip.mp4', fileUrl: 'file:///clip.mp4', playbackMode: 'direct',
      durationSeconds: 5 * 60,
      matchGroupId: 'Spiel 1',
      matchTimeStartSeconds: 63 * 60 + 40,
      matchTimeEndSeconds: 68 * 60 + 20,
      videoTimeStartSeconds: 12
    }

    expect(resolvePlayerJumpTarget('match-cumulative', [clip], clip, 64 * 60 + 10)).toEqual({
      video: clip,
      videoSeconds: 42
    })
    expect(videoTimeToPlayerInput('match-cumulative', [clip], clip, 42)).toBe(64 * 60 + 10)
    expect(videoTimeToPlayerInput('match-cumulative', [clip], clip, 0)).toBeNull()
    expect(resolvePlayerJumpTarget('match-cumulative', [clip], clip, 62 * 60)).toBeNull()
    expect(resolvePlayerJumpTarget('match-cumulative', [clip], clip, 69 * 60)).toBeNull()

    const segment: Segment = {
      id: 'clip-segment', sourceVideoName: clip.fileName, sourceVideoPath: clip.path,
      startSeconds: 64 * 60 + 10, endSeconds: 64 * 60 + 20, lengthSeconds: 10,
      title: '', subTitle: '', audioTrack: '1'
    }
    expect(resolveSegmentForPlayback(segment, 'match-cumulative', [clip], clip)).toEqual({
      ...segment,
      startSeconds: 42,
      endSeconds: 52,
      lengthSeconds: 10
    })
  })

  it('maps both halves in one recording while leaving the halftime break unmapped', () => {
    const fullMatch: VideoFileDescriptor = {
      path: '/full-match', fileName: 'full-match.mp4', fileUrl: 'file:///full-match.mp4', playbackMode: 'direct',
      durationSeconds: 105 * 60, matchGroupId: 'Spiel 1',
      matchTimeRanges: [
        { id: 'first', videoStartSeconds: 2 * 60, videoEndSeconds: 47 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 },
        { id: 'second', videoStartSeconds: 58 * 60, videoEndSeconds: 103 * 60, matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 }
      ]
    }

    expect(findVideoTimeForMatchTime([fullMatch], fullMatch, 30 * 60)).toBe(32 * 60)
    expect(findVideoTimeForMatchTime([fullMatch], fullMatch, 45 * 60)).toBe(58 * 60)
    expect(findVideoTimeForMatchTime([fullMatch], fullMatch, 60 * 60)).toBe(73 * 60)
    expect(findVideoTimeForMatchTime([fullMatch], fullMatch, 90 * 60)).toBe(103 * 60)
    expect(videoTimeToPlayerInput('match-cumulative', [fullMatch], fullMatch, 52 * 60)).toBeNull()
    expect(videoTimeToPlayerInput('match-cumulative', [fullMatch], fullMatch, 73 * 60)).toBe(60 * 60)
  })

  it('resolves an exact shared boundary to the beginning of the next video', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1,
      kickoffVideoSeconds: 4 * 60 + 14, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 2,
      kickoffVideoSeconds: 3 * 60 + 20, matchDurationSeconds: 45 * 60
    }

    expect(resolvePlayerJumpTarget('match-cumulative', [firstHalf, secondHalf], firstHalf, 45 * 60)).toEqual({
      video: secondHalf,
      videoSeconds: 3 * 60 + 20
    })
    expect(resolvePlayerJumpTarget('match-cumulative', [firstHalf, secondHalf], secondHalf, 90 * 60)).toEqual({
      video: secondHalf,
      videoSeconds: 48 * 60 + 20
    })
  })

  it('synchronizes continuous cameras before kickoff from their configured kickoff anchors', () => {
    const leftCamera: VideoFileDescriptor = {
      path: '/left', fileName: 'left.mp4', fileUrl: 'file:///left.mp4', playbackMode: 'direct',
      durationSeconds: 110 * 60, matchGroupId: 'Spiel 1',
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 30 * 60, videoEndSeconds: 75 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const rightCamera: VideoFileDescriptor = {
      path: '/right', fileName: 'right.mp4', fileUrl: 'file:///right.mp4', playbackMode: 'direct',
      durationSeconds: 110 * 60, matchGroupId: 'Spiel 1',
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 29 * 60, videoEndSeconds: 74 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }

    expect(findSynchronizedPerspectiveTime([leftCamera, rightCamera], leftCamera, rightCamera, 5 * 60)).toBe(4 * 60)
  })

  it('shows both early cameras while a later camcorder is already recording before kickoff', () => {
    const camcorder: VideoFileDescriptor = {
      path: '/camcorder', fileName: 'camcorder.mp4', fileUrl: 'file:///camcorder.mp4', playbackMode: 'direct',
      durationSeconds: 50 * 60, matchGroupId: 'Spiel 1',
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 3 * 60, videoEndSeconds: 48 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const leftCamera: VideoFileDescriptor = {
      path: '/left', fileName: 'left.mp4', fileUrl: 'file:///left.mp4', playbackMode: 'direct',
      durationSeconds: 110 * 60, matchGroupId: 'Spiel 1',
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 30 * 60, videoEndSeconds: 75 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }
    const rightCamera: VideoFileDescriptor = {
      ...leftCamera, path: '/right', fileName: 'right.mp4', fileUrl: 'file:///right.mp4',
      matchTimeRanges: [{ id: 'first', videoStartSeconds: 31 * 60, videoEndSeconds: 76 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }]
    }

    expect(findSynchronizedPerspectiveTime([camcorder, leftCamera, rightCamera], camcorder, leftCamera, 2 * 60)).toBe(29 * 60)
    expect(findSynchronizedPerspectiveTime([camcorder, leftCamera, rightCamera], camcorder, rightCamera, 2 * 60)).toBe(30 * 60)
    expect(findSynchronizedPerspectiveTime([camcorder, leftCamera], leftCamera, camcorder, 5 * 60)).toBeNull()
  })

  it('synchronizes an unmapped halftime break without showing mapped play from the target', () => {
    const source: VideoFileDescriptor = {
      path: '/source', fileName: 'source.mp4', fileUrl: 'file:///source.mp4', playbackMode: 'direct',
      durationSeconds: 105 * 60, matchGroupId: 'Spiel 1',
      matchTimeRanges: [
        { id: 'first', videoStartSeconds: 0, videoEndSeconds: 45 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 },
        { id: 'second', videoStartSeconds: 60 * 60, videoEndSeconds: 105 * 60, matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 }
      ]
    }
    const target: VideoFileDescriptor = {
      ...source, path: '/target', fileName: 'target.mp4', fileUrl: 'file:///target.mp4',
      matchTimeRanges: [
        { id: 'first', videoStartSeconds: 2 * 60, videoEndSeconds: 47 * 60, matchStartSeconds: 0, matchEndSeconds: 45 * 60 },
        { id: 'second', videoStartSeconds: 62 * 60, videoEndSeconds: 107 * 60, matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 }
      ],
      durationSeconds: 107 * 60
    }

    expect(findSynchronizedPerspectiveTime([source, target], source, target, 50 * 60)).toBe(52 * 60)
  })

  it('resolves a short spectator clip only inside its explicitly mapped scene', () => {
    const clip: VideoFileDescriptor = {
      path: '/phone', fileName: 'phone.mp4', fileUrl: 'file:///phone.mp4', playbackMode: 'direct',
      durationSeconds: 180, matchGroupId: 'Spiel 1',
      matchTimeRanges: [{
        id: 'scene', videoStartSeconds: 12, videoEndSeconds: 162,
        matchStartSeconds: 63 * 60 + 40, matchEndSeconds: 66 * 60 + 10
      }]
    }

    expect(findVideoTimeForMatchTime([clip], clip, 64 * 60)).toBe(32)
    expect(findVideoTimeForMatchTime([clip], clip, 63 * 60)).toBeNull()
    expect(findVideoTimeForMatchTime([clip], clip, 67 * 60)).toBeNull()
  })

  it('rejects a segment that crosses an unmapped recording gap', () => {
    const recording: VideoFileDescriptor = {
      path: '/recording', fileName: 'recording.mp4', fileUrl: 'file:///recording.mp4', playbackMode: 'direct',
      durationSeconds: 1000, matchGroupId: 'Spiel 1',
      matchTimeRanges: [
        { id: 'before', videoStartSeconds: 0, videoEndSeconds: 300, matchStartSeconds: 0, matchEndSeconds: 300 },
        { id: 'after', videoStartSeconds: 360, videoEndSeconds: 660, matchStartSeconds: 300, matchEndSeconds: 600 }
      ]
    }
    const crossingSegment: Segment = {
      id: 'crossing', sourceVideoName: recording.fileName, sourceVideoPath: recording.path,
      startSeconds: 290, endSeconds: 310, lengthSeconds: 20, title: '', subTitle: '', audioTrack: '1'
    }

    expect(resolveSegmentForPlayback(crossingSegment, 'match-cumulative', [recording], recording)).toBeNull()
  })

  it('prefers the current video when several clips cover the requested match time', () => {
    const makeClip = (path: string, matchStart: number, videoStart: number): VideoFileDescriptor => ({
      path, fileName: `${path}.mp4`, fileUrl: `file://${path}.mp4`, playbackMode: 'direct',
      durationSeconds: 10 * 60, matchGroupId: 'Spiel 1',
      matchTimeStartSeconds: matchStart, matchTimeEndSeconds: matchStart + 10 * 60,
      videoTimeStartSeconds: videoStart
    })
    const firstClip = makeClip('/camera-a', 60 * 60, 0)
    const currentClip = makeClip('/camera-b', 62 * 60, 30)

    expect(resolvePlayerJumpTarget('match-cumulative', [firstClip, currentClip], currentClip, 64 * 60)).toEqual({
      video: currentClip,
      videoSeconds: 2 * 60 + 30
    })
  })

  it('interprets normalized 45:60 according to each configured jump mode', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }
    const videos = [firstHalf, secondHalf]
    const normalizedInput = 46 * 60

    expect(resolvePlayerJumpTarget('video-per-file', videos, firstHalf, normalizedInput)).toEqual({
      video: firstHalf,
      videoSeconds: 46 * 60
    })
    expect(resolvePlayerJumpTarget('video-cumulative', videos, firstHalf, normalizedInput)).toEqual({
      video: firstHalf,
      videoSeconds: 46 * 60
    })
    expect(resolvePlayerJumpTarget('match-per-part', videos, firstHalf, normalizedInput)).toBeNull()
    expect(resolvePlayerJumpTarget('match-cumulative', videos, firstHalf, normalizedInput)).toEqual({
      video: secondHalf,
      videoSeconds: 4 * 60
    })
  })

  it('enforces the configured part boundary only for match-based modes', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }
    const videos = [firstHalf, secondHalf]

    expect(resolvePlayerJumpTarget('match-per-part', videos, firstHalf, 45 * 60)).toEqual({
      video: firstHalf,
      videoSeconds: 47 * 60
    })
    expect(resolvePlayerJumpTarget('match-per-part', videos, firstHalf, 45 * 60 + 1)).toBeNull()
    expect(resolvePlayerJumpTarget('video-per-file', videos, firstHalf, 47 * 60)).toEqual({
      video: firstHalf,
      videoSeconds: 47 * 60
    })
  })

  it('enforces the end of cumulative video and match timelines', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 45 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 0, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 48 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }
    const videos = [firstHalf, secondHalf]

    expect(resolvePlayerJumpTarget('video-cumulative', videos, firstHalf, 47 * 60)).toEqual({
      video: secondHalf,
      videoSeconds: 2 * 60
    })
    expect(resolvePlayerJumpTarget('video-cumulative', videos, firstHalf, 93 * 60 + 1)).toBeNull()
    expect(resolvePlayerJumpTarget('match-cumulative', videos, firstHalf, 90 * 60)).toEqual({
      video: secondHalf,
      videoSeconds: 48 * 60
    })
    expect(resolvePlayerJumpTarget('match-cumulative', videos, firstHalf, 90 * 60 + 1)).toBeNull()
  })

  it('does not cross to a missing connected video in cumulative modes', () => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 45 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 0, matchDurationSeconds: 45 * 60
    }

    expect(resolvePlayerJumpTarget('video-cumulative', [firstHalf], firstHalf, 47 * 60)).toBeNull()
    expect(resolvePlayerJumpTarget('match-cumulative', [firstHalf], firstHalf, 47 * 60)).toBeNull()
  })

  it('rejects a cumulative time that belongs to another video for a fixed segment row', () => {
    const first = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct' as const,
      durationSeconds: 55 * 60
    }
    const second = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct' as const,
      durationSeconds: 50 * 60
    }

    expect(playerInputToVideoTime('video-cumulative', [first, second], second, 20 * 60)).toBeNull()
  })

  it.each([
    ['video-per-file', 20 * 60, 20 * 60],
    ['video-cumulative', 75 * 60, 20 * 60],
    ['match-per-part', 17 * 60, 20 * 60],
    ['match-cumulative', 62 * 60, 20 * 60]
  ] as const)('interprets fixed segment times only for %s playback', (mode, storedStart, expectedVideoStart) => {
    const firstHalf: VideoFileDescriptor = {
      path: '/first', fileName: 'first.mp4', fileUrl: 'file:///first.mp4', playbackMode: 'direct',
      durationSeconds: 55 * 60, matchGroupId: 'Spiel 1', matchHalf: 1, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
    }
    const secondHalf: VideoFileDescriptor = {
      path: '/second', fileName: 'second.mp4', fileUrl: 'file:///second.mp4', playbackMode: 'direct',
      durationSeconds: 50 * 60, matchGroupId: 'Spiel 1', matchHalf: 2, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
    }
    const segment: Segment = {
      id: 'fixed', sourceVideoName: secondHalf.fileName, sourceVideoPath: secondHalf.path,
      startSeconds: storedStart, endSeconds: storedStart + 60, lengthSeconds: 60,
      title: '', subTitle: '', audioTrack: '1'
    }

    expect(resolveSegmentForPlayback(segment, mode, [firstHalf, secondHalf], secondHalf)).toEqual({
      ...segment,
      startSeconds: expectedVideoStart,
      endSeconds: expectedVideoStart + 60,
      lengthSeconds: 60
    })
    expect(segment.startSeconds).toBe(storedStart)
  })
})

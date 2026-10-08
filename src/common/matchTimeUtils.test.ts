import { describe, expect, it } from 'vitest'
import type { VideoFileDescriptor } from './types'
import { findMatchVideoSeekTarget, matchTimeToVideoTime, playerInputToVideoTime, resolvePlayerJumpTarget, resolveSegmentForPlayback, videoTimeToMatchTime, videoTimeToPlayerInput } from './matchTimeUtils'
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

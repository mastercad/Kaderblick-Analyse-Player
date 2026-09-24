import { describe, expect, it } from 'vitest'
import type { VideoFileDescriptor } from './types'
import { findMatchVideoSeekTarget, matchTimeToVideoTime, resolvePlayerJumpTarget, videoTimeToMatchTime } from './matchTimeUtils'

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
})

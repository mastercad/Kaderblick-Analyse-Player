import { describe, expect, it } from 'vitest'
import { matchTimeToVideoTime, videoTimeToMatchTime } from './matchTimeUtils'

describe('match time conversion', () => {
  it('uses the kickoff position for the first half', () => {
    expect(matchTimeToVideoTime(9 * 60, 4 * 60, 1)).toBe(13 * 60)
    expect(videoTimeToMatchTime(13 * 60, 4 * 60, 1)).toBe(9 * 60)
  })

  it('subtracts the 45-minute baseline for the second half', () => {
    expect(matchTimeToVideoTime(45 * 60 + 12, 2 * 60 + 41, 2)).toBe(2 * 60 + 53)
    expect(matchTimeToVideoTime(85 * 60, 2 * 60 + 41, 2)).toBe(42 * 60 + 41)
  })
})

import { describe, expect, it } from 'vitest'
import { formatSegmentTime } from './timeUtils'

describe('formatSegmentTime', () => {
  it('keeps absolute segment times in total minutes beyond one hour', () => {
    expect(formatSegmentTime(63 * 60 + 30)).toBe('63:30')
    expect(formatSegmentTime(83 * 60 + 30)).toBe('83:30')
  })
})

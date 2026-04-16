import { findNextKeyframeTime, findPreviousKeyframeTime } from './keyframeUtils'

const times = [0, 2, 4, 6, 10, 20, 30, 60]

describe('findNextKeyframeTime', () => {
  it('finds the first keyframe after currentTime', () => {
    expect(findNextKeyframeTime(times, 0)).toBe(2)
    expect(findNextKeyframeTime(times, 5)).toBe(6)
    expect(findNextKeyframeTime(times, 20)).toBe(30)
  })

  it('skips the keyframe the video is currently on (tolerance avoids float sticking)', () => {
    // Standing exactly on keyframe at t=10
    expect(findNextKeyframeTime(times, 10)).toBe(20)
    // Standing slightly after due to float drift
    expect(findNextKeyframeTime(times, 10.05)).toBe(20)
  })

  it('returns undefined when already past the last keyframe', () => {
    expect(findNextKeyframeTime(times, 60)).toBeUndefined()
    expect(findNextKeyframeTime(times, 100)).toBeUndefined()
  })

  it('returns the first keyframe when currentTime is before all keyframes', () => {
    expect(findNextKeyframeTime(times, -5)).toBe(0)
  })

  it('returns undefined for an empty keyframe list', () => {
    expect(findNextKeyframeTime([], 10)).toBeUndefined()
  })

  it('respects a custom tolerance', () => {
    // With tolerance=0, even a tiny step forward finds the immediate next keyframe
    expect(findNextKeyframeTime(times, 9.99, 0)).toBe(10)
    // With large tolerance=5, skips two keyframes at once
    expect(findNextKeyframeTime(times, 4, 5)).toBe(10)
  })
})

describe('findPreviousKeyframeTime', () => {
  it('finds the last keyframe before currentTime', () => {
    expect(findPreviousKeyframeTime(times, 5)).toBe(4)
    expect(findPreviousKeyframeTime(times, 25)).toBe(20)
    expect(findPreviousKeyframeTime(times, 60)).toBe(30)
  })

  it('skips the keyframe the video is currently on', () => {
    // Standing exactly on keyframe at t=10
    expect(findPreviousKeyframeTime(times, 10)).toBe(6)
    // Standing slightly before due to float drift
    expect(findPreviousKeyframeTime(times, 10.05)).toBe(6)
  })

  it('returns undefined when already before the first keyframe', () => {
    expect(findPreviousKeyframeTime(times, 0)).toBeUndefined()
    expect(findPreviousKeyframeTime(times, -5)).toBeUndefined()
  })

  it('returns undefined for an empty keyframe list', () => {
    expect(findPreviousKeyframeTime([], 10)).toBeUndefined()
  })

  it('respects a custom tolerance', () => {
    expect(findPreviousKeyframeTime(times, 10.05, 0)).toBe(10)
    expect(findPreviousKeyframeTime(times, 10, 0.001)).toBe(6)
  })

  it('returns the correct value for closely-spaced keyframes', () => {
    const dense = [1.0, 1.5, 2.0, 2.5, 3.0]
    expect(findPreviousKeyframeTime(dense, 2.0)).toBe(1.5)
    expect(findNextKeyframeTime(dense, 2.0)).toBe(2.5)
  })
})

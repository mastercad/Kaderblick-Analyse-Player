/**
 * Finds the first keyframe time strictly after `currentTime`.
 * `tolerance` avoids floating-point edge cases when the video is already
 * sitting exactly on a keyframe boundary.
 */
export const findNextKeyframeTime = (
  times: number[],
  currentTime: number,
  tolerance = 0.1
): number | undefined => {
  return times.find((t) => t > currentTime + tolerance)
}

/**
 * Finds the last keyframe time strictly before `currentTime`.
 */
export const findPreviousKeyframeTime = (
  times: number[],
  currentTime: number,
  tolerance = 0.1
): number | undefined => {
  let result: number | undefined
  for (const t of times) {
    if (t < currentTime - tolerance) {
      result = t
    } else {
      break
    }
  }
  return result
}

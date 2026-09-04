export const getHalfStartSeconds = (half: 1 | 2): number => half === 2 ? 45 * 60 : 0

export const videoTimeToMatchTime = (
  videoSeconds: number,
  kickoffVideoSeconds: number,
  half: 1 | 2
): number => getHalfStartSeconds(half) + videoSeconds - kickoffVideoSeconds

export const matchTimeToVideoTime = (
  matchSeconds: number,
  kickoffVideoSeconds: number,
  half: 1 | 2
): number => kickoffVideoSeconds + matchSeconds - getHalfStartSeconds(half)

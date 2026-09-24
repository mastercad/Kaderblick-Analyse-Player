import type { PlayerJumpTimeMode, VideoFileDescriptor } from './types'

export const DEFAULT_HALF_DURATION_SECONDS = 45 * 60

export const getHalfStartSeconds = (
  half: 1 | 2,
  halfDurationSeconds = DEFAULT_HALF_DURATION_SECONDS
): number => half === 2 ? halfDurationSeconds : 0

export const videoTimeToMatchTime = (
  videoSeconds: number,
  kickoffVideoSeconds: number,
  half: 1 | 2,
  halfDurationSeconds = DEFAULT_HALF_DURATION_SECONDS
): number => getHalfStartSeconds(half, halfDurationSeconds) + videoSeconds - kickoffVideoSeconds

export const matchTimeToVideoTime = (
  matchSeconds: number,
  kickoffVideoSeconds: number,
  half: 1 | 2,
  halfDurationSeconds = DEFAULT_HALF_DURATION_SECONDS
): number => kickoffVideoSeconds + matchSeconds - getHalfStartSeconds(half, halfDurationSeconds)

export interface MatchVideoSeekTarget {
  video: VideoFileDescriptor
  videoSeconds: number
}

export const findMatchVideoSeekTarget = (
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor,
  matchSeconds: number
): MatchVideoSeekTarget | null => {
  const matchGroupId = currentVideo.matchGroupId?.trim()
  if (!matchGroupId) return null

  const normalizedGroupId = matchGroupId.toLocaleLowerCase()
  const halfDurationSeconds = currentVideo.matchDurationSeconds ?? DEFAULT_HALF_DURATION_SECONDS
  const targetHalf: 1 | 2 = matchSeconds < halfDurationSeconds ? 1 : 2
  const candidate = videos.find((video) =>
    video.matchGroupId?.trim().toLocaleLowerCase() === normalizedGroupId &&
    video.matchHalf === targetHalf &&
    video.kickoffVideoSeconds !== undefined
  )
  if (!candidate) return null

  const videoSeconds = matchTimeToVideoTime(
    matchSeconds,
    candidate.kickoffVideoSeconds!,
    candidate.matchHalf!,
    candidate.matchDurationSeconds ?? halfDurationSeconds
  )
  if (videoSeconds < 0 || ((candidate.durationSeconds ?? 0) > 0 && videoSeconds > candidate.durationSeconds!)) {
    return null
  }
  return { video: candidate, videoSeconds }
}

const getVideosInMatch = (
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor
): VideoFileDescriptor[] => {
  const groupId = currentVideo.matchGroupId?.trim().toLocaleLowerCase()
  if (!groupId) return [currentVideo]
  return videos.filter((video) => video.matchGroupId?.trim().toLocaleLowerCase() === groupId)
}

export const resolvePlayerJumpTarget = (
  mode: PlayerJumpTimeMode,
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor,
  inputSeconds: number
): MatchVideoSeekTarget | null => {
  if (mode === 'video-per-file') {
    return { video: currentVideo, videoSeconds: inputSeconds }
  }

  if (mode === 'match-per-part') {
    if (currentVideo.kickoffVideoSeconds === undefined) return null
    return { video: currentVideo, videoSeconds: currentVideo.kickoffVideoSeconds + inputSeconds }
  }

  if (mode === 'match-cumulative') {
    const groupedTarget = findMatchVideoSeekTarget(videos, currentVideo, inputSeconds)
    if (groupedTarget) return groupedTarget
    if (currentVideo.kickoffVideoSeconds === undefined || currentVideo.matchHalf === undefined) return null
    const videoSeconds = matchTimeToVideoTime(
      inputSeconds,
      currentVideo.kickoffVideoSeconds,
      currentVideo.matchHalf,
      currentVideo.matchDurationSeconds
    )
    if (videoSeconds < 0 || ((currentVideo.durationSeconds ?? 0) > 0 && videoSeconds > currentVideo.durationSeconds!)) {
      return null
    }
    return { video: currentVideo, videoSeconds }
  }

  let remainingSeconds = inputSeconds
  const matchVideos = getVideosInMatch(videos, currentVideo)
  for (const [index, video] of matchVideos.entries()) {
    const duration = video.durationSeconds ?? 0
    if (duration <= 0) return null
    if (remainingSeconds < duration || (remainingSeconds === duration && index === matchVideos.length - 1)) {
      return { video, videoSeconds: remainingSeconds }
    }
    remainingSeconds -= duration
  }
  return null
}

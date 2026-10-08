import type { PlayerJumpTimeMode, Segment, VideoFileDescriptor } from './types'

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

const getVideosInMatch = (
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor
): VideoFileDescriptor[] => {
  const availableVideos = videos.some((video) => video.path === currentVideo.path)
    ? videos
    : [...videos, currentVideo]
  const groupId = currentVideo.matchGroupId?.trim().toLocaleLowerCase()
  return availableVideos.filter((video) => {
    const candidateGroupId = video.matchGroupId?.trim().toLocaleLowerCase()
    return groupId ? candidateGroupId === groupId : !candidateGroupId
  })
}

export const findMatchVideoSeekTarget = (
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor,
  matchSeconds: number
): MatchVideoSeekTarget | null => {
  const halfDurationSeconds = currentVideo.matchDurationSeconds ?? DEFAULT_HALF_DURATION_SECONDS
  const targetHalf: 1 | 2 = matchSeconds < halfDurationSeconds ? 1 : 2
  const candidates = getVideosInMatch(videos, currentVideo).filter((video) =>
    video.matchHalf === targetHalf && video.kickoffVideoSeconds !== undefined
  )

  // An empty game id deliberately groups all other ungrouped videos into the
  // same game. Every candidate goes through the same central conversion used
  // by segment editing and exporting.
  for (const candidate of candidates) {
    const videoSeconds = playerInputToVideoTime('match-cumulative', videos, candidate, matchSeconds)
    if (videoSeconds !== null) {
      return { video: candidate, videoSeconds }
    }
  }
  return null
}

export const videoTimeToPlayerInput = (
  mode: PlayerJumpTimeMode,
  videos: VideoFileDescriptor[],
  video: VideoFileDescriptor,
  videoSeconds: number
): number | null => {
  if (mode === 'video-per-file') return videoSeconds

  if (mode === 'match-per-part') {
    if (video.kickoffVideoSeconds === undefined) return null
    return videoSeconds - video.kickoffVideoSeconds
  }

  if (mode === 'match-cumulative') {
    if (video.kickoffVideoSeconds === undefined || video.matchHalf === undefined) return null
    return videoTimeToMatchTime(
      videoSeconds,
      video.kickoffVideoSeconds,
      video.matchHalf,
      video.matchDurationSeconds
    )
  }

  let elapsedSeconds = 0
  for (const matchVideo of getVideosInMatch(videos, video)) {
    if (matchVideo.path === video.path) return elapsedSeconds + videoSeconds
    const duration = matchVideo.durationSeconds ?? 0
    if (duration <= 0) return null
    elapsedSeconds += duration
  }
  return null
}

/**
 * Resolves an input time against one explicitly selected video.
 *
 * Unlike resolvePlayerJumpTarget this function never changes the video. That
 * distinction is important for segment rows: a row assigned to video B must
 * not silently become a segment of video A just because its time is expressed
 * on a cumulative axis.
 */
export const playerInputToVideoTime = (
  mode: PlayerJumpTimeMode,
  videos: VideoFileDescriptor[],
  video: VideoFileDescriptor,
  inputSeconds: number
): number | null => {
  let videoSeconds: number

  if (mode === 'video-per-file') {
    videoSeconds = inputSeconds
  } else if (mode === 'match-per-part') {
    if (video.kickoffVideoSeconds === undefined) return null
    videoSeconds = video.kickoffVideoSeconds + inputSeconds
  } else if (mode === 'match-cumulative') {
    if (video.kickoffVideoSeconds === undefined || video.matchHalf === undefined) return null
    videoSeconds = matchTimeToVideoTime(
      inputSeconds,
      video.kickoffVideoSeconds,
      video.matchHalf,
      video.matchDurationSeconds
    )
  } else {
    let elapsedSeconds = 0
    let foundVideo = false
    for (const matchVideo of getVideosInMatch(videos, video)) {
      if (matchVideo.path === video.path) {
        foundVideo = true
        break
      }
      const duration = matchVideo.durationSeconds ?? 0
      if (duration <= 0) return null
      elapsedSeconds += duration
    }
    if (!foundVideo) return null
    videoSeconds = inputSeconds - elapsedSeconds
  }

  if (videoSeconds < 0) return null
  const duration = video.durationSeconds ?? 0
  if (duration > 0 && videoSeconds > duration) return null
  return videoSeconds
}

export const resolvePlayerJumpTarget = (
  mode: PlayerJumpTimeMode,
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor,
  inputSeconds: number
): MatchVideoSeekTarget | null => {
  if (mode === 'video-per-file' || mode === 'match-per-part') {
    const videoSeconds = playerInputToVideoTime(mode, videos, currentVideo, inputSeconds)
    return videoSeconds === null ? null : { video: currentVideo, videoSeconds }
  }

  if (mode === 'match-cumulative') {
    const groupedTarget = findMatchVideoSeekTarget(videos, currentVideo, inputSeconds)
    if (groupedTarget) return groupedTarget
    return null
  }

  const matchVideos = getVideosInMatch(videos, currentVideo)
  for (const [index, video] of matchVideos.entries()) {
    const videoSeconds = playerInputToVideoTime('video-cumulative', videos, video, inputSeconds)
    if (videoSeconds === null) continue
    const duration = video.durationSeconds ?? 0
    if (videoSeconds === duration && index < matchVideos.length - 1) continue
    return { video, videoSeconds }
  }
  return null
}

/** Converts fixed segment input times to physical positions for playback only. */
export const resolveSegmentForPlayback = (
  segment: Segment,
  mode: PlayerJumpTimeMode,
  videos: VideoFileDescriptor[],
  video: VideoFileDescriptor
): Segment | null => {
  const startSeconds = playerInputToVideoTime(mode, videos, video, segment.startSeconds)
  const endSeconds = playerInputToVideoTime(mode, videos, video, segment.endSeconds)
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) return null
  return {
    ...segment,
    startSeconds,
    endSeconds,
    lengthSeconds: endSeconds - startSeconds
  }
}

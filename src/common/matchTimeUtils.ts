import type { PlayerJumpTimeMode, Segment, VideoFileDescriptor, VideoMatchTimeRange } from './types'

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

const getVideosInMatchTimeline = (
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor
): VideoFileDescriptor[] => {
  const groupedVideos = getVideosInMatch(videos, currentVideo)
  const firstHalves = groupedVideos.filter((video) => video.matchHalf === 1)
  const secondHalves = groupedVideos.filter((video) => video.matchHalf === 2)

  // A single explicit first/second pair has an unambiguous chronological
  // order even if the library itself was loaded in reverse order. Duplicate
  // half assignments can be intentional, so their library order is retained.
  if (groupedVideos.length === 2 && firstHalves.length === 1 && secondHalves.length === 1) {
    return [firstHalves[0], secondHalves[0]]
  }
  return groupedVideos
}

const getInitialMatchTimelineSeconds = (videos: VideoFileDescriptor[]): number => {
  if (videos.length !== 1 || videos[0].matchHalf !== 2) return 0
  return videos[0].matchDurationSeconds ?? DEFAULT_HALF_DURATION_SECONDS
}

export interface MatchVideoTimeRange {
  id?: string
  matchStartSeconds: number
  matchEndSeconds: number
  videoStartSeconds: number
  videoEndSeconds: number
}

const isValidMatchTimeRange = (range: VideoMatchTimeRange): boolean => (
  Number.isFinite(range.matchStartSeconds) && Number.isFinite(range.matchEndSeconds) &&
  Number.isFinite(range.videoStartSeconds) && Number.isFinite(range.videoEndSeconds) &&
  range.matchStartSeconds >= 0 && range.matchEndSeconds > range.matchStartSeconds &&
  range.videoStartSeconds >= 0 && range.videoEndSeconds > range.videoStartSeconds
)

export const getMatchVideoTimeRanges = (
  videos: VideoFileDescriptor[],
  video: VideoFileDescriptor
): MatchVideoTimeRange[] => {
  const explicitRanges = video.matchTimeRanges?.filter(isValidMatchTimeRange).map((range) => ({ ...range }))
  if (explicitRanges && explicitRanges.length > 0) return explicitRanges

  const explicitStart = video.matchTimeStartSeconds
  const explicitEnd = video.matchTimeEndSeconds
  const explicitVideoStart = video.videoTimeStartSeconds
  if (
    explicitStart !== undefined && explicitEnd !== undefined && explicitVideoStart !== undefined &&
    Number.isFinite(explicitStart) && Number.isFinite(explicitEnd) && Number.isFinite(explicitVideoStart) &&
    explicitStart >= 0 && explicitEnd > explicitStart && explicitVideoStart >= 0
  ) {
    return [{
      matchStartSeconds: explicitStart,
      matchEndSeconds: explicitEnd,
      videoStartSeconds: explicitVideoStart,
      videoEndSeconds: explicitVideoStart + explicitEnd - explicitStart
    }]
  }

  if (video.kickoffVideoSeconds === undefined) return []
  const matchVideos = getVideosInMatchTimeline(videos, video)
  let matchStartSeconds = getInitialMatchTimelineSeconds(matchVideos)
  for (const matchVideo of matchVideos) {
    if (matchVideo.path === video.path) {
      const duration = video.matchDurationSeconds ?? DEFAULT_HALF_DURATION_SECONDS
      return [{
        matchStartSeconds,
        matchEndSeconds: matchStartSeconds + duration,
        videoStartSeconds: video.kickoffVideoSeconds,
        videoEndSeconds: video.kickoffVideoSeconds + duration
      }]
    }
    matchStartSeconds += matchVideo.matchDurationSeconds ?? DEFAULT_HALF_DURATION_SECONDS
  }
  return []
}

export const getMatchVideoTimeRange = (
  videos: VideoFileDescriptor[],
  video: VideoFileDescriptor
): MatchVideoTimeRange | null => getMatchVideoTimeRanges(videos, video)[0] ?? null

const mapMatchTimeToVideoTime = (range: MatchVideoTimeRange, matchSeconds: number): number => {
  const matchDuration = range.matchEndSeconds - range.matchStartSeconds
  const videoDuration = range.videoEndSeconds - range.videoStartSeconds
  return range.videoStartSeconds + (matchSeconds - range.matchStartSeconds) * videoDuration / matchDuration
}

const mapVideoTimeToMatchTime = (range: MatchVideoTimeRange, videoSeconds: number): number => {
  const matchDuration = range.matchEndSeconds - range.matchStartSeconds
  const videoDuration = range.videoEndSeconds - range.videoStartSeconds
  return range.matchStartSeconds + (videoSeconds - range.videoStartSeconds) * matchDuration / videoDuration
}

const MATCH_TIME_EPSILON_SECONDS = 0.001

const isSameMatchTime = (first: number, second: number): boolean => (
  Math.abs(first - second) < MATCH_TIME_EPSILON_SECONDS
)

export const findVideoTimeForMatchTime = (
  videos: VideoFileDescriptor[],
  video: VideoFileDescriptor,
  matchSeconds: number
): number | null => {
  const ranges = getMatchVideoTimeRanges(videos, video)
  const rangeStartingHere = ranges.find((candidate) => isSameMatchTime(matchSeconds, candidate.matchStartSeconds))
  const rangeContainingTime = ranges.find((candidate) => (
    matchSeconds > candidate.matchStartSeconds && matchSeconds < candidate.matchEndSeconds
  ))
  const anotherRangeStartsHere = getVideosInMatch(videos, video).some((matchVideo) => (
    getMatchVideoTimeRanges(videos, matchVideo).some((candidate) => (
      isSameMatchTime(matchSeconds, candidate.matchStartSeconds)
    ))
  ))
  const rangeEndingHere = anotherRangeStartsHere
    ? undefined
    : ranges.find((candidate) => isSameMatchTime(matchSeconds, candidate.matchEndSeconds))
  const range = rangeStartingHere ?? rangeContainingTime ?? rangeEndingHere
  if (!range) return null
  const videoSeconds = mapMatchTimeToVideoTime(range, matchSeconds)
  const videoDurationSeconds = video.durationSeconds ?? 0
  return videoSeconds >= 0 && (videoDurationSeconds <= 0 || videoSeconds <= videoDurationSeconds)
    ? videoSeconds
    : null
}

interface MatchRangeBoundary {
  kind: 'start' | 'end'
  matchSeconds: number
  videoSeconds: number
}

const getMatchRangeBoundaries = (ranges: MatchVideoTimeRange[]): MatchRangeBoundary[] => ranges.flatMap((range) => [
  { kind: 'start', matchSeconds: range.matchStartSeconds, videoSeconds: range.videoStartSeconds },
  { kind: 'end', matchSeconds: range.matchEndSeconds, videoSeconds: range.videoEndSeconds }
])

/**
 * Synchronizes two recordings of the same match, including footage before the
 * kickoff, between mapped parts, and after the match. Inside a mapped part the
 * match clock is authoritative. Outside it, the nearest configured boundary
 * acts as a shared real-time anchor (for example "60 seconds before kickoff").
 */
export const findSynchronizedPerspectiveTime = (
  videos: VideoFileDescriptor[],
  sourceVideo: VideoFileDescriptor,
  targetVideo: VideoFileDescriptor,
  sourceVideoSeconds: number
): number | null => {
  const sourceRanges = getMatchVideoTimeRanges(videos, sourceVideo)
  const targetRanges = getMatchVideoTimeRanges(videos, targetVideo)
  if (sourceRanges.length === 0 || targetRanges.length === 0) return null

  const activeSourceRange = sourceRanges.find((range) => (
    sourceVideoSeconds >= range.videoStartSeconds && sourceVideoSeconds <= range.videoEndSeconds
  ))
  if (activeSourceRange) {
    return findVideoTimeForMatchTime(
      videos,
      targetVideo,
      mapVideoTimeToMatchTime(activeSourceRange, sourceVideoSeconds)
    )
  }

  const sourceBoundary = getMatchRangeBoundaries(sourceRanges).reduce<MatchRangeBoundary | null>((nearest, boundary) => {
    if (!nearest) return boundary
    return Math.abs(sourceVideoSeconds - boundary.videoSeconds) < Math.abs(sourceVideoSeconds - nearest.videoSeconds)
      ? boundary
      : nearest
  }, null)
  if (!sourceBoundary) return null

  const targetBoundaries = getMatchRangeBoundaries(targetRanges)
  const targetBoundary = targetBoundaries.find((boundary) => (
    boundary.kind === sourceBoundary.kind && Math.abs(boundary.matchSeconds - sourceBoundary.matchSeconds) < 0.001
  )) ?? targetBoundaries.find((boundary) => (
    Math.abs(boundary.matchSeconds - sourceBoundary.matchSeconds) < 0.001
  ))
  if (!targetBoundary) return null

  const targetVideoSeconds = targetBoundary.videoSeconds + sourceVideoSeconds - sourceBoundary.videoSeconds
  const targetDurationSeconds = targetVideo.durationSeconds ?? 0
  if (targetVideoSeconds < 0 || (targetDurationSeconds > 0 && targetVideoSeconds > targetDurationSeconds)) return null

  const targetIsInsideMappedPlay = targetRanges.some((range) => (
    targetVideoSeconds >= range.videoStartSeconds && targetVideoSeconds <= range.videoEndSeconds
  ))
  return targetIsInsideMappedPlay ? null : targetVideoSeconds
}

export const findMatchVideoSeekTarget = (
  videos: VideoFileDescriptor[],
  currentVideo: VideoFileDescriptor,
  matchSeconds: number
): MatchVideoSeekTarget | null => {
  if (matchSeconds < 0) return null

  const matchVideos = getVideosInMatchTimeline(videos, currentVideo)
  const candidates = [currentVideo, ...matchVideos.filter((video) => video.path !== currentVideo.path)]
  for (const video of candidates) {
    const videoSeconds = findVideoTimeForMatchTime(videos, video, matchSeconds)
    if (videoSeconds === null) continue
    return { video, videoSeconds }
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
    const range = getMatchVideoTimeRange(videos, video)
    if (!range) return null
    const partSeconds = videoSeconds - range.videoStartSeconds
    return partSeconds >= 0 && partSeconds <= range.matchEndSeconds - range.matchStartSeconds
      ? partSeconds
      : null
  }

  if (mode === 'match-cumulative') {
    const range = getMatchVideoTimeRanges(videos, video).find((candidate) => (
      videoSeconds >= candidate.videoStartSeconds && videoSeconds <= candidate.videoEndSeconds
    ))
    if (!range) return null
    return mapVideoTimeToMatchTime(range, videoSeconds)
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
    const range = getMatchVideoTimeRange(videos, video)
    if (!range || inputSeconds > range.matchEndSeconds - range.matchStartSeconds) return null
    videoSeconds = range.videoStartSeconds + inputSeconds
  } else if (mode === 'match-cumulative') {
    const mappedVideoSeconds = findVideoTimeForMatchTime(videos, video, inputSeconds)
    if (mappedVideoSeconds === null) return null
    videoSeconds = mappedVideoSeconds
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
  if (mode === 'match-cumulative') {
    const range = getMatchVideoTimeRanges(videos, video).find((candidate) => (
      segment.startSeconds >= candidate.matchStartSeconds && segment.endSeconds <= candidate.matchEndSeconds
    ))
    if (!range) return null
  }
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

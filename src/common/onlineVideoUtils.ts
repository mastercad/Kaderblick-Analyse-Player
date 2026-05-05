import type { VideoFileDescriptor } from './types'

export type OnlinePlatform = 'youtube' | 'vimeo'

export interface OnlineVideoInfo {
  platform: OnlinePlatform
  videoId: string
}

/**
 * Extract platform and video ID from a YouTube or Vimeo URL.
 * Returns null for URLs that cannot be recognized.
 */
export function parseOnlineVideoUrl(url: string): OnlineVideoInfo | null {
  const trimmed = url.trim()

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube-nocookie.com/embed/ID
  // The (?:[^#]*&)? handles v= both as the first param (?v=ID) and after others (?t=30&v=ID)
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed|v)\/)([a-zA-Z0-9_-]{11})/
  )
  if (ytMatch) {
    return { platform: 'youtube', videoId: ytMatch[1] }
  }

  // Vimeo: vimeo.com/ID, vimeo.com/video/ID, player.vimeo.com/video/ID, vimeo.com/channels/x/ID, vimeo.com/groups/x/videos/ID
  const vimeoMatch = trimmed.match(
    /(?:vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?|player\.vimeo\.com\/video\/)(\d+)/
  )
  if (vimeoMatch) {
    return { platform: 'vimeo', videoId: vimeoMatch[1] }
  }

  return null
}

/**
 * Build an embed URL for a given platform and video ID.
 * YouTube uses the privacy-enhanced nocookie domain.
 * For Vimeo, the player SDK is used, so this URL is used for the iframe src.
 */
export function buildEmbedUrl(platform: OnlinePlatform, videoId: string): string {
  if (platform === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&playsinline=1`
  }
  // Vimeo: api=1 enables the JS SDK postMessage bridge
  return `https://player.vimeo.com/video/${videoId}?api=1&background=0`
}

/**
 * Create a VideoFileDescriptor for an online video URL.
 * Returns null if the URL cannot be parsed.
 *
 * The path and fileName are set to "platform:videoId" (e.g. "youtube:dQw4w9WgXcQ").
 * This key is what users must put in the CSV videoname column to reference this video.
 */
export function createOnlineVideoDescriptor(url: string): VideoFileDescriptor | null {
  const info = parseOnlineVideoUrl(url)
  if (!info) return null

  const { platform, videoId } = info
  const key = `${platform}:${videoId}`
  const embedUrl = buildEmbedUrl(platform, videoId)

  return {
    path: key,
    fileName: key,
    fileUrl: embedUrl,
    playbackMode: 'online',
    onlinePlatform: platform,
    onlineVideoId: videoId
  }
}

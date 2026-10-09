import type { VideoFileDescriptor } from './types'

export interface VideoLibraryRemovalResult {
  videos: VideoFileDescriptor[]
  activeVideoIndex: number
  removedVideo?: VideoFileDescriptor
}

export const removeVideoFromLibrary = (
  videos: VideoFileDescriptor[],
  activeVideoIndex: number,
  removeIndex: number
): VideoLibraryRemovalResult => {
  const removedVideo = videos[removeIndex]
  if (!removedVideo) return { videos, activeVideoIndex }

  const activeVideo = videos[activeVideoIndex]
  const remainingVideos = videos.filter((_, index) => index !== removeIndex)
  if (remainingVideos.length === 0) {
    return { videos: remainingVideos, activeVideoIndex: 0, removedVideo }
  }

  if (activeVideo?.path === removedVideo.path) {
    return {
      videos: remainingVideos,
      activeVideoIndex: Math.min(removeIndex, remainingVideos.length - 1),
      removedVideo
    }
  }

  const preservedActiveIndex = remainingVideos.findIndex((video) => video.path === activeVideo?.path)
  return {
    videos: remainingVideos,
    activeVideoIndex: preservedActiveIndex >= 0 ? preservedActiveIndex : 0,
    removedVideo
  }
}

import { describe, expect, it } from 'vitest'
import type { VideoFileDescriptor } from './types'
import { removeVideoFromLibrary } from './videoLibraryUtils'

const videos: VideoFileDescriptor[] = ['a', 'b', 'c'].map((name) => ({
  path: `/${name}.mp4`, fileName: `${name}.mp4`, fileUrl: `file:///${name}.mp4`, playbackMode: 'direct'
}))

describe('removeVideoFromLibrary', () => {
  it('selects the following video when the active video is removed', () => {
    const result = removeVideoFromLibrary(videos, 1, 1)
    expect(result.videos.map((video) => video.fileName)).toEqual(['a.mp4', 'c.mp4'])
    expect(result.videos[result.activeVideoIndex].fileName).toBe('c.mp4')
  })

  it('selects the preceding video when the last active video is removed', () => {
    const result = removeVideoFromLibrary(videos, 2, 2)
    expect(result.videos[result.activeVideoIndex].fileName).toBe('b.mp4')
  })

  it('keeps the same active video when another video is removed', () => {
    const result = removeVideoFromLibrary(videos, 2, 0)
    expect(result.videos[result.activeVideoIndex].fileName).toBe('c.mp4')
  })

  it('returns an empty library with a safe index after removing the only video', () => {
    const result = removeVideoFromLibrary([videos[0]], 0, 0)
    expect(result.videos).toEqual([])
    expect(result.activeVideoIndex).toBe(0)
  })
})

import { buildEmbedUrl, createOnlineVideoDescriptor, parseOnlineVideoUrl } from './onlineVideoUtils'

// ---------------------------------------------------------------------------
// parseOnlineVideoUrl
// ---------------------------------------------------------------------------

describe('parseOnlineVideoUrl – YouTube', () => {
  it('parses youtube.com/watch?v=', () => {
    const result = parseOnlineVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses youtube.com/watch?v= with extra query params', () => {
    const result = parseOnlineVideoUrl('https://www.youtube.com/watch?t=30&v=dQw4w9WgXcQ&list=PL123')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses youtu.be short link', () => {
    const result = parseOnlineVideoUrl('https://youtu.be/dQw4w9WgXcQ')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses youtu.be short link with timestamp', () => {
    const result = parseOnlineVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=42')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses youtube.com/embed/', () => {
    const result = parseOnlineVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses youtube-nocookie.com/embed/', () => {
    const result = parseOnlineVideoUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('trims whitespace before parsing', () => {
    const result = parseOnlineVideoUrl('  https://youtu.be/dQw4w9WgXcQ  ')
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })

  it('handles video IDs with underscores and hyphens', () => {
    const result = parseOnlineVideoUrl('https://www.youtube.com/watch?v=ABC-xyz_123')
    expect(result).toEqual({ platform: 'youtube', videoId: 'ABC-xyz_123' })
  })
})

describe('parseOnlineVideoUrl – Vimeo', () => {
  it('parses vimeo.com/ID', () => {
    const result = parseOnlineVideoUrl('https://vimeo.com/123456789')
    expect(result).toEqual({ platform: 'vimeo', videoId: '123456789' })
  })

  it('parses vimeo.com/video/ID', () => {
    const result = parseOnlineVideoUrl('https://vimeo.com/video/123456789')
    expect(result).toEqual({ platform: 'vimeo', videoId: '123456789' })
  })

  it('parses player.vimeo.com/video/ID', () => {
    const result = parseOnlineVideoUrl('https://player.vimeo.com/video/123456789')
    expect(result).toEqual({ platform: 'vimeo', videoId: '123456789' })
  })

  it('parses vimeo.com/channels/CHANNEL/ID', () => {
    const result = parseOnlineVideoUrl('https://vimeo.com/channels/staffpicks/123456789')
    expect(result).toEqual({ platform: 'vimeo', videoId: '123456789' })
  })

  it('parses vimeo.com/groups/GROUP/videos/ID', () => {
    const result = parseOnlineVideoUrl('https://vimeo.com/groups/animation/videos/123456789')
    expect(result).toEqual({ platform: 'vimeo', videoId: '123456789' })
  })
})

describe('parseOnlineVideoUrl – invalid URLs', () => {
  it('returns null for an arbitrary URL', () => {
    expect(parseOnlineVideoUrl('https://example.com/video')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseOnlineVideoUrl('')).toBeNull()
  })

  it('returns null for a local file path', () => {
    expect(parseOnlineVideoUrl('/tmp/videos/spiel.mp4')).toBeNull()
  })

  it('returns null for a plain text string', () => {
    expect(parseOnlineVideoUrl('not a url at all')).toBeNull()
  })

  it('returns null for a vimeo URL without a numeric ID', () => {
    // vimeo.com/events/xyz is not a video page
    expect(parseOnlineVideoUrl('https://vimeo.com/events/xyz')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildEmbedUrl
// ---------------------------------------------------------------------------

describe('buildEmbedUrl', () => {
  it('builds a YouTube nocookie embed URL with required params', () => {
    const url = buildEmbedUrl('youtube', 'dQw4w9WgXcQ')
    expect(url).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(url).toContain('enablejsapi=1')
  })

  it('builds a Vimeo player URL with api=1', () => {
    const url = buildEmbedUrl('vimeo', '123456789')
    expect(url).toContain('player.vimeo.com/video/123456789')
    expect(url).toContain('api=1')
  })
})

// ---------------------------------------------------------------------------
// createOnlineVideoDescriptor
// ---------------------------------------------------------------------------

describe('createOnlineVideoDescriptor', () => {
  it('creates a YouTube descriptor from a valid URL', () => {
    const descriptor = createOnlineVideoDescriptor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(descriptor).not.toBeNull()
    expect(descriptor!.path).toBe('youtube:dQw4w9WgXcQ')
    expect(descriptor!.fileName).toBe('youtube:dQw4w9WgXcQ')
    expect(descriptor!.playbackMode).toBe('online')
    expect(descriptor!.onlinePlatform).toBe('youtube')
    expect(descriptor!.onlineVideoId).toBe('dQw4w9WgXcQ')
    expect(descriptor!.fileUrl).toContain('dQw4w9WgXcQ')
  })

  it('creates a Vimeo descriptor from a valid URL', () => {
    const descriptor = createOnlineVideoDescriptor('https://vimeo.com/123456789')
    expect(descriptor).not.toBeNull()
    expect(descriptor!.path).toBe('vimeo:123456789')
    expect(descriptor!.fileName).toBe('vimeo:123456789')
    expect(descriptor!.playbackMode).toBe('online')
    expect(descriptor!.onlinePlatform).toBe('vimeo')
    expect(descriptor!.onlineVideoId).toBe('123456789')
    expect(descriptor!.fileUrl).toContain('123456789')
  })

  it('returns null for an unrecognized URL', () => {
    expect(createOnlineVideoDescriptor('https://example.com')).toBeNull()
  })

  it('path and fileName are identical (used as CSV key)', () => {
    const descriptor = createOnlineVideoDescriptor('https://youtu.be/dQw4w9WgXcQ')!
    expect(descriptor.path).toBe(descriptor.fileName)
  })
})

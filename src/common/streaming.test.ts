import { buildStreamUrl, KVIDEO_SCHEME } from './streaming'

describe('buildStreamUrl', () => {
  it('builds a URL with the kvideo scheme', () => {
    const url = buildStreamUrl('/tmp/video.mp4')
    expect(url).toMatch(new RegExp(`^${KVIDEO_SCHEME}://`))
  })

  it('encodes the file path as a query parameter', () => {
    const url = new URL(buildStreamUrl('/tmp/my video.mp4'))
    expect(url.searchParams.get('p')).toBe('/tmp/my video.mp4')
  })

  it('omits the t parameter when startSeconds is 0', () => {
    const url = new URL(buildStreamUrl('/tmp/video.mp4', 0))
    expect(url.searchParams.has('t')).toBe(false)
  })

  it('omits the t parameter when startSeconds is not provided', () => {
    const url = new URL(buildStreamUrl('/tmp/video.mp4'))
    expect(url.searchParams.has('t')).toBe(false)
  })

  it('includes the t parameter when startSeconds is greater than 0', () => {
    const url = new URL(buildStreamUrl('/tmp/video.mp4', 90))
    expect(url.searchParams.get('t')).toBe('90')
  })

  it('encodes fractional seconds correctly', () => {
    const url = new URL(buildStreamUrl('/tmp/video.mp4', 12.5))
    expect(url.searchParams.get('t')).toBe('12.5')
  })

  it('produces distinct URLs for different seek positions', () => {
    const url1 = buildStreamUrl('/tmp/video.mp4', 0)
    const url2 = buildStreamUrl('/tmp/video.mp4', 60)
    expect(url1).not.toBe(url2)
  })

  it('produces distinct URLs for different file paths', () => {
    const url1 = buildStreamUrl('/tmp/a.mp4', 30)
    const url2 = buildStreamUrl('/tmp/b.mp4', 30)
    expect(url1).not.toBe(url2)
  })

  it('handles Windows-style paths', () => {
    const url = new URL(buildStreamUrl('C:\\Videos\\clip.mp4', 10))
    expect(url.searchParams.get('p')).toBe('C:\\Videos\\clip.mp4')
    expect(url.searchParams.get('t')).toBe('10')
  })
})

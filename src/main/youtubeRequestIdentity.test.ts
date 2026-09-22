import {
  addYouTubeClientReferer,
  YOUTUBE_CLIENT_REFERER,
  YOUTUBE_EMBED_URLS
} from './youtubeRequestIdentity'

describe('YouTube request identity', () => {
  it('uses filters for both supported YouTube embed hosts', () => {
    expect(YOUTUBE_EMBED_URLS).toEqual([
      'https://www.youtube.com/embed/*',
      'https://www.youtube-nocookie.com/embed/*'
    ])
  })

  it('adds the Kaderblick client identity without changing other headers', () => {
    expect(addYouTubeClientReferer({ Accept: 'text/html' })).toEqual({
      Accept: 'text/html',
      Referer: YOUTUBE_CLIENT_REFERER
    })
  })

  it('replaces an existing Referer regardless of its casing', () => {
    expect(addYouTubeClientReferer({ referer: 'file:///app/index.html' })).toEqual({
      Referer: YOUTUBE_CLIENT_REFERER
    })
  })
})

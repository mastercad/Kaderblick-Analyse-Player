export const YOUTUBE_CLIENT_REFERER = 'https://kaderblick.de/'

export const YOUTUBE_EMBED_URLS = [
  'https://www.youtube.com/embed/*',
  'https://www.youtube-nocookie.com/embed/*'
]

/**
 * YouTube requires embedded players in desktop apps to identify the API client
 * through the HTTP Referer header. Packaged Electron renderers run from a local
 * file and therefore do not provide a usable HTTP Referer on their own.
 */
export function addYouTubeClientReferer(
  requestHeaders: Record<string, string>
): Record<string, string> {
  const headers = Object.fromEntries(
    Object.entries(requestHeaders).filter(([name]) => name.toLowerCase() !== 'referer')
  )

  return {
    ...headers,
    Referer: YOUTUBE_CLIENT_REFERER
  }
}

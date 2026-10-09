export const KVIDEO_SCHEME = 'kvideo'

export const buildStreamUrl = (filePath: string, startSeconds = 0): string => {
  const url = new URL(`${KVIDEO_SCHEME}://stream/`)
  url.searchParams.set('p', filePath)
  if (startSeconds > 0) {
    url.searchParams.set('t', String(startSeconds))
  }
  return url.toString()
}

export const buildPreviewStreamUrl = (filePath: string, startSeconds = 0): string => {
  const url = new URL(buildStreamUrl(filePath, startSeconds))
  url.searchParams.set('preview', '1')
  return url.toString()
}

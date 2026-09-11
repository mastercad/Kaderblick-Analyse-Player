import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { VideoFileDescriptor } from '../../../../common/types'
import { VideoWorkspace } from './VideoWorkspace'

// happy-dom does not define MediaError — use the W3C numeric codes directly
const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

const defaultFilter = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0
}

const directVideo: VideoFileDescriptor = {
  path: '/tmp/test.mp4',
  fileName: 'test.mp4',
  fileUrl: 'file:///tmp/test.mp4',
  playbackMode: 'direct'
}

const baseProps = {
  segments: [],
  filterSettings: defaultFilter,
  filterOverlayVisible: false,
  repeatSingleSegment: false,
  onRepeatSingleSegmentChange: () => {},
  onToggleFilterOverlay: () => {}
}

/** Fires a video error event with the given MediaError code. */
const fireVideoError = (videoEl: HTMLVideoElement, code: number): void => {
  const mediaError = { code } as MediaError
  Object.defineProperty(videoEl, 'error', { value: mediaError, configurable: true })
  act(() => { fireEvent(videoEl, new Event('error')) })
}

/** Fires loadedmetadata with videoWidth/videoHeight = 0 to simulate a missing video track. */
const fireMetadataWithNoVideoTrack = (videoEl: HTMLVideoElement): void => {
  Object.defineProperty(videoEl, 'duration', { value: 60, configurable: true })
  Object.defineProperty(videoEl, 'videoWidth', { value: 0, configurable: true })
  Object.defineProperty(videoEl, 'videoHeight', { value: 0, configurable: true })
  act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
}

describe('VideoWorkspace – video error handling', () => {
  it('shows genuine playback errors over the video instead of inside the filter tools', () => {
    render(
      <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
        <div>Filterinhalt</div>
      </VideoWorkspace>
    )

    const playerPanel = screen.getByTestId('video-zoom-viewport').closest('section') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerPanel })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })

    fireVideoError(document.querySelector('video')!, MEDIA_ERR_DECODE)

    expect(screen.getByTestId('fullscreen-playback-banner')).toHaveTextContent(/konnte nicht decodiert/)
    expect(within(screen.getByTestId('fullscreen-flyout-right-panel')).queryByText(/konnte nicht decodiert/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Werkzeuge einblenden' })).toHaveAttribute('aria-pressed', 'false')
  })

  describe('MEDIA_ERR_SRC_NOT_SUPPORTED (codec not supported)', () => {
    it('calls onVideoError with recoverable=true', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_SRC_NOT_SUPPORTED)

      expect(onVideoError).toHaveBeenCalledOnce()
      expect(onVideoError).toHaveBeenCalledWith(expect.any(String), true)
    })

    it('shows an error message', () => {
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_SRC_NOT_SUPPORTED)

      expect(screen.getAllByText(/test\.mp4/).length).toBeGreaterThan(0)
    })
  })

  describe('MEDIA_ERR_DECODE (decode error)', () => {
    it('calls onVideoError with recoverable=true', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_DECODE)

      expect(onVideoError).toHaveBeenCalledOnce()
      expect(onVideoError).toHaveBeenCalledWith(expect.any(String), true)
    })
  })

  describe('MEDIA_ERR_NETWORK (network/file read error)', () => {
    it('calls onVideoError with recoverable=false', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_NETWORK)

      expect(onVideoError).toHaveBeenCalledOnce()
      expect(onVideoError).toHaveBeenCalledWith(expect.any(String), false)
    })
  })

  describe('MEDIA_ERR_ABORTED', () => {
    it('calls onVideoError with recoverable=false', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_ABORTED)

      expect(onVideoError).toHaveBeenCalledOnce()
      expect(onVideoError).toHaveBeenCalledWith(expect.any(String), false)
    })
  })

  describe('error in proxy/stream mode', () => {
    it('does not re-escalate when already in stream mode', () => {
      const onVideoError = vi.fn()
      const streamVideo: VideoFileDescriptor = {
        ...directVideo,
        fileUrl: 'kvideo://stream/?p=%2Ftmp%2Ftest.mp4',
        playbackMode: 'stream',
        durationSeconds: 3600
      }

      render(
        <VideoWorkspace {...baseProps} selectedVideo={streamVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_SRC_NOT_SUPPORTED)

      // onVideoError fires from VideoWorkspace, but App.tsx would not escalate further —
      // this test only checks that VideoWorkspace still calls the handler (not silenced):
      expect(onVideoError).toHaveBeenCalledOnce()
    })
  })

  describe('missing video track (videoWidth=0 after loadedmetadata)', () => {
    it('calls onVideoError with recoverable=true so the streaming dialog can appear', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireMetadataWithNoVideoTrack(videoEl)

      expect(onVideoError).toHaveBeenCalledOnce()
      // recoverable=true so App.tsx shows the CodecStreamingDialog instead of just a status message
      expect(onVideoError).toHaveBeenCalledWith(expect.any(String), true)
    })

    it('shows an error message mentioning the filename', () => {
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireMetadataWithNoVideoTrack(videoEl)

      expect(screen.getAllByText(/test\.mp4/).length).toBeGreaterThan(0)
    })
  })

  describe('error message content does not contain internal tech terms', () => {
    it('MEDIA_ERR_DECODE message does not mention "Electron"', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_DECODE)

      const [message] = onVideoError.mock.calls[0]
      expect(message).not.toMatch(/electron/i)
    })

    it('MEDIA_ERR_SRC_NOT_SUPPORTED message does not mention "Electron"', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireVideoError(videoEl, MEDIA_ERR_SRC_NOT_SUPPORTED)

      const [message] = onVideoError.mock.calls[0]
      expect(message).not.toMatch(/electron/i)
    })

    it('missing video track message does not mention "Electron"', () => {
      const onVideoError = vi.fn()
      render(
        <VideoWorkspace {...baseProps} selectedVideo={directVideo} onVideoError={onVideoError}>
          <div />
        </VideoWorkspace>
      )

      const videoEl = document.querySelector('video')!
      fireMetadataWithNoVideoTrack(videoEl)

      const [message] = onVideoError.mock.calls[0]
      expect(message).not.toMatch(/electron/i)
    })
  })
})

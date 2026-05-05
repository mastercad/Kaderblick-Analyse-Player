import type { RefObject } from 'react'
import type { VideoFileDescriptor } from '../../../../common/types'

interface OnlineVideoPlayerProps {
  containerRef: RefObject<HTMLDivElement | null>
  selectedVideo: VideoFileDescriptor
}

/**
 * Renders a container div that the YouTube IFrame Player API (or Vimeo SDK)
 * will replace with an iframe. The hook useOnlineVideoPlayback attaches the
 * player to containerRef.current.
 */
export function OnlineVideoPlayer({ containerRef, selectedVideo }: OnlineVideoPlayerProps) {
  const platformLabel = selectedVideo.onlinePlatform === 'youtube' ? 'YouTube'
    : selectedVideo.onlinePlatform === 'vimeo' ? 'Vimeo'
    : 'Online'

  return (
    <div className="online-video-player">
      {/* The SDK will inject the iframe into this div */}
      <div
        ref={containerRef}
        className="online-video-player__container"
        aria-label={`${platformLabel}-Player`}
      />
      {/*
       * Transparent overlay above the iframe. The iframe is a separate browsing
       * context and swallows all pointer/wheel events — they never bubble to the
       * parent. This overlay sits on top of the iframe (z-index: 1) so that wheel
       * events reach the video-stage__viewport native listener (zoom), and click
       * events no longer reach the iframe (fine: controls are driven via the YT/Vimeo
       * API, not user clicks on the iframe).
       */}
      <div className="online-video-player__event-capture" aria-hidden="true" />
    </div>
  )
}

import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import type { VideoFileDescriptor } from '../../../../common/types'
import { OnlineVideoPlayer } from './OnlineVideoPlayer'

const makeVideo = (platform: 'youtube' | 'vimeo' | undefined = 'youtube'): VideoFileDescriptor => ({
  path: '',
  fileName: 'test',
  fileUrl: '',
  playbackMode: 'online',
  onlinePlatform: platform,
  onlineVideoId: 'abc123'
})

// ---------------------------------------------------------------------------
// Container ref
// ---------------------------------------------------------------------------

describe('OnlineVideoPlayer – containerRef', () => {
  it('attaches the ref to the inner container div', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('youtube')} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current).toHaveClass('online-video-player__container')
  })
})

// ---------------------------------------------------------------------------
// aria-label (platform label)
// ---------------------------------------------------------------------------

describe('OnlineVideoPlayer – platform aria-label', () => {
  it('labels the container "YouTube-Player" for youtube videos', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('youtube')} />)
    expect(screen.getByLabelText('YouTube-Player')).toBeInTheDocument()
  })

  it('labels the container "Vimeo-Player" for vimeo videos', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('vimeo')} />)
    expect(screen.getByLabelText('Vimeo-Player')).toBeInTheDocument()
  })

  it('labels the container "Online-Player" when no platform is set', () => {
    const ref = createRef<HTMLDivElement>()
    const video: VideoFileDescriptor = {
      path: '',
      fileName: 'test',
      fileUrl: '',
      playbackMode: 'online'
    }
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={video} />)
    expect(screen.getByLabelText('Online-Player')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Event-capture overlay
// ---------------------------------------------------------------------------

describe('OnlineVideoPlayer – event-capture overlay', () => {
  it('renders the event-capture overlay div', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('youtube')} />)
    // The overlay is aria-hidden and has the dedicated class
    const overlay = document.querySelector('.online-video-player__event-capture')
    expect(overlay).toBeInTheDocument()
  })

  it('marks the event-capture overlay as aria-hidden', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('youtube')} />)
    const overlay = document.querySelector('.online-video-player__event-capture')
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders overlay as a sibling of the container div, not a child', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('youtube')} />)
    const wrapper = document.querySelector('.online-video-player')!
    const children = Array.from(wrapper.children)
    const containerIndex = children.findIndex(el => el.classList.contains('online-video-player__container'))
    const captureIndex = children.findIndex(el => el.classList.contains('online-video-player__event-capture'))
    expect(containerIndex).toBeGreaterThanOrEqual(0)
    expect(captureIndex).toBeGreaterThanOrEqual(0)
    // Both must be direct children of the wrapper
    expect(children[containerIndex].parentElement).toBe(wrapper)
    expect(children[captureIndex].parentElement).toBe(wrapper)
  })
})

// ---------------------------------------------------------------------------
// Outer wrapper
// ---------------------------------------------------------------------------

describe('OnlineVideoPlayer – outer wrapper', () => {
  it('wraps everything in a div with class online-video-player', () => {
    const ref = createRef<HTMLDivElement>()
    render(<OnlineVideoPlayer containerRef={ref} selectedVideo={makeVideo('youtube')} />)
    expect(document.querySelector('.online-video-player')).toBeInTheDocument()
  })
})

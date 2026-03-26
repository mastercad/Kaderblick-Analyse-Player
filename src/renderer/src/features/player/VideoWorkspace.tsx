import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { buildCssFilter } from '../../../../common/filterUtils'
import { getSegmentPlaybackTransition } from '../../../../common/segmentPlayback'
import {
  findActiveSegmentIndex,
  getNextSegmentIndex,
  getPreviousSegmentIndex,
  resolveSegmentSequenceStartIndex
} from '../../../../common/segmentUtils'
import { formatClockTime } from '../../../../common/timeUtils'
import type { FilterSettings, Segment, VideoFileDescriptor } from '../../../../common/types'
import { SegmentList } from './SegmentList'
import { SegmentTimeline } from './SegmentTimeline'

interface VideoWorkspaceProps {
  selectedVideo?: VideoFileDescriptor
  segments: Segment[]
  filterSettings: FilterSettings
  filterOverlayVisible: boolean
  repeatSingleSegment: boolean
  onRepeatSingleSegmentChange: (value: boolean) => void
  onToggleFilterOverlay: () => void
  children: React.ReactNode
  overlayDialogs?: React.ReactNode
}

export function VideoWorkspace({
  selectedVideo,
  segments,
  filterSettings,
  filterOverlayVisible,
  repeatSingleSegment,
  onRepeatSingleSegmentChange,
  onToggleFilterOverlay,
  children,
  overlayDialogs
}: VideoWorkspaceProps) {
  const playerPanelRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSegmentMode, setIsSegmentMode] = useState(false)
  const [sequenceIndex, setSequenceIndex] = useState(-1)
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setIsSegmentMode(false)
    setSequenceIndex(-1)
    setActiveSegmentIndex(-1)
  }, [selectedVideo?.path])

  useEffect(() => {
    if (segments.length === 0) {
      setIsSegmentMode(false)
      setSequenceIndex(-1)
      setActiveSegmentIndex(-1)
      return
    }

    setActiveSegmentIndex(findActiveSegmentIndex(segments, currentTime))
  }, [segments, currentTime])

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement === playerPanelRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const onKeyboardShortcut = useEffectEvent((event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement

    if (isTyping) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      void togglePlayPause()
    }

    if (event.code === 'ArrowLeft') {
      event.preventDefault()
      jumpToPreviousSegment()
    }

    if (event.code === 'ArrowRight') {
      event.preventDefault()
      jumpToNextSegment()
    }

    if (event.code === 'KeyN') {
      event.preventDefault()
      void startSegmentPlayback()
    }

    if (event.code === 'KeyF') {
      event.preventDefault()
      onToggleFilterOverlay()
    }

    if (event.code === 'KeyR') {
      event.preventDefault()
      onRepeatSingleSegmentChange(!repeatSingleSegment)
    }

    if (event.code === 'F11') {
      event.preventDefault()
      void toggleFullscreen()
    }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => onKeyboardShortcut(event)

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const seekTo = (nextTimeSeconds: number): void => {
    if (!videoRef.current) {
      return
    }

    videoRef.current.currentTime = nextTimeSeconds
    setCurrentTime(nextTimeSeconds)
    setActiveSegmentIndex(findActiveSegmentIndex(segments, nextTimeSeconds))
  }

  const pausePlayback = (): void => {
    videoRef.current?.pause()
    setIsPlaying(false)
  }

  const playPlayback = async (): Promise<void> => {
    if (!videoRef.current) {
      return
    }

    try {
      await videoRef.current.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
    }
  }

  const jumpToSegment = (segmentIndex: number, continuePlaying = false): void => {
    const segment = segments[segmentIndex]
    if (!segment) {
      return
    }

    seekTo(segment.startSeconds)
    setActiveSegmentIndex(segmentIndex)

    setSequenceIndex(segmentIndex)

    if (continuePlaying) {
      void playPlayback()
    }
  }

  const togglePlayPause = async (): Promise<void> => {
    if (!videoRef.current) {
      return
    }

    if (videoRef.current.paused) {
      await playPlayback()
    } else {
      pausePlayback()
    }
  }

  const jumpToNextSegment = (): void => {
    const nextIndex = getNextSegmentIndex(segments, currentTime)

    if (nextIndex >= 0) {
      jumpToSegment(nextIndex)
    }
  }

  const jumpToPreviousSegment = (): void => {
    const previousIndex = getPreviousSegmentIndex(segments, currentTime)

    if (previousIndex >= 0) {
      jumpToSegment(previousIndex)
    }
  }

  const startSegmentPlayback = async (): Promise<void> => {
    const startIndex = repeatSingleSegment && activeSegmentIndex >= 0
      ? activeSegmentIndex
      : resolveSegmentSequenceStartIndex(segments, currentTime)

    if (startIndex < 0) {
      return
    }

    setIsSegmentMode(true)
    setSequenceIndex(startIndex)
    jumpToSegment(startIndex)
    await playPlayback()
  }

  const toggleFullscreen = async (): Promise<void> => {
    if (!playerPanelRef.current) {
      return
    }

    if (document.fullscreenElement === playerPanelRef.current) {
      await document.exitFullscreen()
      return
    }

    await playerPanelRef.current.requestFullscreen()
  }

  const handleTimeUpdate = (): void => {
    if (!videoRef.current) {
      return
    }

    const nextCurrentTime = videoRef.current.currentTime
    setCurrentTime(nextCurrentTime)

    const detectedActiveIndex = findActiveSegmentIndex(segments, nextCurrentTime)
    setActiveSegmentIndex(detectedActiveIndex)

    if (!isSegmentMode || sequenceIndex < 0) {
      return
    }

    const currentSegment = segments[sequenceIndex]
    if (!currentSegment) {
      setIsSegmentMode(false)
      setSequenceIndex(-1)
      pausePlayback()
      return
    }

    if (nextCurrentTime < currentSegment.startSeconds - 0.15) {
      seekTo(currentSegment.startSeconds)
      return
    }

    if (nextCurrentTime >= currentSegment.endSeconds - 0.05) {
      const transition = getSegmentPlaybackTransition(segments, sequenceIndex, {
        repeatSingleSegment
      })

      if (transition.action === 'pause') {
        pausePlayback()
        setIsSegmentMode(false)
        setSequenceIndex(-1)
        seekTo(transition.nextTimeSeconds)
        return
      }

      setSequenceIndex(transition.nextIndex)
      seekTo(transition.nextTimeSeconds)
      void playPlayback()
    }
  }

  const handleMetadataLoaded = (): void => {
    if (!videoRef.current) {
      return
    }

    setDuration(videoRef.current.duration || 0)
  }

  return (
    <div className="workspace-stack">
      <section className="panel player-panel" ref={playerPanelRef}>
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Player</p>
            <h2>{selectedVideo?.fileName ?? 'Bitte zuerst ein Video laden'}</h2>
          </div>
          <div className="pill-row">
            <span className="pill">{isSegmentMode ? 'Segmentmodus aktiv' : 'Normale Wiedergabe'}</span>
            <span className="pill">Filter {filterOverlayVisible ? 'sichtbar' : 'versteckt'}</span>
            <span className="pill">{repeatSingleSegment ? 'Einzelsegment-Wiederholung aktiv' : 'Segmentkette aktiv'}</span>
          </div>
        </div>

        <div className="video-stage">
          {selectedVideo ? (
            <>
              <video
                className="video-stage__video"
                controls={false}
                ref={videoRef}
                src={selectedVideo.fileUrl}
                style={{ filter: buildCssFilter(filterSettings) }}
                onLoadedMetadata={handleMetadataLoaded}
                onTimeUpdate={handleTimeUpdate}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onEnded={() => {
                  setIsPlaying(false)
                  setIsSegmentMode(false)
                  setSequenceIndex(-1)
                }}
              />
              {children}
            </>
          ) : (
            <div className="video-stage__empty">
              <h3>Kein Video geladen</h3>
              <p>Nach dem Laden eines Videos erscheinen hier Wiedergabe, Filter-Overlay und Segmentnavigation.</p>
            </div>
          )}
        </div>

        <div className="player-controls">
          <div className="controls-row player-controls__transport">
            <button className="button button--primary" type="button" onClick={() => void togglePlayPause()} disabled={!selectedVideo}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button className="button" type="button" onClick={() => void startSegmentPlayback()} disabled={!selectedVideo || segments.length === 0}>
              Nur Segmente abspielen
            </button>
            <button className="button" type="button" onClick={jumpToPreviousSegment} disabled={segments.length === 0}>
              Voriges Segment
            </button>
            <button className="button" type="button" onClick={jumpToNextSegment} disabled={segments.length === 0}>
              Naechstes Segment
            </button>
          </div>

          <div className="controls-row player-controls__utility">
            <button className="button button--subtle" type="button" onClick={onToggleFilterOverlay} disabled={!selectedVideo}>
              Filter {filterOverlayVisible ? 'ausblenden' : 'einblenden'}
            </button>
            <button className="button button--subtle" type="button" onClick={() => void toggleFullscreen()} disabled={!selectedVideo}>
              {isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
            </button>
          </div>
        </div>

        <div className="player-assist-row">
          <span className="player-assist-pill">{segments.length} Segmente verfuegbar</span>
          <span className="player-assist-pill">Leertaste, Pfeile, N, R, F, F11</span>
        </div>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={repeatSingleSegment}
            onChange={(event) => onRepeatSingleSegmentChange(event.target.checked)}
            disabled={segments.length === 0}
          />
          <span>Aktives Segment endlos wiederholen statt automatisch zum naechsten Segment zu wechseln</span>
          <span className="toggle-row__hint">Kurzkuerzel: R und F11</span>
        </label>

        <div className="time-row">
          <span>{formatClockTime(currentTime)}</span>
          <span>{formatClockTime(duration)}</span>
        </div>

        {overlayDialogs}

        <SegmentTimeline
          duration={duration}
          currentTime={currentTime}
          activeSegmentIndex={activeSegmentIndex}
          segments={segments}
          onSeek={seekTo}
        />
      </section>

      <SegmentList segments={segments} activeSegmentIndex={activeSegmentIndex} onSelectSegment={jumpToSegment} />
    </div>
  )
}

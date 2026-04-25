import { cloneElement, isValidElement, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { buildCssFilter } from '../../../../common/filterUtils'
import { findActiveSegmentIndex } from '../../../../common/segmentUtils'
import { formatClockTime } from '../../../../common/timeUtils'
import type { FilterSettings, Segment, VideoFileDescriptor } from '../../../../common/types'
import appLogo from '../../../../../assets/icon.png'
import { SegmentList } from './SegmentList'
import { SegmentTimeline } from './SegmentTimeline'
import { useFullscreen } from './useFullscreen'
import { useVideoPlayback } from './useVideoPlayback'
import { useZoom } from './useZoom'
import { formatRate } from './playerUtils'
import { MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL, PLAYBACK_RATES, SEEK_STEP_SECONDS, ZOOM_STEP } from './playerTypes'

interface VideoWorkspaceProps {
  selectedVideo?: VideoFileDescriptor
  segments: Segment[]
  filterSettings: FilterSettings
  filterOverlayVisible: boolean
  repeatSingleSegment: boolean
  sessionTitle: string
  onSessionTitleChange: (title: string) => void
  interstitialDuration: number
  interstitialLogoDataUrl: string | null
  onRepeatSingleSegmentChange: (value: boolean) => void
  onToggleFilterOverlay: () => void
  playbackRecoveryInProgress?: boolean
  autoPlayOnLoad?: boolean
  autoStartSegmentsOnLoad?: boolean
  autoStartSegmentsFromEnd?: boolean
  onVideoLoaded?: (durationSeconds: number) => void
  onVideoError?: (message: string, recoverable: boolean) => void
  onAllSegmentsDone?: () => void
  onFirstSegmentReached?: () => void
  onVideoEnded?: () => void
  onSegmentModeChange?: (active: boolean) => void
  onPlayStateChange?: (isPlaying: boolean) => void
  onFirstPlay?: () => void
  hideSplash?: boolean
  onOpenSegmentEditor?: () => void
  isSegmentEditorOpen?: boolean
  onCurrentTimeChange?: (timeSeconds: number) => void
  children: React.ReactNode
  overlayDialogs?: React.ReactNode
}

export function VideoWorkspace({
  selectedVideo,
  segments,
  filterSettings,
  filterOverlayVisible,
  repeatSingleSegment,
  sessionTitle,
  onSessionTitleChange,
  interstitialDuration,
  interstitialLogoDataUrl,
  onRepeatSingleSegmentChange,
  onToggleFilterOverlay,
  playbackRecoveryInProgress = false,
  autoPlayOnLoad = false,
  autoStartSegmentsOnLoad = false,
  autoStartSegmentsFromEnd = false,
  onVideoLoaded,
  onVideoError,
  onAllSegmentsDone,
  onFirstSegmentReached,
  onVideoEnded,
  onSegmentModeChange,
  onPlayStateChange,
  onFirstPlay,
  hideSplash = false,
  onOpenSegmentEditor,
  isSegmentEditorOpen,
  onCurrentTimeChange,
  children,
  overlayDialogs
}: VideoWorkspaceProps) {
  const playerPanelRef = useRef<HTMLElement | null>(null)
  const videoStageViewportRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const isInterstitialActiveRef = useRef(false)

  const { isFullscreen, activeFullscreenFlyout, setPinnedFullscreenFlyout,
    toggleFullscreen, toggleFullscreenFlyout,
    handleFullscreenFlyoutMouseEnter, handleFullscreenFlyoutMouseLeave
  } = useFullscreen({ playerPanelRef })

  const zoom = useZoom({ videoStageViewportRef, videoRef, selectedVideo, isFullscreen, isInterstitialActiveRef })

  const playback = useVideoPlayback({
    videoRef,
    selectedVideo,
    segments,
    repeatSingleSegment,
    interstitialDuration,
    autoPlayOnLoad,
    autoStartSegmentsOnLoad,
    autoStartSegmentsFromEnd,
    playbackRecoveryInProgress,
    setVideoIntrinsicSize: zoom.setVideoIntrinsicSize,
    onCurrentTimeChange,
    onVideoLoaded,
    onVideoError,
    onAllSegmentsDone,
    onFirstSegmentReached,
    onVideoEnded,
    onSegmentModeChange
  })

  // useLayoutEffect: runs synchronously after every commit, before any browser events.
  // This guarantees isPlayingRef in App.tsx is always up-to-date before the next user interaction.
  useLayoutEffect(() => {
    onPlayStateChange?.(playback.isPlaying || playback.isInterstitialCounting)
  }, [onPlayStateChange, playback.isPlaying, playback.isInterstitialCounting])

  // Splash screen: show whenever fullscreen is entered; hide once playback/interstitial starts.
  const [fullscreenStarted, setFullscreenStarted] = useState(false)
  const prevIsFullscreenRef = useRef(false)
  useEffect(() => {
    const justEntered = isFullscreen && !prevIsFullscreenRef.current
    prevIsFullscreenRef.current = isFullscreen
    if (justEntered) setFullscreenStarted(false)
  }, [isFullscreen])
  useEffect(() => {
    if (isFullscreen && (playback.isPlaying || playback.isInterstitialCounting)) {
      setFullscreenStarted(true)
    }
  }, [isFullscreen, playback.isPlaying, playback.isInterstitialCounting])

  // Pin the right flyout when a video error or recovery occurs in fullscreen
  useEffect(() => {
    if (!isFullscreen || (!playback.videoError && !playbackRecoveryInProgress)) return
    setPinnedFullscreenFlyout('right')
  }, [isFullscreen, playbackRecoveryInProgress, playback.videoError])

  // Global keyboard shortcuts
  const onKeyboardShortcut = useEffectEvent((event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    const isRangeInput = target instanceof HTMLInputElement && target.type === 'range'
    const isTyping =
      !isRangeInput && (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    if (isTyping) return
    // Arrow keys on range inputs control the slider — don't intercept them
    if (isRangeInput && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) return

    if (event.code === 'Space') { event.preventDefault(); void playback.togglePlayPause() }
    if (event.code === 'ArrowLeft' && !event.shiftKey) { event.preventDefault(); playback.jumpToPreviousSegment() }
    if (event.code === 'ArrowRight' && !event.shiftKey) { event.preventDefault(); playback.jumpToNextSegment() }
    if (event.code === 'ArrowLeft' && event.shiftKey) { event.preventDefault(); playback.jumpBySeconds(-SEEK_STEP_SECONDS) }
    if (event.code === 'ArrowRight' && event.shiftKey) { event.preventDefault(); playback.jumpBySeconds(SEEK_STEP_SECONDS) }
    if (event.key === ',') { event.preventDefault(); playback.stepFrame('backward') }
    if (event.key === '.') { event.preventDefault(); playback.stepFrame('forward') }
    if (event.key === '[') { event.preventDefault(); playback.jumpToPreviousKeyframe() }
    if (event.key === ']') { event.preventDefault(); playback.jumpToNextKeyframe() }
    if (event.key === '<') { event.preventDefault(); playback.adjustPlaybackRate('slower') }
    if (event.key === '>') { event.preventDefault(); playback.adjustPlaybackRate('faster') }
    if (event.code === 'KeyN') {
      event.preventDefault()
      if (playback.isSegmentMode) playback.exitSegmentMode()
      else void playback.startSegmentPlayback()
    }
    if (event.code === 'KeyF') { event.preventDefault(); onToggleFilterOverlay() }
    if (event.code === 'KeyR') { event.preventDefault(); onRepeatSingleSegmentChange(!repeatSingleSegment) }
    if (event.code === 'F11') { event.preventDefault(); void toggleFullscreen() }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') { event.preventDefault(); if (!playback.interstitialSegment) zoom.zoomToViewportPoint(zoom.zoomLevel + ZOOM_STEP) }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') { event.preventDefault(); if (!playback.interstitialSegment) zoom.zoomToViewportPoint(zoom.zoomLevel - ZOOM_STEP) }
    if (event.code === 'Digit0' || event.code === 'Numpad0') { event.preventDefault(); if (!playback.interstitialSegment) zoom.resetZoom() }
    if (event.code === 'KeyZ') { event.preventDefault(); zoom.setShowZoomDock(prev => !prev) }
    if (event.code === 'KeyM') { event.preventDefault(); playback.setUserMuted(prev => !prev) }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => onKeyboardShortcut(event)
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleTimelineSeek = (nextTimeSeconds: number): void => {
    // For drag-scrubs: startScrub paused the video, so we need to know whether
    // to resume. For simple clicks: the video is still playing/paused as-is.
    const wasScrubbing = playback.isScrubActive()
    const continuePlaying = wasScrubbing
      ? playback.getWasPlayingBeforeScrub()
      : playback.isPlaying
    playback.endScrub()

    if (playback.isSegmentMode) {
      const activeIndex = findActiveSegmentIndex(segments, nextTimeSeconds)
      if (activeIndex >= 0) {
        playback.jumpToSegment(activeIndex, continuePlaying, true)
        return
      }
      const nextIndex = segments.findIndex((s) => s.startSeconds > nextTimeSeconds)
      if (nextIndex >= 0) playback.jumpToSegment(nextIndex, continuePlaying, true)
      return
    }
    playback.seekTo(nextTimeSeconds)
    // Only call togglePlayPause to resume after a drag-scrub paused the video.
    // For simple clicks the video is still playing — seekTo alone is sufficient.
    if (wasScrubbing && continuePlaying) void playback.togglePlayPause()
  }

  // ─── Derived UI fragments ────────────────────────────────────────────────────

  const errorBanner = playbackRecoveryInProgress
    ? <p className="player-info-banner">Video wird für die Wiedergabe umgewandelt… Bitte einen Moment warten.</p>
    : playback.videoError
      ? <p className="player-error-banner">{playback.videoError}</p>
      : null

  const playerHeader = (
    <div className="panel__header">
      <div>
        <p className="panel__eyebrow">Player</p>
        <h2>{selectedVideo?.fileName ?? 'Bitte zuerst ein Video laden'}</h2>
      </div>
      {(filterOverlayVisible || repeatSingleSegment) && (
        <div className="pill-row">
          {filterOverlayVisible && <span className="pill pill--accent">Filter aktiv</span>}
          {repeatSingleSegment && <span className="pill">Wiederholung</span>}
        </div>
      )}
    </div>
  )

  const transportControls = (
    <div className="controls-row player-controls__transport">
      <button className="button button--primary" type="button" onClick={() => void playback.togglePlayPause()} disabled={!selectedVideo}>
        {(playback.isPlaying || playback.isInterstitialCounting) ? 'Pause' : 'Play'}
      </button>
      <button
        className={`button${playback.isSegmentMode ? ' button--active' : ''}`}
        type="button"
        onClick={() => playback.isSegmentMode ? playback.exitSegmentMode() : void playback.startSegmentPlayback()}
        disabled={!selectedVideo || segments.length === 0}
        aria-pressed={playback.isSegmentMode}
        title={playback.isSegmentMode ? 'Segmentmodus beenden (N)' : 'Segmente der Reihe nach abspielen (N)'}
      >
        {playback.isSegmentMode ? 'Segmentmodus beenden' : 'Nur Segmente abspielen'}
      </button>
      <button className="button" type="button" onClick={playback.jumpToPreviousSegment} disabled={segments.length === 0}>
        Voriges Segment
      </button>
      <button className="button" type="button" onClick={playback.jumpToNextSegment} disabled={segments.length === 0}>
        Nächstes Segment
      </button>
      <button
        className={`button button--subtle${isSegmentEditorOpen ? ' button--active' : ''}`}
        type="button"
        disabled={!selectedVideo}
        onClick={() => onOpenSegmentEditor?.()}
        title="Segment-Editor öffnen"
      >
        Segment-Editor
      </button>
    </div>
  )

  const frameNavControls = (
    <div className="controls-row frame-nav-controls" role="group" aria-label="Bildnavigation">
      <span className="frame-nav-controls__label">Bildnavigation</span>
      <button className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.jumpBySeconds(-SEEK_STEP_SECONDS)} disabled={!selectedVideo} title={`${SEEK_STEP_SECONDS} Sekunden zurück (Shift+←)`}>&laquo;&thinsp;{SEEK_STEP_SECONDS}s</button>
      <button className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.stepFrame('backward')} disabled={!selectedVideo} title="Ein Bild zurück (,)">&#x23EE;</button>
      <button className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.stepFrame('forward')} disabled={!selectedVideo} title="Ein Bild vor (.)">&#x23ED;</button>
      <button className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.jumpBySeconds(SEEK_STEP_SECONDS)} disabled={!selectedVideo} title={`${SEEK_STEP_SECONDS} Sekunden vor (Shift+→)`}>{SEEK_STEP_SECONDS}s&thinsp;&raquo;</button>
      <button className="button button--subtle frame-nav-controls__btn" type="button" onClick={playback.jumpToPreviousKeyframe} disabled={!selectedVideo || playback.keyframeTimes.length === 0} title="Zum vorherigen Keyframe ([)">&#x23EE;&#x25CE;</button>
      <button className="button button--subtle frame-nav-controls__btn" type="button" onClick={playback.jumpToNextKeyframe} disabled={!selectedVideo || playback.keyframeTimes.length === 0} title="Zum nächsten Keyframe (])">&#x25CE;&#x23ED;</button>
    </div>
  )

  const speedControls = (
    <div className="controls-row speed-controls" role="group" aria-label="Wiedergabegeschwindigkeit">
      <span className="speed-controls__label">Geschwindigkeit</span>
      <button className="button button--subtle speed-controls__step" type="button" onClick={() => playback.adjustPlaybackRate('slower')} disabled={!selectedVideo || playback.playbackRate <= PLAYBACK_RATES[0]} title="Langsamer (<)" aria-label="Langsamer">◀</button>
      {PLAYBACK_RATES.map((rate) => (
        <button
          key={rate}
          className={`button speed-controls__rate${playback.playbackRate === rate ? ' button--primary speed-controls__rate--active' : ' button--subtle'}`}
          type="button"
          onClick={() => playback.changePlaybackRate(rate)}
          disabled={!selectedVideo}
          title={`Geschwindigkeit: ${formatRate(rate)}`}
          aria-pressed={playback.playbackRate === rate}
        >
          {formatRate(rate)}
        </button>
      ))}
      <button className="button button--subtle speed-controls__step" type="button" onClick={() => playback.adjustPlaybackRate('faster')} disabled={!selectedVideo || playback.playbackRate >= PLAYBACK_RATES[PLAYBACK_RATES.length - 1]} title="Schneller (>)" aria-label="Schneller">▶</button>
    </div>
  )

  const utilityControls = (
    <div className="controls-row player-controls__utility">
      <div className="volume-control" title={playback.segmentMuted ? 'Ton im CSV für dieses Segment deaktiviert' : undefined}>
        <button
          className={`button button--subtle volume-control__mute${playback.userMuted ? ' button--active' : ''}`}
          type="button"
          onClick={() => playback.setUserMuted(prev => !prev)}
          disabled={!selectedVideo || playback.segmentMuted}
          title={playback.userMuted ? 'Ton einschalten (M)' : 'Stummschalten (M)'}
          aria-pressed={playback.userMuted}
        >
          {playback.segmentMuted ? 'Stumm (CSV)' : playback.userMuted ? 'Stumm' : 'Ton'}
        </button>
        <input
          className="volume-control__slider"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={playback.userMuted || playback.segmentMuted ? 0 : playback.volume}
          disabled={!selectedVideo || playback.segmentMuted}
          aria-label="Lautstärke"
          onChange={(event) => {
            const next = Number(event.target.value)
            playback.setVolume(next)
            if (next > 0) playback.setUserMuted(false)
          }}
        />
      </div>
      <button
        className={`button button--subtle${filterOverlayVisible ? ' button--active' : ''}`}
        type="button"
        onClick={onToggleFilterOverlay}
        disabled={!selectedVideo}
        title={filterOverlayVisible ? 'Filter ausblenden (F)' : 'Filter einblenden (F)'}
      >
        Filter
      </button>
      <button
        className="button button--subtle"
        type="button"
        onClick={() => void toggleFullscreen()}
        disabled={!selectedVideo}
        title={isFullscreen ? 'Vollbild beenden (F11)' : 'Vollbild (F11)'}
      >
        {isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
      </button>
    </div>
  )

  const assistRow = (
    <div className="player-assist-row">
      <span className="player-assist-pill">{segments.length} Segment{segments.length !== 1 ? 'e' : ''} verfügbar</span>
      <details className="shortcut-list">
        <summary className="player-assist-pill shortcut-list__toggle">Tastenkürzel</summary>
        <div className="shortcut-list__grid">
          <kbd>Leertaste</kbd><span>Play / Pause</span>
          <kbd>← →</kbd><span>Voriges / Nächstes Segment</span>
          <kbd>Shift+← →</kbd><span>{SEEK_STEP_SECONDS} Sekunden zurück / vor</span>
          <kbd>, .</kbd><span>Ein Bild zurück / vor</span>
          <kbd>&lt; &gt;</kbd><span>Langsamer / Schneller</span>
          <kbd>N</kbd><span>Nur Segmente abspielen</span>
          <kbd>F</kbd><span>Filter ein-/ausblenden</span>
          <kbd>R</kbd><span>Einzelwiederholung umschalten</span>
          <kbd>Z</kbd><span>Zoom-Steuerung ein-/ausblenden</span>
          <kbd>F11</kbd><span>Vollbild</span>
          <kbd>M</kbd><span>Stummschalten ein-/ausschalten</span>
          <kbd>+ −</kbd><span>Zoom vergrößern / verkleinern</span>
          <kbd>0</kbd><span>Zoom zurücksetzen</span>
        </div>
      </details>
    </div>
  )

  const playbackHint = selectedVideo?.playbackHint ? (
    <div className="playback-note" role="note">
      <span className="playback-note__icon" aria-hidden="true">i</span>
      <span>{selectedVideo.playbackHint}</span>
    </div>
  ) : null

  const repeatToggle = (
    <label className="toggle-row" title="Aktives Segment endlos wiederholen, statt automatisch zur nächsten Szene zu wechseln">
      <input
        type="checkbox"
        checked={repeatSingleSegment}
        onChange={(event) => onRepeatSingleSegmentChange(event.target.checked)}
        disabled={segments.length === 0}
      />
      <span>Segment endlos wiederholen</span>
      <kbd className="toggle-row__hint">R</kbd>
    </label>
  )

  const timeRow = (
    <div className="time-row">
      <span className="time-row__current">{formatClockTime(playback.currentTime)}</span>
      {playback.duration > 0 ? (
        <span className="time-row__remaining" aria-label={`Verbleibend: ${formatClockTime(Math.max(0, playback.duration - playback.currentTime))}`}>
          −{formatClockTime(Math.max(0, playback.duration - playback.currentTime))}
        </span>
      ) : null}
      <span className="time-row__total">{formatClockTime(playback.duration)}</span>
    </div>
  )

  const timeline = (
    <SegmentTimeline
      duration={playback.duration}
      currentTime={playback.currentTime}
      activeSegmentIndex={playback.activeSegmentIndex}
      segments={segments}
      onSeek={handleTimelineSeek}
      onScrubStart={playback.startScrub}
      onScrub={playback.scrubTo}
    />
  )

  const segmentList = (
    <SegmentList
      segments={segments}
      activeSegmentIndex={playback.activeSegmentIndex}
      onSelectSegment={(index) => playback.jumpToSegment(index, false, true)}
    />
  )

  const zoomDockInner = selectedVideo ? (
    <>
      <div className="video-stage__zoom-actions">
        <button aria-label="Zoom verkleinern" className="icon-button video-stage__zoom-button" type="button" onClick={() => zoom.handleZoomStep('out')} disabled={zoom.zoomLevel <= MIN_ZOOM_LEVEL || !!playback.interstitialSegment}>-</button>
        <input
          aria-label="Zoomstufe"
          className="video-stage__zoom-slider"
          type="range"
          min={MIN_ZOOM_LEVEL}
          max={MAX_ZOOM_LEVEL}
          step={ZOOM_STEP}
          value={zoom.zoomLevel}
          disabled={!!playback.interstitialSegment}
          onChange={(event) => zoom.handleZoomSliderChange(Number(event.target.value))}
        />
        <button aria-label="Zoom vergroessern" className="icon-button video-stage__zoom-button" type="button" onClick={() => zoom.handleZoomStep('in')} disabled={zoom.zoomLevel >= MAX_ZOOM_LEVEL || !!playback.interstitialSegment}>+</button>
        <button className="button button--subtle video-stage__zoom-reset" type="button" onClick={zoom.resetZoom} disabled={!zoom.isZoomed || !!playback.interstitialSegment}>Reset</button>
      </div>
      <p className="video-stage__zoom-hint" key={zoom.isZoomed ? 'zoomed' : 'idle'}>
        {zoom.isZoomed
          ? 'Ziehen verschiebt den Ausschnitt. Doppelklick oder Reset stellt die Gesamtansicht wieder her.'
          : 'Mausrad, Plus/Minus oder Doppelklick zoomen direkt auf den gewählten Bereich.'}
      </p>
    </>
  ) : null

  const zoomControls = (selectedVideo && zoom.showZoomDock && !isFullscreen) ? (
    <div className="video-stage__zoom-dock" role="group" aria-label="Video-Zoom">
      <div className="video-stage__zoom-summary">
        <span className="video-stage__zoom-label" title="Zoom-Anzeige (Z: ein-/ausblenden)">Zoom</span>
        <strong>{zoom.zoomLevel.toFixed(2)}x</strong>
        <button type="button" className="video-stage__zoom-close" aria-label="Zoom-Anzeige ausblenden" title="Ausblenden (Z)" onClick={() => zoom.setShowZoomDock(false)}>×</button>
      </div>
      {zoomDockInner}
    </div>
  ) : null

  const zoomControlsPanel = selectedVideo ? (
    <div className="video-stage__zoom-dock video-stage__zoom-dock--panel" role="group" aria-label="Video-Zoom">
      <div className="video-stage__zoom-summary">
        <span className="video-stage__zoom-label">Zoom</span>
        <strong>{zoom.zoomLevel.toFixed(2)}x</strong>
      </div>
      {zoomDockInner}
    </div>
  ) : null

  const zoomBadge = (selectedVideo && !zoom.showZoomDock && !isFullscreen) ? (
    <button type="button" className="video-stage__zoom-badge" onClick={() => zoom.setShowZoomDock(true)} title="Zoom-Steuerung einblenden (Z)" aria-label="Zoom-Steuerung einblenden">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      Zoom
    </button>
  ) : null

  const fullscreenFlyouts = isFullscreen ? (
    <div className="fullscreen-flyouts" data-testid="fullscreen-flyout-shell">
      <button aria-controls="fullscreen-flyout-top" aria-expanded={activeFullscreenFlyout === 'top'} aria-label="Info einblenden" className="fullscreen-edge-trigger fullscreen-edge-trigger--top" type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('top')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('top')} onFocus={() => handleFullscreenFlyoutMouseEnter('top')} onBlur={() => handleFullscreenFlyoutMouseLeave('top')} onClick={() => toggleFullscreenFlyout('top')}>Info</button>
      <div className={`fullscreen-flyout-panel fullscreen-flyout-panel--top ${activeFullscreenFlyout === 'top' ? 'fullscreen-flyout-panel--open' : ''}`} id="fullscreen-flyout-top" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('top')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('top')}>
        <div className="fullscreen-card">{playerHeader}{assistRow}{playbackHint}</div>
      </div>

      <button aria-controls="fullscreen-flyout-left" aria-expanded={activeFullscreenFlyout === 'left'} aria-label="Segmente einblenden" className="fullscreen-edge-trigger fullscreen-edge-trigger--left" type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('left')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('left')} onFocus={() => handleFullscreenFlyoutMouseEnter('left')} onBlur={() => handleFullscreenFlyoutMouseLeave('left')} onClick={() => toggleFullscreenFlyout('left')}>Segmente</button>
      <div className={`fullscreen-flyout-panel fullscreen-flyout-panel--left ${activeFullscreenFlyout === 'left' ? 'fullscreen-flyout-panel--open' : ''}`} id="fullscreen-flyout-left" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('left')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('left')}>
        {segmentList}
      </div>

      <button aria-controls="fullscreen-flyout-right" aria-expanded={activeFullscreenFlyout === 'right'} aria-label="Werkzeuge einblenden" className="fullscreen-edge-trigger fullscreen-edge-trigger--right" type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('right')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('right')} onFocus={() => handleFullscreenFlyoutMouseEnter('right')} onBlur={() => handleFullscreenFlyoutMouseLeave('right')} onClick={() => toggleFullscreenFlyout('right')}>Werkzeuge</button>
      <div className={`fullscreen-flyout-panel fullscreen-flyout-panel--right ${activeFullscreenFlyout === 'right' ? 'fullscreen-flyout-panel--open' : ''}`} data-testid="fullscreen-flyout-right-panel" id="fullscreen-flyout-right" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('right')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('right')}>
        <div className="fullscreen-card fullscreen-card--stacked">
          <div className="fullscreen-exit-row">
            <button
              className="icon-button"
              type="button"
              onClick={() => void toggleFullscreen()}
              disabled={!selectedVideo}
              title="Vollbild beenden (F11)"
              aria-label="Vollbild beenden"
            >
              <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"/>
                <polyline points="20 10 14 10 14 4"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
                <line x1="3" y1="21" x2="14" y2="10"/>
              </svg>
            </button>
            <span className="fullscreen-exit-label">Vollbild beenden <kbd>F11</kbd></span>
          </div>
          {zoomControlsPanel}
          {repeatToggle}
          {errorBanner}
          <div className="fullscreen-filter-slot">
            {isValidElement<{ visible: boolean }>(children) && typeof children.type !== 'string'
              ? cloneElement(children, { visible: true })
              : children}
          </div>
        </div>
      </div>

      <button aria-controls="fullscreen-flyout-bottom" aria-expanded={activeFullscreenFlyout === 'bottom'} aria-label="Wiedergabe und Timeline einblenden" className="fullscreen-edge-trigger fullscreen-edge-trigger--bottom" type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('bottom')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('bottom')} onFocus={() => handleFullscreenFlyoutMouseEnter('bottom')} onBlur={() => handleFullscreenFlyoutMouseLeave('bottom')} onClick={() => toggleFullscreenFlyout('bottom')}>Steuerung</button>
      <div className={`fullscreen-flyout-panel fullscreen-flyout-panel--bottom ${activeFullscreenFlyout === 'bottom' ? 'fullscreen-flyout-panel--open' : ''}`} id="fullscreen-flyout-bottom" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('bottom')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('bottom')}>
        <div className="fullscreen-card fullscreen-card--stacked">
          <div className="player-controls player-controls--fullscreen">{transportControls}</div>
          {frameNavControls}
          {speedControls}
          {timeRow}
          {timeline}
        </div>
      </div>
    </div>
  ) : null

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="workspace-stack">
      <section className={`panel player-panel ${isFullscreen ? 'player-panel--fullscreen' : ''}`} ref={playerPanelRef}>
        {!isFullscreen ? playerHeader : null}

        <div className={`video-stage ${isFullscreen ? 'video-stage--fullscreen' : ''}`}>
          {selectedVideo ? (
            <>
              <div
                className={`video-stage__viewport ${zoom.isZoomed ? 'video-stage__viewport--zoomed' : ''} ${zoom.isPanningZoom ? 'video-stage__viewport--panning' : ''}`}
                data-testid="video-zoom-viewport"
                ref={videoStageViewportRef}
                onDoubleClick={playback.interstitialSegment ? undefined : zoom.handleVideoStageDoubleClick}
                onPointerCancel={playback.interstitialSegment ? undefined : zoom.handleZoomPointerCancel}
                onPointerDown={playback.interstitialSegment ? undefined : zoom.handleZoomPointerDown}
                onPointerMove={playback.interstitialSegment ? undefined : zoom.handleZoomPointerMove}
                onPointerUp={playback.interstitialSegment ? undefined : zoom.handleZoomPointerUp}
                onWheel={playback.interstitialSegment ? undefined : zoom.handleVideoStageWheel}
              >
                <div
                  className="video-stage__canvas"
                  data-testid="video-zoom-canvas"
                  style={{
                    left: `${zoom.fittedVideoRect.left}px`,
                    top: `${zoom.fittedVideoRect.top}px`,
                    width: `${zoom.fittedVideoRect.width}px`,
                    height: `${zoom.fittedVideoRect.height}px`,
                    transform: `translate(${zoom.zoomOffset.x}px, ${zoom.zoomOffset.y}px)`
                  }}
                >
                  <div
                    className="video-stage__content"
                    data-testid="video-zoom-content"
                    style={{ transform: `scale(${zoom.zoomLevel})` }}
                  >
                    <video
                      key={selectedVideo.fileUrl}
                      className={`video-stage__video ${zoom.isZoomed ? 'video-stage__video--zoomed' : ''}`}
                      controls={false}
                      preload="auto"
                      ref={videoRef}
                      src={playback.streamUrl ?? selectedVideo.fileUrl}
                      style={{ filter: buildCssFilter(filterSettings) }}
                      onCanPlay={playback.handleCanPlay}
                      onLoadedMetadata={playback.handleMetadataLoaded}
                      onError={playback.handleVideoError}
                      onTimeUpdate={playback.handleTimeUpdate}
                      onSeeked={playback.handleSeeked}
                      onPause={() => {}}
                      onPlay={() => {}}
                      onEnded={playback.handleVideoEnded}
                    />
                  </div>
                </div>

                <div className={`video-splash${(!isFullscreen || fullscreenStarted) ? ' video-splash--hidden' : ''}`} aria-hidden={!isFullscreen || fullscreenStarted}>
                  <img src={appLogo} className="video-splash__logo" alt="" aria-hidden="true" />
                  <div className="video-splash__brand">
                    <div className="brand-mark__word" aria-label="Kaderblick">
                      <span className="brand-mark__initial">K</span>
                      <span className="brand-mark__rest">ADERBLICK</span>
                    </div>
                    <div className="brand-mark__player">ANALYSE PLAYER</div>
                  </div>
                  <input
                    className="video-splash__title"
                    type="text"
                    value={sessionTitle}
                    onChange={(e) => onSessionTitleChange(e.target.value)}
                    placeholder="Sitzungsname (z.B. Videoanalyse 24.04.2026)"
                    aria-label="Sitzungsname"
                    tabIndex={(!isFullscreen || fullscreenStarted) ? -1 : 0}
                  />
                  <p className="video-splash__hint">Leertaste oder Play zum Starten</p>
                </div>

                {/* Interstitial is suppressed while the splash is visible in fullscreen */}
                {playback.interstitialSegment && (!isFullscreen || fullscreenStarted) ? (
                  <div
                    className="segment-interstitial"
                    aria-live="polite"
                    style={{ '--interstitial-duration': `${interstitialDuration}s` } as React.CSSProperties}
                  >
                    {interstitialLogoDataUrl ? (
                      <img src={interstitialLogoDataUrl} className="segment-interstitial__logo" alt="" aria-hidden="true" />
                    ) : null}
                    <p className="segment-interstitial__eyebrow">Nächste Szene</p>
                    <h2 className="segment-interstitial__title">{playback.interstitialSegment.title || '–'}</h2>
                    {playback.interstitialSegment.subTitle ? (
                      <p className="segment-interstitial__subtitle">{playback.interstitialSegment.subTitle}</p>
                    ) : null}
                    {(playback.isInterstitialCounting || playback.isInterstitialCountingPaused) ? (
                      <div className="segment-interstitial__progress">
                        <div
                          key={playback.interstitialCountdownKey}
                          className={`segment-interstitial__progress-bar${playback.isInterstitialCountingPaused ? ' segment-interstitial__progress-bar--paused' : ''}`}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {zoomControls}
              {zoomBadge}
              {!isFullscreen ? children : null}
            </>
          ) : (
            <div className="video-stage__empty">
              <h3>Kein Video geladen</h3>
              <p>Nach dem Laden eines Videos erscheinen hier Wiedergabe, Filter-Overlay und Segmentnavigation.</p>
            </div>
          )}
        </div>

        {!isFullscreen ? (
          <>
            {timeline}
            {timeRow}
            <div className="player-controls" data-testid="player-inline-controls">
              {transportControls}
              {utilityControls}
            </div>
            {frameNavControls}
            {speedControls}
            {assistRow}
            {playbackHint}
            {repeatToggle}
            {errorBanner}
            {overlayDialogs}
          </>
        ) : (
          <>
            {fullscreenFlyouts}
            {overlayDialogs}
          </>
        )}
      </section>

      {!isFullscreen ? segmentList : null}
    </div>
  )
}

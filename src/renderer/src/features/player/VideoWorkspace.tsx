import { cloneElement, isValidElement, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { buildCssFilter } from '../../../../common/filterUtils'
import { findActiveSegmentIndex, parseTimeInput } from '../../../../common/segmentUtils'
import { formatClockTime } from '../../../../common/timeUtils'
import { matchTimeToVideoTime, videoTimeToMatchTime } from '../../../../common/matchTimeUtils'
import type { FilterSettings, Segment, VideoFileDescriptor } from '../../../../common/types'
import appLogo from '../../../../../assets/kaderblick_analyse_player_appicon.svg'
import { SegmentList } from './SegmentList'
import { SegmentTimeline } from './SegmentTimeline'
import { useFullscreen } from './useFullscreen'
import { useVideoPlayback } from './useVideoPlayback'
import { useOnlineVideoPlayback } from './useOnlineVideoPlayback'
import { OnlineVideoPlayer } from './OnlineVideoPlayer'
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

interface KeyboardHudMessage {
  id: number
  icon: string
  label: string
  value?: string
}

const fullscreenOrientationStorageKey = 'kaderblick-fullscreen-orientation-visible'

function FlyoutPinIndicator() {
  return (
    <svg aria-hidden="true" className="fullscreen-edge-trigger__pin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.5h6M6 2.5v4l-2 2h8l-2-2v-4M8 8.5v5" />
    </svg>
  )
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
  const onlinePlayerContainerRef = useRef<HTMLDivElement | null>(null)
  const isInterstitialActiveRef = useRef(false)
  const titleRef = useRef<HTMLDivElement | null>(null)
  const titleInternalRef = useRef(sessionTitle ?? '')

  // Initialize contentEditable with the persisted title on mount
  useEffect(() => {
    if (titleRef.current && titleInternalRef.current) {
      titleRef.current.innerText = titleInternalRef.current
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { isFullscreen, activeFullscreenFlyout, pinnedFullscreenFlyout,
    toggleFullscreen, toggleFullscreenFlyout, closeUnpinnedFullscreenFlyout,
    handleFullscreenFlyoutMouseEnter, handleFullscreenFlyoutMouseLeave
  } = useFullscreen({ playerPanelRef })

  const zoom = useZoom({ videoStageViewportRef, videoRef, selectedVideo, isFullscreen, isInterstitialActiveRef })

  const isOnlineVideo = selectedVideo?.playbackMode === 'online'

  const localPlayback = useVideoPlayback({
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

  const onlinePlayback = useOnlineVideoPlayback({
    containerRef: onlinePlayerContainerRef,
    selectedVideo,
    segments,
    repeatSingleSegment,
    interstitialDuration,
    autoPlayOnLoad,
    autoStartSegmentsOnLoad,
    autoStartSegmentsFromEnd,
    onCurrentTimeChange,
    onVideoLoaded,
    onVideoError,
    onAllSegmentsDone,
    onFirstSegmentReached,
    onVideoEnded,
    onSegmentModeChange
  })

  const playback = isOnlineVideo ? onlinePlayback : localPlayback

  // useLayoutEffect: runs synchronously after every commit, before any browser events.
  // This guarantees isPlayingRef in App.tsx is always up-to-date before the next user interaction.
  useLayoutEffect(() => {
    onPlayStateChange?.(playback.isPlaying || playback.isInterstitialCounting)
  }, [onPlayStateChange, playback.isPlaying, playback.isInterstitialCounting])

  // Splash screen: show whenever fullscreen is entered; hide once playback/interstitial starts.
  const [fullscreenStarted, setFullscreenStarted] = useState(false)
  const [matchTimeInput, setMatchTimeInput] = useState('')
  const [matchTimeError, setMatchTimeError] = useState<string | null>(null)
  const [reversePlaybackError, setReversePlaybackError] = useState<string | null>(null)
  const [keyboardHud, setKeyboardHud] = useState<KeyboardHudMessage | null>(null)
  const [fullscreenOrientationVisible, setFullscreenOrientationVisible] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(fullscreenOrientationStorageKey) !== 'false'
  })
  const keyboardHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyboardHudSequenceRef = useRef(0)

  const showKeyboardHud = (icon: string, label: string, value?: string): void => {
    if (!isFullscreen || !selectedVideo) return
    if (keyboardHudTimerRef.current !== null) clearTimeout(keyboardHudTimerRef.current)
    keyboardHudSequenceRef.current += 1
    setKeyboardHud({ id: keyboardHudSequenceRef.current, icon, label, value })
    keyboardHudTimerRef.current = setTimeout(() => {
      setKeyboardHud(null)
      keyboardHudTimerRef.current = null
    }, 1500)
  }

  useEffect(() => () => {
    if (keyboardHudTimerRef.current !== null) clearTimeout(keyboardHudTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isFullscreen) setKeyboardHud(null)
  }, [isFullscreen])

  useEffect(() => {
    window.localStorage.setItem(fullscreenOrientationStorageKey, String(fullscreenOrientationVisible))
  }, [fullscreenOrientationVisible])

  // A closed flyout must not retain focus. Otherwise Space can activate or scroll
  // controls that have already been moved outside the fullscreen viewport.
  useEffect(() => {
    const focusedElement = document.activeElement
    if (!(focusedElement instanceof HTMLElement)) return
    const focusedFlyout = focusedElement.closest('.fullscreen-flyout-panel')
    if (focusedFlyout && !focusedFlyout.classList.contains('fullscreen-flyout-panel--open')) {
      focusedElement.blur()
    }
  }, [activeFullscreenFlyout])
  useEffect(() => setReversePlaybackError(null), [selectedVideo?.path])
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

  const jumpToKickoff = (): void => {
    if (selectedVideo?.kickoffVideoSeconds === undefined || selectedVideo.matchHalf === undefined) {
      showKeyboardHud('A', 'Anstoß nicht festgelegt')
      return
    }
    playback.seekTo(selectedVideo.kickoffVideoSeconds)
    showKeyboardHud('A', 'Anstoß', selectedVideo.matchHalf === 2 ? 'Spielzeit 45:00' : 'Spielzeit 00:00')
  }

  // Global keyboard shortcuts
  const onKeyboardShortcut = useEffectEvent((event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) {
        showKeyboardHud((playback.isPlaying || playback.isInterstitialCounting) ? 'Ⅱ' : '▶', (playback.isPlaying || playback.isInterstitialCounting) ? 'Angehalten' : 'Fortgesetzt')
        void playback.togglePlayPause()
      }
      return
    }

    const target = event.target as HTMLElement | null
    const isRangeInput = target instanceof HTMLInputElement && target.type === 'range'
    const isTyping =
      !isRangeInput && (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
    if (isTyping) return
    // Arrow keys on range inputs control the slider — don't intercept them
    if (isRangeInput && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) return

    if (event.code === 'ArrowLeft' && !event.shiftKey) {
      event.preventDefault()
      if (!event.repeat) {
        const result = playback.jumpToPreviousSegment()
        if (result === 'segment-start') showKeyboardHud('↤', 'Segmentanfang')
        else if (result === 'previous-segment') showKeyboardHud('‹', 'Voriges Segment')
        else showKeyboardHud('│‹', 'Erstes Segment erreicht')
      }
    }
    if (event.code === 'ArrowRight' && !event.shiftKey) { event.preventDefault(); if (!event.repeat) { showKeyboardHud('›', 'Nächstes Segment'); playback.jumpToNextSegment() } }
    if (event.code === 'ArrowLeft' && event.shiftKey) { event.preventDefault(); showKeyboardHud('↶', 'Zurückgesprungen', `${SEEK_STEP_SECONDS} s`); playback.jumpBySeconds(-SEEK_STEP_SECONDS) }
    if (event.code === 'ArrowRight' && event.shiftKey) { event.preventDefault(); showKeyboardHud('↷', 'Vorgesprungen', `${SEEK_STEP_SECONDS} s`); playback.jumpBySeconds(SEEK_STEP_SECONDS) }
    if (event.key === ',') { event.preventDefault(); showKeyboardHud('‹', 'Ein Bild zurück', '1 Frame'); playback.stepFrame('backward') }
    if (event.key === '.') { event.preventDefault(); showKeyboardHud('›', 'Ein Bild vor', '1 Frame'); playback.stepFrame('forward') }
    if (event.key === '[') { event.preventDefault(); showKeyboardHud('◉‹', 'Vorheriger Keyframe'); playback.jumpToPreviousKeyframe() }
    if (event.key === ']') { event.preventDefault(); showKeyboardHud('›◉', 'Nächster Keyframe'); playback.jumpToNextKeyframe() }
    if (event.key === '<') {
      event.preventDefault()
      const index = PLAYBACK_RATES.indexOf(playback.playbackRate)
      const nextRate = PLAYBACK_RATES[Math.max(0, index - 1)]
      showKeyboardHud('◀', 'Langsamer', formatRate(nextRate))
      playback.adjustPlaybackRate('slower')
    }
    if (event.key === '>') {
      event.preventDefault()
      const index = PLAYBACK_RATES.indexOf(playback.playbackRate)
      const nextRate = PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, index + 1)]
      showKeyboardHud('▶', 'Schneller', formatRate(nextRate))
      playback.adjustPlaybackRate('faster')
    }
    if (event.code === 'KeyA') {
      event.preventDefault()
      if (!event.repeat) jumpToKickoff()
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      if (event.repeat) return
      if (segments.length === 0) {
        showKeyboardHud('N', 'Keine Segmente verfügbar')
        return
      }
      showKeyboardHud('N', playback.isSegmentMode ? 'Segmentmodus beendet' : 'Segmentmodus aktiv')
      if (playback.isSegmentMode) playback.exitSegmentMode()
      else void playback.startSegmentPlayback()
    }
    if (event.code === 'KeyF') {
      event.preventDefault()
      if (event.repeat) return
      showKeyboardHud('F', filterOverlayVisible ? 'Filter ausgeblendet' : 'Filter eingeblendet')
      onToggleFilterOverlay()
    }
    if (event.code === 'KeyR' && !event.shiftKey) {
      event.preventDefault()
      if (event.repeat) return
      showKeyboardHud('R', repeatSingleSegment ? 'Wiederholung aus' : 'Wiederholung aktiv')
      onRepeatSingleSegmentChange(!repeatSingleSegment)
    }
    if (event.code === 'KeyR' && event.shiftKey) {
      event.preventDefault()
      if (event.repeat) return
      const error = playback.toggleReversePlayback()
      setReversePlaybackError(error)
      if (error === null) showKeyboardHud(playback.isReversing ? '▶' : '◀', playback.isReversing ? 'Vorwärtswiedergabe' : 'Rückwärtswiedergabe', formatRate(playback.playbackRate))
      else showKeyboardHud('!', 'Rückwärts nicht verfügbar')
    }
    if (event.code === 'F11') { event.preventDefault(); void toggleFullscreen() }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') { event.preventDefault(); if (!playback.interstitialSegment) { const next = Math.min(MAX_ZOOM_LEVEL, zoom.zoomLevel + ZOOM_STEP); showKeyboardHud('+', 'Vergrößert', formatRate(next)); zoom.zoomToViewportPoint(next) } }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') { event.preventDefault(); if (!playback.interstitialSegment) { const next = Math.max(MIN_ZOOM_LEVEL, zoom.zoomLevel - ZOOM_STEP); showKeyboardHud('−', 'Verkleinert', formatRate(next)); zoom.zoomToViewportPoint(next) } }
    if (event.code === 'Digit0' || event.code === 'Numpad0') { event.preventDefault(); if (!playback.interstitialSegment) { showKeyboardHud('↺', 'Zoom zurückgesetzt', formatRate(MIN_ZOOM_LEVEL)); zoom.resetZoom() } }
    if (event.code === 'KeyZ') {
      event.preventDefault()
      if (event.repeat) return
      showKeyboardHud('Z', zoom.showZoomDock ? 'Zoomsteuerung ausgeblendet' : 'Zoomsteuerung eingeblendet')
      zoom.setShowZoomDock(prev => !prev)
    }
    if (event.code === 'KeyM') {
      event.preventDefault()
      if (event.repeat) return
      showKeyboardHud('M', playback.segmentMuted ? 'Ton im Segment deaktiviert' : playback.userMuted ? 'Ton eingeschaltet' : 'Ton ausgeschaltet')
      playback.setUserMuted(prev => !prev)
    }
    if (event.code === 'KeyT') {
      event.preventDefault()
      if (event.repeat) return
      setFullscreenOrientationVisible((visible) => {
        showKeyboardHud('T', visible ? 'Zeitinfo ausgeblendet' : 'Zeitinfo eingeblendet')
        return !visible
      })
    }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => onKeyboardShortcut(event)
    const suppressSpaceActivation = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', suppressSpaceActivation, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', suppressSpaceActivation, true)
    }
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

  const hasMatchClock = selectedVideo?.matchHalf !== undefined && selectedVideo.kickoffVideoSeconds !== undefined
  const currentMatchTime = hasMatchClock
    ? videoTimeToMatchTime(playback.currentTime, selectedVideo.kickoffVideoSeconds!, selectedVideo.matchHalf!)
    : null
  const orientationSegmentIndex = playback.activeSegmentIndex >= 0
    ? playback.activeSegmentIndex
    : findActiveSegmentIndex(segments, playback.currentTime)
  const orientationSegment = orientationSegmentIndex >= 0 ? segments[orientationSegmentIndex] : undefined
  const orientationSegmentRemaining = orientationSegment
    ? Math.max(0, orientationSegment.endSeconds - playback.currentTime)
    : 0
  const segmentsAfterCurrent = orientationSegmentIndex >= 0
    ? Math.max(0, segments.length - orientationSegmentIndex - 1)
    : segments.length
  const handleMatchTimeSeek = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!selectedVideo || !hasMatchClock) return
    const matchSeconds = parseTimeInput(matchTimeInput)
    if (matchSeconds === null) {
      setMatchTimeError('Bitte eine Spielzeit wie 45:12 eingeben.')
      return
    }
    const videoSeconds = matchTimeToVideoTime(matchSeconds, selectedVideo.kickoffVideoSeconds!, selectedVideo.matchHalf!)
    if (videoSeconds < 0 || (playback.duration > 0 && videoSeconds > playback.duration)) {
      setMatchTimeError('Diese Spielzeit liegt außerhalb des Videos.')
      return
    }
    setMatchTimeError(null)
    handleTimelineSeek(videoSeconds)
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
      <button className="button button--primary" type="button" onClick={() => void playback.togglePlayPause()} disabled={!selectedVideo} title="Play / Pause (Leertaste)">
        {(playback.isPlaying || playback.isInterstitialCounting) ? 'Pause' : 'Play'}
      </button>
      <button
        className={`button${playback.isSegmentMode ? ' button--active' : ''}`}
        type="button"
        onClick={() => playback.isSegmentMode ? playback.exitSegmentMode() : void playback.startSegmentPlayback()}
        disabled={!selectedVideo || segments.length === 0}
        aria-pressed={playback.isSegmentMode}
        title={playback.isSegmentMode ? 'Wieder das vollständige Video abspielen (N)' : 'Nur die vorhandenen Segmente der Reihe nach abspielen (N)'}
      >
        {playback.isSegmentMode ? 'Segmentmodus beenden' : 'Nur Segmente abspielen'}
      </button>
      <button className="button" type="button" onClick={playback.jumpToPreviousSegment} disabled={segments.length === 0} title="Zum Segmentanfang; erneut drücken für das vorige Segment (←)">
        Voriges Segment
      </button>
      <button className="button" type="button" onClick={playback.jumpToNextSegment} disabled={segments.length === 0} title="Nächstes Segment (→)">
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
      <button aria-label={`${SEEK_STEP_SECONDS} Sekunden zurück`} className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.jumpBySeconds(-SEEK_STEP_SECONDS)} disabled={!selectedVideo} title={`${SEEK_STEP_SECONDS} Sekunden zurück (Shift+←)`}>−{SEEK_STEP_SECONDS}s</button>
      <button aria-label="Ein Bild zurück" className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.stepFrame('backward')} disabled={!selectedVideo} title="Ein Bild zurück (,)">│‹</button>
      <button aria-label="Ein Bild vor" className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.stepFrame('forward')} disabled={!selectedVideo} title="Ein Bild vor (.)">›│</button>
      <button aria-label={`${SEEK_STEP_SECONDS} Sekunden vor`} className="button button--subtle frame-nav-controls__btn" type="button" onClick={() => playback.jumpBySeconds(SEEK_STEP_SECONDS)} disabled={!selectedVideo} title={`${SEEK_STEP_SECONDS} Sekunden vor (Shift+→)`}>+{SEEK_STEP_SECONDS}s</button>
      <button aria-label="Vorheriger Keyframe" className="button button--subtle frame-nav-controls__btn" type="button" onClick={playback.jumpToPreviousKeyframe} disabled={!selectedVideo || playback.keyframeTimes.length === 0} title="Zum vorherigen Keyframe ([)">‹◆</button>
      <button aria-label="Nächster Keyframe" className="button button--subtle frame-nav-controls__btn" type="button" onClick={playback.jumpToNextKeyframe} disabled={!selectedVideo || playback.keyframeTimes.length === 0} title="Zum nächsten Keyframe (])">◆›</button>
    </div>
  )

  const speedControls = (
    <div className="controls-row speed-controls" role="group" aria-label="Wiedergabegeschwindigkeit">
      <span className="speed-controls__label">Geschwindigkeit</span>
      <button
        className={`button button--subtle${playback.isReversing ? ' button--active' : ''}`}
        type="button"
        disabled={!selectedVideo}
        aria-pressed={playback.isReversing}
        title={playback.isReversing ? 'Zur Vorwärtswiedergabe wechseln (Shift+R)' : 'Video rückwärts abspielen (Shift+R, ohne Ton)'}
        onClick={() => setReversePlaybackError(playback.toggleReversePlayback())}
      >
        {playback.isReversing ? 'Vorwärts' : 'Rückwärts'}
      </button>
      <button className="button button--subtle speed-controls__step" type="button" onClick={() => { setReversePlaybackError(null); playback.adjustPlaybackRate('slower') }} disabled={!selectedVideo || playback.playbackRate <= PLAYBACK_RATES[0]} title="Langsamer (<)" aria-label="Langsamer">−</button>
      {PLAYBACK_RATES.map((rate) => (
        <button
          key={rate}
          className={`button speed-controls__rate${playback.playbackRate === rate ? ' button--primary speed-controls__rate--active' : ' button--subtle'}`}
          type="button"
          onClick={() => { setReversePlaybackError(null); playback.changePlaybackRate(rate) }}
          disabled={!selectedVideo}
          title={`Geschwindigkeit: ${formatRate(rate)}`}
          aria-pressed={playback.playbackRate === rate}
        >
          {formatRate(rate)}
        </button>
      ))}
      <button className="button button--subtle speed-controls__step" type="button" onClick={() => { setReversePlaybackError(null); playback.adjustPlaybackRate('faster') }} disabled={!selectedVideo || playback.playbackRate >= PLAYBACK_RATES[PLAYBACK_RATES.length - 1]} title="Schneller (>)" aria-label="Schneller">+</button>
      {reversePlaybackError && <span className="speed-controls__error" role="alert">{reversePlaybackError}</span>}
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
          <kbd>←</kbd><span>Segmentanfang; zweimal: voriges Segment</span>
          <kbd>→</kbd><span>Nächstes Segment</span>
          <kbd>Shift+← →</kbd><span>{SEEK_STEP_SECONDS} Sekunden zurück / vor</span>
          <kbd>, .</kbd><span>Ein Bild zurück / vor</span>
          <kbd>&lt; &gt;</kbd><span>Langsamer / Schneller</span>
          <kbd>A</kbd><span>Zum Anstoß springen</span>
          <kbd>N</kbd><span>Nur Segmente abspielen ein-/ausschalten</span>
          <kbd>F</kbd><span>Filter ein-/ausblenden</span>
          <kbd>R</kbd><span>Einzelwiederholung umschalten</span>
          <kbd>Z</kbd><span>Zoom-Steuerung ein-/ausblenden</span>
          <kbd>F11</kbd><span>Vollbild</span>
          <kbd>M</kbd><span>Stummschalten ein-/ausschalten</span>
          <kbd>T</kbd><span>Zeiten und Segment ein-/ausblenden</span>
          <kbd>+ −</kbd><span>Zoom vergrößern / verkleinern</span>
          <kbd>0</kbd><span>Zoom zurücksetzen</span>
          <kbd>Shift+R</kbd><span>Vorwärts / Rückwärts umschalten</span>
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
    <label className="toggle-row" title="Aktives Segment endlos wiederholen (R)">
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

  const fullscreenRepeatButton = (
    <button
      className={`button button--subtle fullscreen-repeat-button${repeatSingleSegment ? ' button--active' : ''}`}
      type="button"
      disabled={segments.length === 0}
      aria-label="Segment endlos wiederholen"
      aria-pressed={repeatSingleSegment}
      title={repeatSingleSegment ? 'Segmentwiederholung ausschalten (R)' : 'Segment endlos wiederholen (R)'}
      onClick={() => onRepeatSingleSegmentChange(!repeatSingleSegment)}
    >
      <span>Wiederholen</span>
      <kbd aria-hidden="true">R</kbd>
    </button>
  )

  const fullscreenKickoffButton = (
    <button
      className="button button--subtle fullscreen-kickoff-button"
      type="button"
      disabled={!selectedVideo}
      aria-label="Zum Anstoß springen"
      title={selectedVideo?.kickoffVideoSeconds === undefined || selectedVideo.matchHalf === undefined
        ? 'Zum Anstoß springen (A) – Anstoß nicht festgelegt'
        : 'Zum Anstoß springen (A)'}
      onClick={jumpToKickoff}
    >
      <span>Anstoß</span>
      <kbd aria-hidden="true">A</kbd>
    </button>
  )

  const timeRow = (
    <div className="match-time-controls">
      <div className="time-row">
        <span className="time-row__current">{formatClockTime(playback.currentTime)}</span>
      {playback.duration > 0 ? (
        <span className="time-row__remaining" aria-label={`Verbleibend: ${formatClockTime(Math.max(0, playback.duration - playback.currentTime))}`}>
          −{formatClockTime(Math.max(0, playback.duration - playback.currentTime))}
        </span>
      ) : null}
        <span className="time-row__total">{formatClockTime(playback.duration)}</span>
      </div>
      {hasMatchClock && (
        <form className="match-time-jump" onSubmit={handleMatchTimeSeek}>
          <span className="match-time-jump__current">Spielzeit: {currentMatchTime !== null && currentMatchTime >= 0 ? formatClockTime(currentMatchTime) : 'vor Anstoß'}</span>
          <label htmlFor="match-time-input">Springe zu Spielzeit</label>
          <input id="match-time-input" value={matchTimeInput} onChange={(event) => setMatchTimeInput(event.target.value)} placeholder={selectedVideo?.matchHalf === 2 ? 'z. B. 45:12' : 'z. B. 09:00'} />
          <button className="button button--subtle" type="submit" title="Zur eingegebenen Spielzeit springen (Enter)">Springen</button>
          {matchTimeError && <span className="match-time-jump__error" role="alert">{matchTimeError}</span>}
        </form>
      )}
    </div>
  )

  const fullscreenOrientation = isFullscreen && fullscreenStarted && fullscreenOrientationVisible && activeFullscreenFlyout !== 'bottom' ? (
    <div
      className={`fullscreen-orientation${playback.isPlaying ? ' fullscreen-orientation--playing' : ''}`}
      data-testid="fullscreen-orientation"
      aria-label="Zeit- und Segmentorientierung"
    >
      {hasMatchClock ? (
        <div className="fullscreen-orientation__item fullscreen-orientation__item--primary">
          <span>Spielzeit</span>
          <strong>{currentMatchTime !== null && currentMatchTime >= 0 ? formatClockTime(currentMatchTime) : 'vor Anstoß'}</strong>
        </div>
      ) : null}
      <div className="fullscreen-orientation__item">
        <span>Video</span>
        <strong>{formatClockTime(playback.currentTime)} <small>/ {formatClockTime(playback.duration)}</small></strong>
        <em>noch {formatClockTime(Math.max(0, playback.duration - playback.currentTime))}</em>
      </div>
      {orientationSegment ? (
        <div className="fullscreen-orientation__item">
          <span>Segment {orientationSegmentIndex + 1}/{segments.length}</span>
          <strong>noch {formatClockTime(orientationSegmentRemaining)}</strong>
          <em>{formatClockTime(orientationSegment.startSeconds)}–{formatClockTime(orientationSegment.endSeconds)} · {segmentsAfterCurrent} danach</em>
        </div>
      ) : segments.length > 0 ? (
        <div className="fullscreen-orientation__item">
          <span>Segmente</span>
          <strong>{segments.length} verfügbar</strong>
          <em>{playback.isSegmentMode ? 'Segmentfolge aktiv' : 'Segmentmodus aus'}</em>
        </div>
      ) : null}
      <button
        className="fullscreen-orientation__close"
        type="button"
        onClick={() => setFullscreenOrientationVisible(false)}
        title="Zeitinfo ausblenden (T)"
        aria-label="Zeitinfo ausblenden"
      >×</button>
    </div>
  ) : null

  const fullscreenInfo = (
    <div className="fullscreen-info">
      <div className="fullscreen-info__heading">
        <div>
          <span className="fullscreen-info__eyebrow">Aktuelles Video</span>
          <strong>{selectedVideo?.fileName ?? 'Kein Video geladen'}</strong>
        </div>
        <span className={`fullscreen-info__state${playback.isPlaying || playback.isInterstitialCounting ? ' fullscreen-info__state--active' : ''}`}>
          {playback.isPlaying || playback.isInterstitialCounting ? 'Wiedergabe' : 'Pause'}
        </span>
      </div>
      <div className="fullscreen-info__grid">
        <div><span>Position</span><strong>{formatClockTime(playback.currentTime)} / {formatClockTime(playback.duration)}</strong></div>
        {hasMatchClock ? <div><span>Spielzeit</span><strong>{currentMatchTime !== null && currentMatchTime >= 0 ? formatClockTime(currentMatchTime) : 'vor Anstoß'}</strong></div> : null}
        <div><span>Wiedergabe</span><strong>{playback.isReversing ? 'Rückwärts' : 'Vorwärts'} · {formatRate(playback.playbackRate)}</strong></div>
        <div><span>Ton</span><strong>{playback.segmentMuted ? 'im Segment aus' : playback.userMuted ? 'aus' : 'an'}</strong></div>
        <div><span>Segmentmodus</span><strong>{playback.isSegmentMode ? 'aktiv' : 'aus'}</strong></div>
        <div><span>Aktuelles Segment</span><strong>{orientationSegment ? `${orientationSegmentIndex + 1} von ${segments.length} · noch ${formatClockTime(orientationSegmentRemaining)}` : `– · ${segments.length} verfügbar`}</strong></div>
      </div>
      <label className="fullscreen-info__toggle" title="Zeiten und Segment ein-/ausblenden (T)">
        <input
          type="checkbox"
          checked={fullscreenOrientationVisible}
          onChange={(event) => setFullscreenOrientationVisible(event.target.checked)}
        />
        <span>Zeiten und Segment anzeigen</span>
        <kbd>T</kbd>
      </label>
      {assistRow}
      {playbackHint}
    </div>
  )

  const fullscreenPlaybackBanner = isFullscreen && errorBanner ? (
    <div className="fullscreen-playback-banner" data-testid="fullscreen-playback-banner" role="alert">
      {errorBanner}
    </div>
  ) : null

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
      onSelectSegment={(index) => {
        playback.jumpToSegment(index, false, true)
        if (isFullscreen) closeUnpinnedFullscreenFlyout('left')
      }}
    />
  )

  const zoomDockInner = selectedVideo ? (
    <>
      <div className="video-stage__zoom-actions">
        <button aria-label="Zoom verkleinern" title="Zoom verkleinern (−)" className="icon-button video-stage__zoom-button" type="button" onClick={() => zoom.handleZoomStep('out')} disabled={zoom.zoomLevel <= MIN_ZOOM_LEVEL || !!playback.interstitialSegment}>-</button>
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
        <button aria-label="Zoom vergroessern" title="Zoom vergrößern (+)" className="icon-button video-stage__zoom-button" type="button" onClick={() => zoom.handleZoomStep('in')} disabled={zoom.zoomLevel >= MAX_ZOOM_LEVEL || !!playback.interstitialSegment}>+</button>
        <button className="button button--subtle video-stage__zoom-reset" type="button" title="Zoom zurücksetzen (0)" onClick={zoom.resetZoom} disabled={!zoom.isZoomed || !!playback.interstitialSegment}>Reset</button>
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
      <button aria-controls="fullscreen-flyout-top" aria-expanded={activeFullscreenFlyout === 'top'} aria-pressed={pinnedFullscreenFlyout === 'top'} aria-label={pinnedFullscreenFlyout === 'top' ? 'Info angeheftet; klicken zum Lösen' : 'Info einblenden'} className={`fullscreen-edge-trigger fullscreen-edge-trigger--top${pinnedFullscreenFlyout === 'top' ? ' fullscreen-edge-trigger--pinned' : ''}`} type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('top')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('top')} onFocus={() => handleFullscreenFlyoutMouseEnter('top')} onBlur={() => handleFullscreenFlyoutMouseLeave('top')} onClick={() => toggleFullscreenFlyout('top')}><span>Info</span>{pinnedFullscreenFlyout === 'top' ? <FlyoutPinIndicator /> : null}</button>
      <div aria-hidden={activeFullscreenFlyout !== 'top'} className={`fullscreen-flyout-panel fullscreen-flyout-panel--top ${activeFullscreenFlyout === 'top' ? 'fullscreen-flyout-panel--open' : ''}`} id="fullscreen-flyout-top" inert={activeFullscreenFlyout !== 'top'} onMouseEnter={() => handleFullscreenFlyoutMouseEnter('top')} onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) handleFullscreenFlyoutMouseLeave('top') }} onFocus={() => handleFullscreenFlyoutMouseEnter('top')} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) handleFullscreenFlyoutMouseLeave('top') }}>
        <div className="fullscreen-card">{fullscreenInfo}</div>
      </div>

      <button aria-controls="fullscreen-flyout-left" aria-expanded={activeFullscreenFlyout === 'left'} aria-pressed={pinnedFullscreenFlyout === 'left'} aria-label={pinnedFullscreenFlyout === 'left' ? 'Segmente angeheftet; klicken zum Lösen' : 'Segmente einblenden'} className={`fullscreen-edge-trigger fullscreen-edge-trigger--left${pinnedFullscreenFlyout === 'left' ? ' fullscreen-edge-trigger--pinned' : ''}`} type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('left')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('left')} onFocus={() => handleFullscreenFlyoutMouseEnter('left')} onBlur={() => handleFullscreenFlyoutMouseLeave('left')} onClick={() => toggleFullscreenFlyout('left')}><span>Segmente</span>{pinnedFullscreenFlyout === 'left' ? <FlyoutPinIndicator /> : null}</button>
      <div aria-hidden={activeFullscreenFlyout !== 'left'} className={`fullscreen-flyout-panel fullscreen-flyout-panel--left ${activeFullscreenFlyout === 'left' ? 'fullscreen-flyout-panel--open' : ''}`} id="fullscreen-flyout-left" inert={activeFullscreenFlyout !== 'left'} onMouseEnter={() => handleFullscreenFlyoutMouseEnter('left')} onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) handleFullscreenFlyoutMouseLeave('left') }} onFocus={() => handleFullscreenFlyoutMouseEnter('left')} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) handleFullscreenFlyoutMouseLeave('left') }}>
        {segmentList}
      </div>

      <button aria-controls="fullscreen-flyout-right" aria-expanded={activeFullscreenFlyout === 'right'} aria-pressed={pinnedFullscreenFlyout === 'right'} aria-label={pinnedFullscreenFlyout === 'right' ? 'Werkzeuge angeheftet; klicken zum Lösen' : 'Werkzeuge einblenden'} className={`fullscreen-edge-trigger fullscreen-edge-trigger--right${pinnedFullscreenFlyout === 'right' ? ' fullscreen-edge-trigger--pinned' : ''}`} type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('right')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('right')} onFocus={() => handleFullscreenFlyoutMouseEnter('right')} onBlur={() => handleFullscreenFlyoutMouseLeave('right')} onClick={() => toggleFullscreenFlyout('right')}><span>Werkzeuge</span>{pinnedFullscreenFlyout === 'right' ? <FlyoutPinIndicator /> : null}</button>
      <div aria-hidden={activeFullscreenFlyout !== 'right'} className={`fullscreen-flyout-panel fullscreen-flyout-panel--right ${activeFullscreenFlyout === 'right' ? 'fullscreen-flyout-panel--open' : ''}`} data-testid="fullscreen-flyout-right-panel" id="fullscreen-flyout-right" inert={activeFullscreenFlyout !== 'right'} onMouseEnter={() => handleFullscreenFlyoutMouseEnter('right')} onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) handleFullscreenFlyoutMouseLeave('right') }} onFocus={() => handleFullscreenFlyoutMouseEnter('right')} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) handleFullscreenFlyoutMouseLeave('right') }}>
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
          <div className="fullscreen-filter-slot">
            {isValidElement<{ visible: boolean }>(children) && typeof children.type !== 'string'
              ? cloneElement(children, { visible: true })
              : children}
          </div>
        </div>
      </div>

      <button aria-controls="fullscreen-flyout-bottom" aria-expanded={activeFullscreenFlyout === 'bottom'} aria-pressed={pinnedFullscreenFlyout === 'bottom'} aria-label={pinnedFullscreenFlyout === 'bottom' ? 'Steuerung angeheftet; klicken zum Lösen' : 'Wiedergabe und Timeline einblenden'} className={`fullscreen-edge-trigger fullscreen-edge-trigger--bottom${pinnedFullscreenFlyout === 'bottom' ? ' fullscreen-edge-trigger--pinned' : ''}`} type="button" onMouseEnter={() => handleFullscreenFlyoutMouseEnter('bottom')} onMouseLeave={() => handleFullscreenFlyoutMouseLeave('bottom')} onFocus={() => handleFullscreenFlyoutMouseEnter('bottom')} onBlur={() => handleFullscreenFlyoutMouseLeave('bottom')} onClick={() => toggleFullscreenFlyout('bottom')}><span>Steuerung</span>{pinnedFullscreenFlyout === 'bottom' ? <FlyoutPinIndicator /> : null}</button>
      <div aria-hidden={activeFullscreenFlyout !== 'bottom'} className={`fullscreen-flyout-panel fullscreen-flyout-panel--bottom ${activeFullscreenFlyout === 'bottom' ? 'fullscreen-flyout-panel--open' : ''}`} id="fullscreen-flyout-bottom" inert={activeFullscreenFlyout !== 'bottom'} onMouseEnter={() => handleFullscreenFlyoutMouseEnter('bottom')} onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) handleFullscreenFlyoutMouseLeave('bottom') }} onFocus={() => handleFullscreenFlyoutMouseEnter('bottom')} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) handleFullscreenFlyoutMouseLeave('bottom') }}>
        <div className="fullscreen-card fullscreen-card--stacked">
          {timeline}
          {timeRow}
          <div className="player-controls player-controls--fullscreen">
            <div className="fullscreen-transport-row">
              {transportControls}
              {fullscreenKickoffButton}
              {fullscreenRepeatButton}
            </div>
          </div>
          <div className="fullscreen-precision-row">
            {frameNavControls}
            {speedControls}
          </div>
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
                    transform: `translate(${zoom.zoomOffset.x}px, ${zoom.zoomOffset.y}px)`,
                    ...(isOnlineVideo ? { filter: buildCssFilter(filterSettings) } : {})
                  }}
                >
                  <div
                    className="video-stage__content"
                    data-testid="video-zoom-content"
                    style={{ transform: `scale(${zoom.zoomLevel})` }}
                  >
                    {isOnlineVideo ? (
                      <OnlineVideoPlayer
                        containerRef={onlinePlayerContainerRef}
                        selectedVideo={selectedVideo}
                      />
                    ) : (
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
                        onPause={playback.handleVideoPause}
                        onPlay={playback.handleVideoPlay}
                        onEnded={playback.handleVideoEnded}
                      />
                    )}
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
                  <div
                    ref={titleRef}
                    className="video-splash__title"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Sitzungsname"
                    data-placeholder="Sitzungsname (z.B. Videoanalyse 24.04.2026)"
                    tabIndex={(!isFullscreen || fullscreenStarted) ? -1 : 0}
                    onInput={(e) => {
                      const text = e.currentTarget.innerText
                      titleInternalRef.current = text
                      onSessionTitleChange(text)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const lines = e.currentTarget.innerText.split('\n')
                        if (lines.length >= 2) e.preventDefault()
                      }
                    }}
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
                {isFullscreen && keyboardHud ? (
                  <div key={keyboardHud.id} className="fullscreen-keyboard-hud" data-testid="fullscreen-keyboard-hud" aria-live="polite">
                    <span className="fullscreen-keyboard-hud__icon" aria-hidden="true">{keyboardHud.icon}</span>
                    <span className="fullscreen-keyboard-hud__copy">
                      <span className="fullscreen-keyboard-hud__label">{keyboardHud.label}</span>
                      {keyboardHud.value ? <strong>{keyboardHud.value}</strong> : null}
                    </span>
                  </div>
                ) : null}
                {fullscreenOrientation}
                {fullscreenPlaybackBanner}
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
            <div className="player-control-deck">
              {timeline}
              {timeRow}
              <div className="player-controls" data-testid="player-inline-controls">
                {transportControls}
                {utilityControls}
              </div>
              <div className="player-controls__precision">
                {frameNavControls}
                {speedControls}
              </div>
              <div className="player-controls__secondary">
                {assistRow}
                {repeatToggle}
              </div>
              {playbackHint}
              {errorBanner}
            </div>
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

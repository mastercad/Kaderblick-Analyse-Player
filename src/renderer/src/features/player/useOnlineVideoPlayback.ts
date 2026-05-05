import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { findActiveSegmentIndex, getNextSegmentIndex, getPreviousSegmentIndex, resolveSegmentSequenceStartIndex } from '../../../../common/segmentUtils'
import { getSegmentPlaybackTransition } from '../../../../common/segmentPlayback'
import type { Segment, VideoFileDescriptor } from '../../../../common/types'
import { PLAYBACK_RATES } from './playerTypes'

// ─── Module-level API loading ─────────────────────────────────────────────────

let ytScriptLoaded = false
let ytApiReady = false
const ytPendingCallbacks: Array<() => void> = []

function ensureYouTubeApiLoaded(): Promise<void> {
  if (ytApiReady) return Promise.resolve()
  return new Promise((resolve) => {
    ytPendingCallbacks.push(resolve)
    if (!ytScriptLoaded) {
      ytScriptLoaded = true
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        ytApiReady = true
        prev?.()
        for (const cb of ytPendingCallbacks) cb()
        ytPendingCallbacks.length = 0
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
  })
}

let vimeoScriptLoaded = false
let vimeoApiReady = false
const vimeoPendingCallbacks: Array<() => void> = []

function ensureVimeoApiLoaded(): Promise<void> {
  if (vimeoApiReady) return Promise.resolve()
  return new Promise((resolve, reject) => {
    vimeoPendingCallbacks.push(resolve)
    if (!vimeoScriptLoaded) {
      vimeoScriptLoaded = true
      const tag = document.createElement('script')
      tag.src = 'https://player.vimeo.com/api/player.js'
      tag.onload = () => {
        vimeoApiReady = true
        for (const cb of vimeoPendingCallbacks) cb()
        vimeoPendingCallbacks.length = 0
      }
      tag.onerror = () => reject(new Error('Vimeo-SDK konnte nicht geladen werden.'))
      document.head.appendChild(tag)
    }
  })
}

// ─── Normalised player abstraction ───────────────────────────────────────────

interface NormalisedPlayer {
  play(): void
  pause(): void
  seekTo(seconds: number): void
  getCurrentTime(): number | Promise<number>
  setVolume(zeroToOne: number): void
  destroy(): void
}

// ─── Hook options (matches useVideoPlayback signature) ───────────────────────

interface UseOnlineVideoPlaybackOptions {
  containerRef: RefObject<HTMLDivElement | null>
  selectedVideo: VideoFileDescriptor | undefined
  segments: Segment[]
  repeatSingleSegment: boolean
  interstitialDuration: number
  autoPlayOnLoad: boolean
  autoStartSegmentsOnLoad: boolean
  autoStartSegmentsFromEnd?: boolean
  onCurrentTimeChange?: (timeSeconds: number) => void
  onVideoLoaded?: (durationSeconds: number) => void
  onVideoError?: (message: string, recoverable: boolean) => void
  onAllSegmentsDone?: () => void
  onFirstSegmentReached?: () => void
  onVideoEnded?: () => void
  onSegmentModeChange?: (active: boolean) => void
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOnlineVideoPlayback({
  containerRef,
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
}: UseOnlineVideoPlaybackOptions) {
  const isOnline = selectedVideo?.playbackMode === 'online'

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSegmentMode, setIsSegmentMode] = useState(false)
  const [sequenceIndex, setSequenceIndex] = useState(-1)
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [userMuted, setUserMuted] = useState(false)
  const [hasEverPlayed, setHasEverPlayed] = useState(false)
  const [videoError, setVideoError] = useState<string | undefined>()
  const [interstitialSegment, setInterstitialSegment] = useState<Segment | null>(null)
  const [isInterstitialCounting, setIsInterstitialCounting] = useState(false)
  const [isInterstitialCountingPaused, setIsInterstitialCountingPaused] = useState(false)
  const [interstitialCountdownKey, setInterstitialCountdownKey] = useState(0)

  const playerRef = useRef<NormalisedPlayer | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isInterstitialActiveRef = useRef(false)
  const interstitialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interstitialOnDoneRef = useRef<(() => void) | null>(null)
  const interstitialStartMsRef = useRef(0)
  const interstitialCurrentDurationMsRef = useRef(0)
  const interstitialRemainingMsRef = useRef(0)
  const isPlayingRef = useRef(false)
  const isSegmentModeRef = useRef(false)
  const sequenceIndexRef = useRef(-1)
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const pendingAutoPlayRef = useRef(false)
  const pendingAutoStartSegmentsRef = useRef(false)
  const pendingStartFromLastSegmentRef = useRef(false)
  const segmentsRef = useRef(segments)

  // Keep segment refs in sync
  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { isSegmentModeRef.current = isSegmentMode }, [isSegmentMode])
  useEffect(() => { sequenceIndexRef.current = sequenceIndex }, [sequenceIndex])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { durationRef.current = duration }, [duration])

  // Notify parent when segment mode changes
  useEffect(() => { onSegmentModeChange?.(isSegmentMode) }, [isSegmentMode])

  // Keep activeSegmentIndex in sync with currentTime
  useEffect(() => {
    if (segments.length === 0) {
      setIsSegmentMode(false)
      setSequenceIndex(-1)
      setActiveSegmentIndex(-1)
      return
    }
    setActiveSegmentIndex(findActiveSegmentIndex(segments, currentTime))
  }, [segments, currentTime])

  // ─── Polling ─────────────────────────────────────────────────────────────

  const stopPolling = (): void => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const startPolling = (): void => {
    stopPolling()
    pollTimerRef.current = setInterval(() => {
      const player = playerRef.current
      if (!player) return

      const rawTime = player.getCurrentTime()
      const resolveTime = (t: number): void => {
        if (isInterstitialActiveRef.current) return
        const next = Math.max(0, t)
        currentTimeRef.current = next
        setCurrentTime(next)
        onCurrentTimeChange?.(next)
        setActiveSegmentIndex(findActiveSegmentIndex(segmentsRef.current, next))

        if (!isSegmentModeRef.current || sequenceIndexRef.current < 0 || isInterstitialActiveRef.current) return

        const seg = segmentsRef.current[sequenceIndexRef.current]
        if (!seg) return

        // If we've drifted before the segment start, seek back
        if (next < seg.startSeconds - 0.3) {
          player.seekTo(seg.startSeconds)
          return
        }

        // Check if segment ended (with a small margin to avoid gaps)
        if (next >= seg.endSeconds - 0.1) {
          handleSegmentBoundary()
        }
      }

      if (rawTime instanceof Promise) {
        void rawTime.then(resolveTime)
      } else {
        resolveTime(rawTime)
      }
    }, 200)
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  const pausePlayback = (): void => {
    playerRef.current?.pause()
    setIsPlaying(false)
    isPlayingRef.current = false
  }

  const playPlayback = (): void => {
    if (!playerRef.current) return
    try {
      playerRef.current.play()
      setIsPlaying(true)
      isPlayingRef.current = true
      setHasEverPlayed(true)
      setVideoError(undefined)
    } catch {
      setIsPlaying(false)
      isPlayingRef.current = false
    }
  }

  const seekTo = (nextTimeSeconds: number): void => {
    playerRef.current?.seekTo(nextTimeSeconds)
    currentTimeRef.current = nextTimeSeconds
    setCurrentTime(nextTimeSeconds)
    setActiveSegmentIndex(findActiveSegmentIndex(segmentsRef.current, nextTimeSeconds))
  }

  const startInterstitialCountdown = (remainingMs?: number): void => {
    if (interstitialTimerRef.current !== null) return
    const onDone = interstitialOnDoneRef.current
    if (!onDone) return
    const durationMs = remainingMs ?? interstitialDuration * 1000
    interstitialCurrentDurationMsRef.current = durationMs
    interstitialStartMsRef.current = Date.now()
    if (remainingMs === undefined) setInterstitialCountdownKey((k) => k + 1)
    setIsInterstitialCounting(true)
    setIsInterstitialCountingPaused(false)
    interstitialTimerRef.current = setTimeout(() => {
      isInterstitialActiveRef.current = false
      interstitialTimerRef.current = null
      interstitialOnDoneRef.current = null
      interstitialRemainingMsRef.current = 0
      setIsInterstitialCounting(false)
      setIsInterstitialCountingPaused(false)
      setHasEverPlayed(true)
      setInterstitialSegment(null)
      onDone()
      playPlayback()
    }, durationMs)
  }

  const triggerInterstitial = (segment: Segment | null, onDone: () => void, startImmediately: boolean): void => {
    isInterstitialActiveRef.current = true
    pausePlayback()
    setInterstitialSegment(segment)
    interstitialOnDoneRef.current = onDone
    interstitialRemainingMsRef.current = 0
    setIsInterstitialCountingPaused(false)
    if (interstitialTimerRef.current !== null) {
      clearTimeout(interstitialTimerRef.current)
      interstitialTimerRef.current = null
      setIsInterstitialCounting(false)
    }
    if (startImmediately) startInterstitialCountdown()
  }

  const jumpToSegment = (segmentIndex: number, continuePlaying = false, withInterstitial = false): void => {
    const segment = segmentsRef.current[segmentIndex]
    if (!segment) return

    if (withInterstitial && interstitialDuration > 0 && segmentIndex !== activeSegmentIndex) {
      const wasPlaying = isPlayingRef.current || isInterstitialCounting
      setCurrentTime(segment.startSeconds)
      currentTimeRef.current = segment.startSeconds
      setSequenceIndex(segmentIndex)
      sequenceIndexRef.current = segmentIndex
      setActiveSegmentIndex(segmentIndex)
      triggerInterstitial(segment, () => { seekTo(segment.startSeconds) }, wasPlaying || continuePlaying)
      return
    }

    seekTo(segment.startSeconds)
    setSequenceIndex(segmentIndex)
    sequenceIndexRef.current = segmentIndex
    setActiveSegmentIndex(segmentIndex)
    if (continuePlaying) playPlayback()
  }

  const handleSegmentBoundary = (): void => {
    const segs = segmentsRef.current
    const idx = sequenceIndexRef.current
    const transition = getSegmentPlaybackTransition(segs, idx, { repeatSingleSegment })

    if (transition.action === 'pause') {
      pausePlayback()
      setIsSegmentMode(false)
      isSegmentModeRef.current = false
      setSequenceIndex(-1)
      sequenceIndexRef.current = -1
      seekTo(transition.nextTimeSeconds)
      onAllSegmentsDone?.()
      return
    }

    if (interstitialDuration > 0 && transition.action !== 'repeat-current') {
      setSequenceIndex(transition.nextIndex)
      sequenceIndexRef.current = transition.nextIndex
      setCurrentTime(transition.nextTimeSeconds)
      currentTimeRef.current = transition.nextTimeSeconds
      setActiveSegmentIndex(findActiveSegmentIndex(segs, transition.nextTimeSeconds))
      triggerInterstitial(segs[transition.nextIndex] ?? null, () => { seekTo(transition.nextTimeSeconds) }, true)
    } else {
      setSequenceIndex(transition.nextIndex)
      sequenceIndexRef.current = transition.nextIndex
      seekTo(transition.nextTimeSeconds)
      playPlayback()
    }
  }

  // ─── Player creation ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOnline || !selectedVideo) return

    // Pending flags: set synchronously before async init
    pendingAutoPlayRef.current = autoPlayOnLoad
    pendingAutoStartSegmentsRef.current = autoStartSegmentsOnLoad
    pendingStartFromLastSegmentRef.current = autoStartSegmentsFromEnd ?? false

    // Reset state
    setDuration(0)
    setCurrentTime(0)
    currentTimeRef.current = 0
    durationRef.current = 0
    setIsPlaying(false)
    isPlayingRef.current = false
    setIsSegmentMode(false)
    isSegmentModeRef.current = false
    setSequenceIndex(-1)
    sequenceIndexRef.current = -1
    setActiveSegmentIndex(-1)
    setVideoError(undefined)
    setPlaybackRate(1)
    setInterstitialSegment(null)
    setIsInterstitialCounting(false)
    setIsInterstitialCountingPaused(false)
    isInterstitialActiveRef.current = false
    interstitialOnDoneRef.current = null
    interstitialRemainingMsRef.current = 0
    stopPolling()

    let cancelled = false

    const initYouTube = async (): Promise<void> => {
      await ensureYouTubeApiLoaded()
      if (cancelled || !containerRef.current || !window.YT) return

      const ytPlayer = new window.YT.Player(containerRef.current, {
        height: '100%',
        width: '100%',
        videoId: selectedVideo.onlineVideoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (event) => {
            if (cancelled) return
            const d = event.target.getDuration()
            setDuration(d)
            durationRef.current = d
            onVideoLoaded?.(d)

            if (pendingAutoStartSegmentsRef.current) {
              pendingAutoStartSegmentsRef.current = false
              const shouldPlay = pendingAutoPlayRef.current
              pendingAutoPlayRef.current = false
              void startSegmentPlayback(shouldPlay)
            } else if (pendingAutoPlayRef.current) {
              pendingAutoPlayRef.current = false
              playPlayback()
            }
            startPolling()
          },
          onStateChange: (event) => {
            const YTState = window.YT?.PlayerState
            if (!YTState) return
            const state = event.data
            if (state === YTState.PLAYING) {
              setIsPlaying(true)
              isPlayingRef.current = true
              setHasEverPlayed(true)
            } else if (state === YTState.PAUSED) {
              setIsPlaying(false)
              isPlayingRef.current = false
            } else if (state === YTState.ENDED) {
              setIsPlaying(false)
              isPlayingRef.current = false
              setIsSegmentMode(false)
              isSegmentModeRef.current = false
              setSequenceIndex(-1)
              sequenceIndexRef.current = -1
              onVideoEnded?.()
            }
          },
          onError: (event) => {
            const codes: Record<number, string> = {
              2: 'Ungültige Video-ID.',
              5: 'Das Video kann in eingebetteten Playern nicht abgespielt werden.',
              100: 'Das Video wurde nicht gefunden oder ist privat.',
              101: 'Der Einbettung dieses Videos wurde vom Eigentümer nicht zugelassen.',
              150: 'Der Einbettung dieses Videos wurde vom Eigentümer nicht zugelassen.'
            }
            const msg = codes[event.data] ?? `YouTube-Fehler (Code ${event.data})`
            setVideoError(msg)
            onVideoError?.(msg, false)
          }
        }
      })

      if (cancelled) { ytPlayer.destroy(); return }

      playerRef.current = {
        play: () => ytPlayer.playVideo(),
        pause: () => ytPlayer.pauseVideo(),
        seekTo: (s) => ytPlayer.seekTo(s, true),
        getCurrentTime: () => ytPlayer.getCurrentTime(),
        setVolume: (v) => { ytPlayer.setVolume(v * 100); if (v === 0) ytPlayer.mute(); else ytPlayer.unMute() },
        destroy: () => ytPlayer.destroy()
      }
    }

    const initVimeo = async (): Promise<void> => {
      await ensureVimeoApiLoaded()
      if (cancelled || !containerRef.current || !window.Vimeo) return

      const vimeoPlayer = new window.Vimeo.Player(containerRef.current, {
        id: Number(selectedVideo.onlineVideoId),
        url: undefined
      })

      if (cancelled) { void vimeoPlayer.destroy(); return }

      playerRef.current = {
        play: () => { void vimeoPlayer.play() },
        pause: () => { void vimeoPlayer.pause() },
        seekTo: (s) => { void vimeoPlayer.setCurrentTime(s) },
        getCurrentTime: () => vimeoPlayer.getCurrentTime(),
        setVolume: (v) => { void vimeoPlayer.setVolume(v) },
        destroy: () => { void vimeoPlayer.destroy() }
      }

      vimeoPlayer.on('play', () => {
        if (cancelled) return
        setIsPlaying(true)
        isPlayingRef.current = true
        setHasEverPlayed(true)
      })
      vimeoPlayer.on('pause', () => {
        if (cancelled) return
        setIsPlaying(false)
        isPlayingRef.current = false
      })
      vimeoPlayer.on('ended', () => {
        if (cancelled) return
        setIsPlaying(false)
        isPlayingRef.current = false
        setIsSegmentMode(false)
        isSegmentModeRef.current = false
        setSequenceIndex(-1)
        sequenceIndexRef.current = -1
        onVideoEnded?.()
      })
      vimeoPlayer.on('error', (data) => {
        if (cancelled) return
        const msg = data.message ?? 'Unbekannter Vimeo-Fehler.'
        setVideoError(msg)
        onVideoError?.(msg, false)
      })

      const d = await vimeoPlayer.getDuration()
      if (cancelled) return
      setDuration(d)
      durationRef.current = d
      onVideoLoaded?.(d)

      if (pendingAutoStartSegmentsRef.current) {
        pendingAutoStartSegmentsRef.current = false
        const shouldPlay = pendingAutoPlayRef.current
        pendingAutoPlayRef.current = false
        void startSegmentPlayback(shouldPlay)
      } else if (pendingAutoPlayRef.current) {
        pendingAutoPlayRef.current = false
        playPlayback()
      }
      startPolling()
    }

    if (selectedVideo.onlinePlatform === 'youtube') {
      void initYouTube().catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'YouTube-Player konnte nicht initialisiert werden.'
        setVideoError(msg)
        onVideoError?.(msg, false)
      })
    } else if (selectedVideo.onlinePlatform === 'vimeo') {
      void initVimeo().catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Vimeo-Player konnte nicht initialisiert werden.'
        setVideoError(msg)
        onVideoError?.(msg, false)
      })
    }

    return () => {
      cancelled = true
      stopPolling()
      if (interstitialTimerRef.current !== null) {
        clearTimeout(interstitialTimerRef.current)
        interstitialTimerRef.current = null
      }
      playerRef.current?.destroy()
      playerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.path, isOnline])

  // Sync volume / mute to the player whenever it changes
  useEffect(() => {
    if (!isOnline || !playerRef.current) return
    const effectiveVolume = userMuted ? 0 : volume
    playerRef.current.setVolume(effectiveVolume)
  }, [isOnline, volume, userMuted])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (interstitialTimerRef.current !== null) clearTimeout(interstitialTimerRef.current)
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  // ─── Public API (mirrors useVideoPlayback return shape) ───────────────────

  const togglePlayPause = async (): Promise<void> => {
    if (!playerRef.current) return

    if (isInterstitialActiveRef.current) {
      if (interstitialTimerRef.current !== null) {
        const elapsed = Date.now() - interstitialStartMsRef.current
        interstitialRemainingMsRef.current = Math.max(0, interstitialCurrentDurationMsRef.current - elapsed)
        clearTimeout(interstitialTimerRef.current)
        interstitialTimerRef.current = null
        setIsInterstitialCounting(false)
        setIsInterstitialCountingPaused(true)
      } else {
        const remaining = interstitialRemainingMsRef.current
        interstitialRemainingMsRef.current = 0
        setIsInterstitialCountingPaused(false)
        startInterstitialCountdown(remaining > 0 ? remaining : undefined)
      }
      return
    }

    if (isPlayingRef.current) {
      pausePlayback()
    } else {
      playPlayback()
    }
  }

  const jumpToNextSegment = (): void => {
    const nextIndex = getNextSegmentIndex(segments, currentTimeRef.current)
    if (nextIndex >= 0) {
      jumpToSegment(nextIndex, false, true)
    } else {
      onAllSegmentsDone?.()
    }
  }

  const jumpToPreviousSegment = (): void => {
    const previousIndex = getPreviousSegmentIndex(segments, currentTimeRef.current)
    if (previousIndex >= 0) {
      jumpToSegment(previousIndex, false, true)
    } else {
      onFirstSegmentReached?.()
    }
  }

  const jumpBySeconds = (delta: number): void => {
    const next = Math.max(0, Math.min(durationRef.current, currentTimeRef.current + delta))
    seekTo(next)
  }

  const changePlaybackRate = (_rate: number): void => {
    // YouTube and Vimeo embedded players don't support programmatic rate changes via this API
  }

  const adjustPlaybackRate = (_direction: 'faster' | 'slower'): void => {
    // Not supported for online players
  }

  const exitSegmentMode = (): void => {
    const wasCountingDown = interstitialTimerRef.current !== null
    if (interstitialTimerRef.current !== null) {
      clearTimeout(interstitialTimerRef.current)
      interstitialTimerRef.current = null
    }
    isInterstitialActiveRef.current = false
    interstitialOnDoneRef.current = null
    setIsInterstitialCounting(false)
    setIsInterstitialCountingPaused(false)
    setInterstitialSegment(null)
    setIsSegmentMode(false)
    isSegmentModeRef.current = false
    setSequenceIndex(-1)
    sequenceIndexRef.current = -1
    if (wasCountingDown) playPlayback()
  }

  const startSegmentPlayback = async (forceAutoPlay = false): Promise<void> => {
    let startIndex: number
    if (pendingStartFromLastSegmentRef.current) {
      pendingStartFromLastSegmentRef.current = false
      startIndex = segments.length > 0 ? segments.length - 1 : 0
    } else {
      startIndex = repeatSingleSegment && activeSegmentIndex >= 0
        ? activeSegmentIndex
        : resolveSegmentSequenceStartIndex(segments, currentTimeRef.current)
    }
    if (startIndex < 0) return

    const wasPlaying = isPlayingRef.current || forceAutoPlay
    setIsSegmentMode(true)
    isSegmentModeRef.current = true
    setSequenceIndex(startIndex)
    sequenceIndexRef.current = startIndex

    if (interstitialDuration > 0) {
      const segment = segments[startIndex]
      setCurrentTime(segment?.startSeconds ?? 0)
      currentTimeRef.current = segment?.startSeconds ?? 0
      setActiveSegmentIndex(startIndex)
      triggerInterstitial(segment ?? null, () => { jumpToSegment(startIndex) }, wasPlaying)
    } else {
      jumpToSegment(startIndex)
      if (wasPlaying) playPlayback()
    }
  }

  const segmentMuted = isSegmentMode && sequenceIndex >= 0 && segments[sequenceIndex]?.audioTrack !== '1'

  return {
    duration,
    currentTime,
    isPlaying,
    isSegmentMode,
    sequenceIndex,
    activeSegmentIndex,
    playbackRate,
    volume,
    setVolume,
    userMuted,
    setUserMuted,
    segmentMuted,
    hasEverPlayed,
    interstitialSegment,
    isInterstitialCounting,
    isInterstitialCountingPaused,
    interstitialCountdownKey,
    videoError,
    streamUrl: undefined as string | undefined,
    keyframeTimes: [] as number[],
    seekTo,
    startScrub: (): void => { /* not supported */ },
    scrubTo: (_t: number): void => { /* not supported */ },
    endScrub: (): void => { /* not supported */ },
    getWasPlayingBeforeScrub: (): boolean => false,
    isScrubActive: (): boolean => false,
    pausePlayback,
    togglePlayPause,
    jumpToSegment,
    jumpToNextSegment,
    jumpToPreviousSegment,
    stepFrame: (_direction: 'forward' | 'backward'): void => { /* not supported */ },
    jumpBySeconds,
    jumpToNextKeyframe: (): void => { /* not supported */ },
    jumpToPreviousKeyframe: (): void => { /* not supported */ },
    changePlaybackRate,
    adjustPlaybackRate,
    exitSegmentMode,
    startSegmentPlayback,
    handleTimeUpdate: (): void => { /* handled via polling */ },
    handleSeeked: (): void => { /* not applicable */ },
    handleMetadataLoaded: (): void => { /* not applicable */ },
    handleCanPlay: (): void => { /* not applicable */ },
    handleVideoError: (): void => { /* not applicable */ },
    handleVideoEnded: (): void => { /* not applicable */ }
  }
}

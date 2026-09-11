import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { buildStreamUrl } from '../../../../common/streaming'
import {
  findActiveSegmentIndex,
  getNextSegmentIndex,
  getPreviousSegmentIndex,
  resolveSegmentSequenceStartIndex
} from '../../../../common/segmentUtils'
import { findNextKeyframeTime, findPreviousKeyframeTime } from '../../../../common/keyframeUtils'
import { getSegmentPlaybackTransition } from '../../../../common/segmentPlayback'
import type { Segment, VideoFileDescriptor } from '../../../../common/types'
import { getMediaErrorMessage, getMissingVideoTrackMessage, isPlayInterruptedByPause } from './playerUtils'
import { FRAME_STEP_SECONDS, PLAYBACK_RATES, PREVIOUS_SEGMENT_REPEAT_WINDOW_MS, SEEK_STEP_SECONDS } from './playerTypes'
import type { PreviousSegmentNavigationResult, Size } from './playerTypes'

interface UseVideoPlaybackOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  selectedVideo: VideoFileDescriptor | undefined
  segments: Segment[]
  repeatSingleSegment: boolean
  interstitialDuration: number
  autoPlayOnLoad: boolean
  autoStartSegmentsOnLoad: boolean
  playbackRecoveryInProgress: boolean
  setVideoIntrinsicSize: (size: Size | null) => void
  onCurrentTimeChange?: (timeSeconds: number) => void
  onVideoLoaded?: (durationSeconds: number) => void
  onVideoError?: (message: string, recoverable: boolean) => void
  autoStartSegmentsFromEnd?: boolean
  onAllSegmentsDone?: () => void
  onFirstSegmentReached?: () => void
  onVideoEnded?: () => void
  onSegmentModeChange?: (active: boolean) => void
}

export function useVideoPlayback({
  videoRef,
  selectedVideo,
  segments,
  repeatSingleSegment,
  interstitialDuration,
  autoPlayOnLoad,
  autoStartSegmentsOnLoad,
  autoStartSegmentsFromEnd,
  playbackRecoveryInProgress,
  setVideoIntrinsicSize,
  onCurrentTimeChange,
  onVideoLoaded,
  onVideoError,
  onAllSegmentsDone,
  onFirstSegmentReached,
  onVideoEnded,
  onSegmentModeChange
}: UseVideoPlaybackOptions) {
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSegmentMode, setIsSegmentMode] = useState(false)
  const [sequenceIndex, setSequenceIndex] = useState(-1)
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isReversing, setIsReversing] = useState(false)
  const [volume, setVolume] = useState(1)
  const [userMuted, setUserMuted] = useState(false)
  const [hasEverPlayed, setHasEverPlayed] = useState(false)
  const [interstitialSegment, setInterstitialSegment] = useState<Segment | null>(null)
  const [isInterstitialCounting, setIsInterstitialCounting] = useState(false)
  const [isInterstitialCountingPaused, setIsInterstitialCountingPaused] = useState(false)
  // Incremented on every fresh countdown start (not on resume). Used as React key on the
  // progress bar element to force remount → CSS animation restarts from the beginning.
  const [interstitialCountdownKey, setInterstitialCountdownKey] = useState(0)
  const [videoError, setVideoError] = useState<string | undefined>()
  const [streamUrl, setStreamUrl] = useState<string | undefined>()
  const [keyframeTimes, setKeyframeTimes] = useState<number[]>([])

  // Refs: mutable values that must not trigger re-renders
  const isInterstitialActiveRef = useRef(false)
  const interstitialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Callback to run when the interstitial countdown finishes.
  // Stored here so startInterstitialCountdown() can be called independently from triggerInterstitial().
  const interstitialOnDoneRef = useRef<(() => void) | null>(null)
  // Track countdown timing so we can pause/resume mid-countdown
  const interstitialStartMsRef = useRef<number>(0)
  const interstitialCurrentDurationMsRef = useRef<number>(0)
  const interstitialRemainingMsRef = useRef<number>(0)
  const pendingAutoPlayRef = useRef(false)
  const pendingAutoStartSegmentsRef = useRef(false)
  const pendingStartFromLastSegmentRef = useRef(false)
  const streamStartSecondsRef = useRef(0)
  const isStreamSeekRef = useRef(false)
  // Scrub state: pause-on-drag + seeked-event-chain so there is never more
  // than one seek request in the browser's queue at a time.
  const isScrubRef = useRef(false)
  const scrubWasPlayingRef = useRef(false)
  const scrubPendingTimeRef = useRef<number | null>(null)
  const scrubIsSeekingRef = useRef(false)
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reverseStartedAtRef = useRef(0)
  const reverseStartedTimeRef = useRef(0)
  const reverseTargetTimeRef = useRef(0)
  const reversePlaybackRateRef = useRef(1)
  const isReversingRef = useRef(false)
  const reverseRunIdRef = useRef(0)
  const isPlayingRef = useRef(false)
  const playbackIntentRef = useRef<boolean | null>(null)
  const playbackCommandRef = useRef(0)
  const previousSegmentRestartRef = useRef<{ segmentIndex: number; expiresAt: number } | null>(null)

  const setPlaybackIsPlaying = (value: boolean): void => {
    isPlayingRef.current = value
    setIsPlaying(value)
  }

  const segmentMuted = isSegmentMode && sequenceIndex >= 0 && segments[sequenceIndex]?.audioTrack !== '1'

  // Keep the video element in sync with volume/mute state
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.muted = userMuted || segmentMuted || isReversing
    videoRef.current.volume = volume
  }, [volume, userMuted, segmentMuted, isReversing])

  // Full state reset when switching to a different video file
  // useLayoutEffect: fires synchronously after DOM commit, before any browser media events
  // (canplay, loadedmetadata, etc.). This guarantees pendingAutoPlayRef etc. are set BEFORE
  // handleCanPlay is called, even for fast local files where canplay fires almost immediately.
  useLayoutEffect(() => {
    pendingAutoPlayRef.current = autoPlayOnLoad
    pendingAutoStartSegmentsRef.current = autoStartSegmentsOnLoad
    pendingStartFromLastSegmentRef.current = autoStartSegmentsFromEnd ?? false
  }, [selectedVideo?.path])

  useEffect(() => {
    setDuration(0)
    setCurrentTime(0)
    setPlaybackIsPlaying(false)
    playbackIntentRef.current = null
    setIsSegmentMode(false)
    setSequenceIndex(-1)
    setActiveSegmentIndex(-1)
    setVideoError(undefined)
    setPlaybackRate(1)
    reversePlaybackRateRef.current = 1
    setIsReversing(false)
    isReversingRef.current = false
    reverseRunIdRef.current += 1
    if (reverseTimerRef.current !== null) {
      clearTimeout(reverseTimerRef.current)
      reverseTimerRef.current = null
    }
    setInterstitialSegment(null)
    setIsInterstitialCounting(false)
    setIsInterstitialCountingPaused(false)
    isInterstitialActiveRef.current = false
    interstitialOnDoneRef.current = null
    interstitialRemainingMsRef.current = 0
    if (interstitialTimerRef.current !== null) {
      clearTimeout(interstitialTimerRef.current)
      interstitialTimerRef.current = null
    }
    streamStartSecondsRef.current = 0
    isStreamSeekRef.current = false
    setStreamUrl(undefined)
    setKeyframeTimes([])
  }, [selectedVideo?.path])

  // Clean up any pending interstitial timer on unmount
  useEffect(() => {
    return () => {
      if (interstitialTimerRef.current !== null) clearTimeout(interstitialTimerRef.current)
      if (reverseTimerRef.current !== null) clearTimeout(reverseTimerRef.current)
    }
  }, [])

  // Load keyframe data for all videos
  useEffect(() => {
    setKeyframeTimes([])
    if (!selectedVideo?.path) return
    void window.desktopApi.getKeyframeTimes(selectedVideo.path)
      .then((times) => setKeyframeTimes(times))
      .catch(() => { /* keyframe data unavailable */ })
  }, [selectedVideo?.path])

  // When the same file switches from direct → stream mode, schedule auto-play
  useEffect(() => {
    if (selectedVideo?.playbackMode === 'stream') {
      streamStartSecondsRef.current = 0
      isStreamSeekRef.current = false
      setStreamUrl(undefined)
      pendingAutoPlayRef.current = true
    }
  }, [selectedVideo?.fileUrl])

  // Keep activeSegmentIndex in sync with currentTime and segment list
  useEffect(() => {
    if (segments.length === 0) {
      setIsSegmentMode(false)
      setSequenceIndex(-1)
      setActiveSegmentIndex(-1)
      return
    }
    setActiveSegmentIndex(findActiveSegmentIndex(segments, currentTime))
  }, [segments, currentTime])

  // Clear video error when a playback recovery begins
  useEffect(() => {
    if (playbackRecoveryInProgress) setVideoError(undefined)
  }, [playbackRecoveryInProgress])

  // Notify parent when segment mode changes
  useEffect(() => {
    onSegmentModeChange?.(isSegmentMode)
  }, [isSegmentMode])

  // --- Stream-aware time helpers (internal) ---

  const getEffectiveCurrentTime = (): number => {
    if (!videoRef.current || !selectedVideo) return 0
    if (isReversingRef.current) return reverseTargetTimeRef.current
    if (selectedVideo.playbackMode === 'stream') {
      if (isStreamSeekRef.current) return streamStartSecondsRef.current
      return streamStartSecondsRef.current + videoRef.current.currentTime
    }
    return videoRef.current.currentTime
  }

  const getEffectiveMaxDuration = (): number => {
    if (!selectedVideo) return 0
    if (selectedVideo.playbackMode === 'stream') return selectedVideo.durationSeconds ?? duration
    return Number.isFinite(videoRef.current?.duration)
      ? (videoRef.current?.duration ?? duration)
      : duration
  }

  // --- Core playback ---

  const stopReversePlayback = (): void => {
    reverseRunIdRef.current += 1
    if (reverseTimerRef.current !== null) {
      clearTimeout(reverseTimerRef.current)
      reverseTimerRef.current = null
    }
    isReversingRef.current = false
    setIsReversing(false)
  }

  const pausePlayback = (): void => {
    playbackCommandRef.current += 1
    playbackIntentRef.current = false
    stopReversePlayback()
    videoRef.current?.pause()
    setPlaybackIsPlaying(false)
  }

  const playPlayback = async (): Promise<void> => {
    if (!videoRef.current) return
    const commandId = ++playbackCommandRef.current
    playbackIntentRef.current = true
    stopReversePlayback()
    try {
      await videoRef.current.play()
      if (commandId !== playbackCommandRef.current) {
        if (playbackIntentRef.current !== true || isReversingRef.current) videoRef.current.pause()
        return
      }
      setVideoError(undefined)
      setPlaybackIsPlaying(true)
      setHasEverPlayed(true)
    } catch (error) {
      if (commandId !== playbackCommandRef.current) return
      playbackIntentRef.current = false
      const nextMessage = error instanceof Error
        ? error.message
        : getMediaErrorMessage(videoRef.current, selectedVideo)
      setVideoError(nextMessage)
      onVideoError?.(nextMessage, false)
      setPlaybackIsPlaying(false)
    }
  }

  /**
   * Called once when the user first moves the timeline slider.
   * Pauses playback so the decoder only has to handle seeks, not decode+render
   * a playing stream at the same time.
   */
  const startScrub = (): void => {
    if (isScrubRef.current) return
    isScrubRef.current = true
    scrubIsSeekingRef.current = false
    scrubPendingTimeRef.current = null
    scrubWasPlayingRef.current = isPlayingRef.current
    if (isPlayingRef.current) pausePlayback()
  }

  /**
   * Seek the video to a new position while dragging.
   *
   * Uses a seeked-event-chain instead of a timer: if the previous seek is
   * still in progress, the new time is stored as "pending" and dispatched
   * inside handleSeeked once the decoder is free. This guarantees at most
   * ONE seek in the browser's native seek queue at any moment, which
   * eliminates queue overflow and the resulting CPU spike + stale-frame lag.
   */
  const scrubTo = (nextTimeSeconds: number): void => {
    if (!videoRef.current
      || selectedVideo?.playbackMode === 'stream'
      || isInterstitialActiveRef.current) return

    if (scrubIsSeekingRef.current) {
      // A seek is in flight — just update the pending target; the seeked
      // handler will pick it up when the decoder becomes free.
      scrubPendingTimeRef.current = nextTimeSeconds
      return
    }

    scrubIsSeekingRef.current = true
    scrubPendingTimeRef.current = null
    videoRef.current.currentTime = nextTimeSeconds
  }

  /** Whether video was playing before the current scrub started. */
  const getWasPlayingBeforeScrub = (): boolean => scrubWasPlayingRef.current

  /** Clear the scrub flag. Called by VideoWorkspace as part of onSeek (pointerUp). */
  const endScrub = (): void => {
    isScrubRef.current = false
    scrubIsSeekingRef.current = false
    scrubPendingTimeRef.current = null
  }

  const seekTo = (nextTimeSeconds: number): void => {
    previousSegmentRestartRef.current = null
    if (!videoRef.current) return
    if (selectedVideo?.playbackMode === 'stream') {
      const wasPlaying = isPlayingRef.current
      isStreamSeekRef.current = true
      streamStartSecondsRef.current = nextTimeSeconds
      setStreamUrl(buildStreamUrl(selectedVideo.path, nextTimeSeconds))
      pendingAutoPlayRef.current = wasPlaying
      setCurrentTime(nextTimeSeconds)
      setActiveSegmentIndex(findActiveSegmentIndex(segments, nextTimeSeconds))
      return
    }
    if (isReversingRef.current) reverseTargetTimeRef.current = nextTimeSeconds
    videoRef.current.currentTime = nextTimeSeconds
    setCurrentTime(nextTimeSeconds)
    setActiveSegmentIndex(findActiveSegmentIndex(segments, nextTimeSeconds))
  }

  const togglePlayPause = async (): Promise<void> => {
    if (!videoRef.current) return
    if (isInterstitialActiveRef.current) {
      if (interstitialTimerRef.current !== null) {
        // Countdown is running — user clicked "Pause": freeze timer, keep overlay visible
        const elapsed = Date.now() - interstitialStartMsRef.current
        interstitialRemainingMsRef.current = Math.max(0, interstitialCurrentDurationMsRef.current - elapsed)
        clearTimeout(interstitialTimerRef.current)
        interstitialTimerRef.current = null
        setIsInterstitialCounting(false)
        setIsInterstitialCountingPaused(true)
      } else {
        // Image is showing, no countdown yet (or paused mid-count) — start/resume countdown
        const remaining = interstitialRemainingMsRef.current
        interstitialRemainingMsRef.current = 0
        setIsInterstitialCountingPaused(false)
        startInterstitialCountdown(remaining > 0 ? remaining : undefined)
      }
      return
    }
    if (isReversingRef.current) {
      if (isPlayingRef.current) pauseReversePlayback()
      else resumeReversePlayback()
      return
    }
    if (isPlayingRef.current) pausePlayback()
    else await playPlayback()
  }

  // --- Segment navigation ---

  /**
   * Starts the interstitial countdown timer.
   * The image must already be visible (triggerInterstitial called with startCountdownImmediately=false).
   * Called by togglePlayPause when the user presses Play while the image is showing.
   * Is a no-op if the countdown is already running.
   */
  const startInterstitialCountdown = (remainingMs?: number): void => {
    if (interstitialTimerRef.current !== null) return // already counting
    const onDone = interstitialOnDoneRef.current
    if (!onDone) return
    const durationMs = remainingMs ?? interstitialDuration * 1000
    interstitialCurrentDurationMsRef.current = durationMs
    interstitialStartMsRef.current = Date.now()
    // Only increment the key when starting fresh (not resuming a paused countdown).
    // The key change forces React to remount the progress bar → animation restarts.
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
      // Countdown always ends with playback — either the video was already playing when
      // the interstitial appeared, or the user explicitly pressed Play to start the countdown.
      void playPlayback()
    }, durationMs)
  }

  /**
   * Single entry point for all interstitial displays.
   *
   * - Always: pauses playback, shows the interstitial image, stores `onDone`.
   * - startCountdownImmediately=true (video was playing): also starts the countdown timer right away.
   * - startCountdownImmediately=false (video was paused): only shows the image;
   *   the timer starts when the user presses Play (via startInterstitialCountdown).
   *
   * All callers MUST go through here — never duplicate the timer setup.
   */
  const triggerInterstitial = (segment: Segment | null, onDone: () => void, startCountdownImmediately: boolean): void => {
    isInterstitialActiveRef.current = true
    // Always pause while the interstitial overlay is visible — the overlay covers the video,
    // and the video must not keep running in the background.
    // When startCountdownImmediately=true (video was playing), the countdown fires and
    // startInterstitialCountdown() calls playPlayback() afterwards so playback resumes.
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
    if (startCountdownImmediately) startInterstitialCountdown()
  }

  const jumpToSegment = (segmentIndex: number, continuePlaying = false, withInterstitial = false): void => {
    const segment = segments[segmentIndex]
    if (!segment) return

    // Skip the interstitial when navigating to the already-active segment (e.g. repeated
    // timeline clicks within the same segment, or "Voriges Segment" at the first segment).
    if (withInterstitial && interstitialDuration > 0 && segmentIndex !== activeSegmentIndex) {
      // isPlaying is false during an active interstitial (video is paused while overlay is shown),
      // so also check isInterstitialCounting to preserve "effectively playing" state.
      const wasPlaying = isPlayingRef.current || isInterstitialCounting
      // Update the timeline marker immediately via state, but do NOT seek video.currentTime yet
      // so the video frame stays frozen while the interstitial overlay is visible.
      setCurrentTime(segment.startSeconds)
      setSequenceIndex(segmentIndex)
      setActiveSegmentIndex(segmentIndex)
      // Only start the countdown immediately when the video was actually playing.
      // When paused: just show the image; countdown starts on the next Play press.
      // playPlayback() is called by startInterstitialCountdown after onDone, never here.
      triggerInterstitial(segment, () => {
        seekTo(segment.startSeconds)
      }, wasPlaying || continuePlaying)
      return
    }

    seekTo(segment.startSeconds)
    setActiveSegmentIndex(segmentIndex)
    setSequenceIndex(segmentIndex)
    if (continuePlaying) void playPlayback()
  }

  const jumpToNextSegment = (): void => {
    const nextIndex = getNextSegmentIndex(segments, currentTime)
    if (nextIndex >= 0) {
      jumpToSegment(nextIndex, false, true)
    } else {
      onAllSegmentsDone?.()
    }
  }

  const jumpToPreviousSegment = (): PreviousSegmentNavigationResult => {
    const activeIndex = findActiveSegmentIndex(segments, getEffectiveCurrentTime())
    if (activeIndex >= 0) {
      const previousRestart = previousSegmentRestartRef.current
      if (previousRestart?.segmentIndex === activeIndex && Date.now() <= previousRestart.expiresAt) {
        previousSegmentRestartRef.current = null
        if (activeIndex > 0) {
          jumpToSegment(activeIndex - 1, false, true)
          return 'previous-segment'
        }
        onFirstSegmentReached?.()
        return 'sequence-start'
      }

      jumpToSegment(activeIndex)
      previousSegmentRestartRef.current = {
        segmentIndex: activeIndex,
        expiresAt: Date.now() + PREVIOUS_SEGMENT_REPEAT_WINDOW_MS
      }
      return 'segment-start'
    }

    previousSegmentRestartRef.current = null
    const previousIndex = getPreviousSegmentIndex(segments, getEffectiveCurrentTime())
    if (previousIndex >= 0) {
      jumpToSegment(previousIndex, false, true)
      previousSegmentRestartRef.current = {
        segmentIndex: previousIndex,
        expiresAt: Date.now() + PREVIOUS_SEGMENT_REPEAT_WINDOW_MS
      }
      return 'previous-segment'
    } else {
      onFirstSegmentReached?.()
      return 'sequence-start'
    }
  }

  // --- Frame and time navigation ---

  const stepFrame = (direction: 'forward' | 'backward'): void => {
    if (!videoRef.current || !selectedVideo) return
    const resumeForwardPlayback = !isReversingRef.current && isPlayingRef.current
    // A frame seek needs the native media element paused briefly, but the player remains
    // logically "playing". Avoid toggling React's isPlaying state, otherwise the Play button
    // visibly flashes to Pause and back for every keyboard step.
    if (resumeForwardPlayback) videoRef.current.pause()
    const delta = direction === 'forward' ? FRAME_STEP_SECONDS : -FRAME_STEP_SECONDS
    seekTo(Math.max(0, Math.min(getEffectiveMaxDuration(), getEffectiveCurrentTime() + delta)))
    if (resumeForwardPlayback) {
      void videoRef.current.play().catch((error: unknown) => {
        if (isPlayInterruptedByPause(error)) return
        const nextMessage = error instanceof Error
          ? error.message
          : getMediaErrorMessage(videoRef.current!, selectedVideo)
        setVideoError(nextMessage)
        onVideoError?.(nextMessage, false)
        setPlaybackIsPlaying(false)
      })
    }
  }

  const jumpBySeconds = (delta: number): void => {
    if (!videoRef.current || !selectedVideo) return
    seekTo(Math.max(0, Math.min(getEffectiveMaxDuration(), getEffectiveCurrentTime() + delta)))
  }

  const jumpToNextKeyframe = (): void => {
    const next = findNextKeyframeTime(keyframeTimes, getEffectiveCurrentTime())
    if (next !== undefined) seekTo(Math.min(next, getEffectiveMaxDuration()))
  }

  const jumpToPreviousKeyframe = (): void => {
    const prev = findPreviousKeyframeTime(keyframeTimes, getEffectiveCurrentTime())
    if (prev !== undefined) seekTo(Math.max(0, prev))
  }

  // --- Playback rate ---

  const getReversePlaybackBoundary = (): number => (
    isSegmentMode && sequenceIndex >= 0
      ? (segments[sequenceIndex]?.startSeconds ?? 0)
      : 0
  )

  const changePlaybackRate = (rate: number): void => {
    if (!videoRef.current) return
    if (isReversingRef.current) {
      const elapsedSeconds = Math.max(0, performance.now() - reverseStartedAtRef.current) / 1000
      const currentTarget = Math.max(
        getReversePlaybackBoundary(),
        reverseStartedTimeRef.current - elapsedSeconds * reversePlaybackRateRef.current
      )
      reverseStartedTimeRef.current = currentTarget
      reverseStartedAtRef.current = performance.now()
      reverseTargetTimeRef.current = currentTarget
    }
    videoRef.current.playbackRate = rate
    setPlaybackRate(rate)
    reversePlaybackRateRef.current = rate
  }

  const adjustPlaybackRate = (direction: 'faster' | 'slower'): void => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate)
    if (direction === 'faster' && currentIndex < PLAYBACK_RATES.length - 1) {
      changePlaybackRate(PLAYBACK_RATES[currentIndex + 1])
    } else if (direction === 'slower' && currentIndex > 0) {
      changePlaybackRate(PLAYBACK_RATES[currentIndex - 1])
    }
  }

  const updateReversePlayback = (runId: number): void => {
    if (
      !videoRef.current ||
      !isReversingRef.current ||
      !isPlayingRef.current ||
      runId !== reverseRunIdRef.current
    ) return
    const elapsedSeconds = Math.max(0, performance.now() - reverseStartedAtRef.current) / 1000
    const segmentStart = getReversePlaybackBoundary()
    const nextTime = Math.max(segmentStart, reverseStartedTimeRef.current - elapsedSeconds * reversePlaybackRateRef.current)
    reverseTargetTimeRef.current = nextTime
    if (!videoRef.current.seeking) videoRef.current.currentTime = nextTime
    setCurrentTime(nextTime)
    onCurrentTimeChange?.(nextTime)
    setActiveSegmentIndex(findActiveSegmentIndex(segments, nextTime))

    if (nextTime === segmentStart) {
      playbackIntentRef.current = false
      setPlaybackIsPlaying(false)
      stopReversePlayback()
      return
    }

    reverseTimerRef.current = setTimeout(() => updateReversePlayback(runId), 16)
  }

  const pauseReversePlayback = (): void => {
    reverseRunIdRef.current += 1
    playbackCommandRef.current += 1
    playbackIntentRef.current = false
    if (reverseTimerRef.current !== null) {
      clearTimeout(reverseTimerRef.current)
      reverseTimerRef.current = null
    }
    videoRef.current?.pause()
    setPlaybackIsPlaying(false)
  }

  const resumeReversePlayback = (): void => {
    const startTime = getEffectiveCurrentTime()
    if (!videoRef.current || startTime <= 0) return
    playbackCommandRef.current += 1
    playbackIntentRef.current = true
    videoRef.current.pause()
    isReversingRef.current = true
    setIsReversing(true)
    setPlaybackIsPlaying(true)
    setHasEverPlayed(true)
    reverseStartedAtRef.current = performance.now()
    reverseStartedTimeRef.current = startTime
    reverseTargetTimeRef.current = startTime
    const runId = ++reverseRunIdRef.current
    updateReversePlayback(runId)
  }

  const toggleReversePlayback = (): string | null => {
    if (!videoRef.current) return 'Kein Video geladen.'
    if (isReversingRef.current) {
      const wasPlaying = isPlayingRef.current
      playbackCommandRef.current += 1
      stopReversePlayback()
      if (wasPlaying) void playPlayback()
      else {
        playbackIntentRef.current = false
        videoRef.current.pause()
        setPlaybackIsPlaying(false)
      }
      return null
    }
    if (selectedVideo?.playbackMode === 'stream') {
      return 'Rückwärtswiedergabe ist im Streaming-Modus nicht verfügbar.'
    }
    const startTime = getEffectiveCurrentTime()
    if (startTime <= 0) return 'Das Video befindet sich bereits am Anfang.'

    playbackCommandRef.current += 1
    reverseRunIdRef.current += 1
    reverseTargetTimeRef.current = startTime
    isReversingRef.current = true
    setIsReversing(true)
    if (isPlayingRef.current) resumeReversePlayback()
    else {
      playbackIntentRef.current = false
      videoRef.current.pause()
      setPlaybackIsPlaying(false)
    }
    return null
  }

  // --- Segment mode ---

  const exitSegmentMode = (): void => {
    // If the interstitial countdown was active, the video was paused by triggerInterstitial
    // but was "effectively playing" (countdown would have called playPlayback on completion).
    // We need to resume playback now that we're dismissing the interstitial early.
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
    setSequenceIndex(-1)
    // Preserve play state: if the countdown was running the video was effectively playing.
    // Resume it now since the timer that would have called playPlayback() was just cleared.
    if (wasCountingDown) void playPlayback()
  }

  const startSegmentPlayback = async (forceAutoPlay = false): Promise<void> => {
    let startIndex: number
    let mustJumpToSegmentStart = true
    if (pendingStartFromLastSegmentRef.current) {
      pendingStartFromLastSegmentRef.current = false
      startIndex = segments.length > 0 ? segments.length - 1 : 0
    } else {
      const effectiveCurrentTime = getEffectiveCurrentTime()
      const currentSegmentIndex = findActiveSegmentIndex(segments, effectiveCurrentTime)
      startIndex = repeatSingleSegment && activeSegmentIndex >= 0
        ? activeSegmentIndex
        : resolveSegmentSequenceStartIndex(segments, effectiveCurrentTime)
      mustJumpToSegmentStart = currentSegmentIndex !== startIndex
    }

    if (startIndex < 0) return

    // Respect current play state — this button is a toggle, not a play button
    const wasPlaying = isPlayingRef.current || forceAutoPlay
    setIsSegmentMode(true)
    setSequenceIndex(startIndex)

    // Enabling segment mode while already inside its selected segment is only a mode
    // change. Keep the exact analysis frame instead of restarting that segment.
    if (!mustJumpToSegmentStart) {
      if (forceAutoPlay && !isPlayingRef.current) await playPlayback()
      return
    }

    if (interstitialDuration > 0) {
      const segment = segments[startIndex]
      // Update timeline position immediately so the UI shows the target segment
      setCurrentTime(segment?.startSeconds ?? 0)
      setActiveSegmentIndex(startIndex)
      // Show interstitial image right away. If video was playing, also start the countdown
      // immediately. If paused, countdown waits for the user to press Play.
      triggerInterstitial(segment ?? null, () => {
        jumpToSegment(startIndex)
      }, wasPlaying)
    } else {
      jumpToSegment(startIndex)
      if (wasPlaying) await playPlayback()
    }
  }

  // --- Video element event handlers ---

  /**
   * Fired by the video element after each seek completes.
   * During a scrub: if a newer target was queued while the decoder was busy,
   * dispatch it now. This keeps the seek chain alive with at most one request
   * in-flight at any time.
   */
  const handleSeeked = (): void => {
    if (!isScrubRef.current) return
    const pending = scrubPendingTimeRef.current
    if (pending !== null && videoRef.current) {
      scrubPendingTimeRef.current = null
      videoRef.current.currentTime = pending
      // scrubIsSeekingRef stays true — the next seeked will handle remaining pending
    } else {
      scrubIsSeekingRef.current = false
    }
  }

  const handleTimeUpdate = (): void => {
    if (!videoRef.current) return
    // During a stream seek the old stream still fires timeupdate — ignore stale events
    if (isStreamSeekRef.current) return
    // While scrubbing: skip React state updates — the visual position comes
    // from dragRatio in SegmentTimeline; no re-renders needed here.
    if (isScrubRef.current) return
    // While the interstitial is active, the timeline position has already been set to the
    // target segment start by jumpToSegment. The video has NOT been seeked yet — that
    // happens in onDone after the interstitial. Ignore timeupdate events so that the
    // stale video.currentTime cannot overwrite the displayed marker position.
    if (isInterstitialActiveRef.current) return

    const rawTime = videoRef.current.currentTime
    const nextCurrentTime = selectedVideo?.playbackMode === 'stream'
      ? streamStartSecondsRef.current + rawTime
      : rawTime

    setCurrentTime(nextCurrentTime)
    onCurrentTimeChange?.(nextCurrentTime)
    setActiveSegmentIndex(findActiveSegmentIndex(segments, nextCurrentTime))

    if (!isSegmentMode || sequenceIndex < 0 || isInterstitialActiveRef.current) return

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
      const transition = getSegmentPlaybackTransition(segments, sequenceIndex, { repeatSingleSegment })

      if (transition.action === 'pause') {
        const wasPlaying = isPlayingRef.current
        pausePlayback()
        setIsSegmentMode(false)
        setSequenceIndex(-1)
        seekTo(transition.nextTimeSeconds)
onAllSegmentsDone?.()
        return
      }

      if (interstitialDuration > 0 && transition.action !== 'repeat-current') {
        // Update timeline immediately so it jumps to the next segment BEFORE the interstitial
        setSequenceIndex(transition.nextIndex)
        setCurrentTime(transition.nextTimeSeconds)
        setActiveSegmentIndex(findActiveSegmentIndex(segments, transition.nextTimeSeconds))
        // handleTimeUpdate only fires while playing → always start countdown immediately
        triggerInterstitial(segments[transition.nextIndex] ?? null, () => {
          seekTo(transition.nextTimeSeconds)
        }, true)
      } else {
        setSequenceIndex(transition.nextIndex)
        seekTo(transition.nextTimeSeconds)
        void playPlayback()
      }
    }
  }

  const handleMetadataLoaded = (): void => {
    if (!videoRef.current) return
    const rawDuration = videoRef.current.duration
    // In stream mode the partial stream has a misleading duration — always use the ffprobe value
    const nextDuration = selectedVideo?.playbackMode === 'stream'
      ? (selectedVideo.durationSeconds ?? 0)
      : (Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : (selectedVideo?.durationSeconds ?? 0))

    const wasStreamSeek = isStreamSeekRef.current
    isStreamSeekRef.current = false
    setVideoError(undefined)
    setDuration(nextDuration)

    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      const nextMessage = getMissingVideoTrackMessage(selectedVideo)
      videoRef.current.pause()
      setVideoError(nextMessage)
      // Recoverable: a missing video track on direct mode can often be fixed by streaming via ffmpeg
      onVideoError?.(nextMessage, true)
      return
    }

    setVideoIntrinsicSize({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight })

    if (!wasStreamSeek) onVideoLoaded?.(nextDuration)
  }

  const handleCanPlay = (): void => {
    if (pendingAutoStartSegmentsRef.current) {
      pendingAutoStartSegmentsRef.current = false
      const shouldPlay = pendingAutoPlayRef.current
      pendingAutoPlayRef.current = false
      void startSegmentPlayback(shouldPlay)
      return
    }
    if (!pendingAutoPlayRef.current) return
    pendingAutoPlayRef.current = false
    void playPlayback()
  }

  const handleVideoError = (): void => {
    if (!videoRef.current) return
    // Read error state before calling pause() — pause() can clear video.error in Chromium
    const errorCode = videoRef.current.error?.code
    const nextMessage = getMediaErrorMessage(videoRef.current, selectedVideo)
    const recoverable =
      errorCode === MediaError.MEDIA_ERR_DECODE || errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
    videoRef.current.pause()
    playbackIntentRef.current = false
    setVideoError(nextMessage)
    setPlaybackIsPlaying(false)
    setIsSegmentMode(false)
    setSequenceIndex(-1)
    onVideoError?.(nextMessage, recoverable)
  }

  const handleVideoEnded = (): void => {
    playbackIntentRef.current = false
    setPlaybackIsPlaying(false)
    setIsSegmentMode(false)
    setSequenceIndex(-1)
    onVideoEnded?.()
  }

  const handleVideoPlay = (): void => {
    if (isReversingRef.current || playbackIntentRef.current === false) {
      videoRef.current?.pause()
      if (!isReversingRef.current) setPlaybackIsPlaying(false)
      return
    }
    setPlaybackIsPlaying(true)
  }

  const handleVideoPause = (): void => {
    if (isReversingRef.current) return
    // Internal frame stepping and direction changes briefly pause the native element.
    // A current explicit play intent must win over such delayed pause events.
    if (playbackIntentRef.current === true) return
    playbackIntentRef.current = false
    setPlaybackIsPlaying(false)
  }

  return {
    duration,
    currentTime,
    isPlaying,
    isSegmentMode,
    sequenceIndex,
    activeSegmentIndex,
    playbackRate,
    isReversing,
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
    streamUrl,
    keyframeTimes,
    seekTo,
    startScrub,
    scrubTo,
    endScrub,
    getWasPlayingBeforeScrub,
    isScrubActive: () => isScrubRef.current,
    pausePlayback,
    togglePlayPause,
    jumpToSegment,
    jumpToNextSegment,
    jumpToPreviousSegment,
    stepFrame,
    jumpBySeconds,
    jumpToNextKeyframe,
    jumpToPreviousKeyframe,
    changePlaybackRate,
    adjustPlaybackRate,
    toggleReversePlayback,
    exitSegmentMode,
    startSegmentPlayback,
    handleTimeUpdate,
    handleSeeked,
    handleMetadataLoaded,
    handleCanPlay,
    handleVideoError,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnded
  }
}

import { useRef, useState } from 'react'
import { formatClockTime } from '../../../../common/timeUtils'
import type { Segment, TimelinePreviewFrame } from '../../../../common/types'
import type { TimelinePreviewStatus } from './useTimelinePreview'

interface SegmentTimelineProps {
  duration: number
  currentTime: number
  activeSegmentIndex: number
  segments: Segment[]
  onSeek: (nextTimeSeconds: number) => void
  /** Called once on the first pointer move — signals that a drag scrub has started. */
  onScrubStart?: () => void
  /** Called on every pointer move (rAF-throttled by the consumer) for live frame updates. */
  onScrub?: (nextTimeSeconds: number) => void
  previewFrame?: TimelinePreviewFrame | null
  previewStatus?: TimelinePreviewStatus
  onPreviewTimeChange?: (seconds: number | null) => void
}

export function SegmentTimeline({ duration, currentTime, activeSegmentIndex, segments, onSeek, onScrubStart, onScrub, previewFrame, previewStatus, onPreviewTimeChange }: SegmentTimelineProps) {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const isDraggingRef = useRef(false)
  const hasDraggedRef = useRef(false)
  const suppressNextClickRef = useRef(false)

  const getRatio = (clientX: number, el: Element): number => {
    const bounds = el.getBoundingClientRect()
    return Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (duration <= 0) return
    // setPointerCapture delivers all subsequent pointer events to this element even
    // when the cursor leaves it, making drag reliable without document-level listeners.
    event.currentTarget.setPointerCapture(event.pointerId)
    isDraggingRef.current = true
    hasDraggedRef.current = false
    const ratio = getRatio(event.clientX, event.currentTarget)
    setDragRatio(ratio)
    onPreviewTimeChange?.(duration * ratio)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!isDraggingRef.current || duration <= 0) return
    if (!hasDraggedRef.current) {
      // First actual movement — tell the parent to pause for scrubbing
      onScrubStart?.()
    }
    hasDraggedRef.current = true
    const ratio = getRatio(event.clientX, event.currentTarget)
    setDragRatio(ratio)
    onPreviewTimeChange?.(duration * ratio)
    onScrub?.(duration * ratio)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    // Always handle the seek here (for both simple clicks and drags) so that
    // setDragRatio(null) and the onSeek state updates are batched in the same
    // React event. This ensures the timeline needle is already at the target
    // segment position when the interstitial overlay renders.
    suppressNextClickRef.current = true
    setDragRatio(null)
    if (duration > 0) onSeek(duration * getRatio(event.clientX, event.currentTarget))
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return }
    if (duration <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    onSeek(duration * Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1))
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (duration <= 0 || isDraggingRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1)
    setHoverRatio(ratio)
    onPreviewTimeChange?.(duration * ratio)
  }

  const handleMouseLeave = (): void => {
    if (!isDraggingRef.current) {
      setHoverRatio(null)
      onPreviewTimeChange?.(null)
    }
  }

  // During drag: needle and progress bar follow the drag position for immediate feedback.
  // Otherwise: use the real playback position.
  const progressRatio = dragRatio !== null ? dragRatio : (duration > 0 ? currentTime / duration : 0)
  const progressPercent = progressRatio * 100
  const indicatorRatio = dragRatio ?? hoverRatio

  return (
    <button
      className={`timeline${dragRatio !== null ? ' timeline--dragging' : ''}`}
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label="Zeitleiste"
    >
      <span className="timeline__track" />
      {previewStatus && previewStatus.phase !== 'idle' && previewStatus.phase !== 'unavailable' ? (
        <span
          className={`timeline__preview-progress timeline__preview-progress--${previewStatus.phase}`}
          data-testid="timeline-preview-progress"
          style={{ width: `${previewStatus.percent}%` }}
          title={`${previewStatus.message} (${Math.round(previewStatus.percent)} %)`}
        />
      ) : null}
      <span className="timeline__progress" style={{ width: `${progressPercent}%` }} />

      {segments.map((segment, index) => {
        const left = duration > 0 ? (segment.startSeconds / duration) * 100 : 0
        const width = duration > 0 ? (segment.lengthSeconds / duration) * 100 : 0

        return (
          <span
            className={`timeline__segment ${index === activeSegmentIndex ? 'timeline__segment--active' : ''}`}
            data-testid="timeline-segment"
            key={segment.id}
            title={segment.title || `Segment ${index + 1}`}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }}
          />
        )
      })}

      <span className="timeline__needle" style={{ left: `${progressPercent}%` }} />

      {indicatorRatio !== null && duration > 0 ? (
        <>
          <span
            className="timeline__hover-guide"
            style={{ left: `${indicatorRatio * 100}%` }}
            aria-hidden="true"
          />
          <span
            className={`timeline__tooltip${previewFrame || (previewStatus && previewStatus.phase !== 'idle' && previewStatus.phase !== 'ready') ? ' timeline__tooltip--preview' : ''}`}
            style={{ left: `clamp(88px, ${indicatorRatio * 100}%, calc(100% - 88px))` }}
            aria-hidden="true"
          >
            {previewFrame ? (
              <span
                className="timeline__preview-image"
                style={{
                  backgroundImage: `url(${previewFrame.imageUrl})`,
                  backgroundSize: `${previewFrame.columns * 100}% ${previewFrame.rows * 100}%`,
                  backgroundPosition: `${previewFrame.columns === 1 ? 0 : previewFrame.column / (previewFrame.columns - 1) * 100}% ${previewFrame.rows === 1 ? 0 : previewFrame.row / (previewFrame.rows - 1) * 100}%`
                }}
              />
            ) : null}
            {!previewFrame && previewStatus?.phase === 'indexing' ? <span className="timeline__preview-loading">Videoindex wird gelesen…</span> : null}
            {!previewFrame && (previewStatus?.phase === 'coarse' || previewStatus?.phase === 'fine') ? <span className="timeline__preview-loading">{previewStatus.message}: {Math.round(previewStatus.percent)} %</span> : null}
            {!previewFrame && previewStatus?.phase === 'paused' ? <span className="timeline__preview-loading">Vorschau pausiert während der Wiedergabe</span> : null}
            {!previewFrame && previewStatus?.phase === 'unavailable' ? <span className="timeline__preview-loading">Vorschau nicht verfügbar</span> : null}
            <span className="timeline__preview-time">{formatClockTime(duration * indicatorRatio)}</span>
          </span>
        </>
      ) : null}
    </button>
  )
}

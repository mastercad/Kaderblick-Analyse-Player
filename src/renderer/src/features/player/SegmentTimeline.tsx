import type { Segment } from '../../../../common/types'

interface SegmentTimelineProps {
  duration: number
  currentTime: number
  activeSegmentIndex: number
  segments: Segment[]
  onSeek: (nextTimeSeconds: number) => void
}

export function SegmentTimeline({ duration, currentTime, activeSegmentIndex, segments, onSeek }: SegmentTimelineProps) {
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (duration <= 0) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / bounds.width
    onSeek(duration * Math.min(Math.max(ratio, 0), 1))
  }

  return (
    <button className="timeline" type="button" onClick={handleClick} aria-label="Zeitleiste">
      <span className="timeline__track" />
      <span className="timeline__progress" style={{ width: `${progressPercentage}%` }} />

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

      <span className="timeline__needle" style={{ left: `${progressPercentage}%` }} />
    </button>
  )
}

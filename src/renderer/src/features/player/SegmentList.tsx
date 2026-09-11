import { formatClockTime } from '../../../../common/timeUtils'
import type { Segment } from '../../../../common/types'

interface SegmentListProps {
  segments: Segment[]
  activeSegmentIndex: number
  onSelectSegment: (segmentIndex: number) => void
}

export function SegmentList({ segments, activeSegmentIndex, onSelectSegment }: SegmentListProps) {
  return (
    <section className="panel segment-list-panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Segmente</p>
          <h2>Szenen im aktuellen Video</h2>
        </div>
        <span className="segment-list-panel__count">{segments.length}</span>
      </div>

      <div className="segment-list">
        {segments.length === 0 ? (
          <div className="segment-list__empty">Nach dem Laden von Video und CSV erscheinen hier die passenden Szenen.</div>
        ) : (
          segments.map((segment, index) => (
            <button
              className={`segment-card ${index === activeSegmentIndex ? 'segment-card--active' : ''}`}
              key={segment.id}
              type="button"
              onClick={() => onSelectSegment(index)}
            >
              <span className="segment-card__index">{String(index + 1).padStart(2, '0')}</span>
              <strong className="segment-card__title">{segment.title || 'Ohne Titel'}</strong>
              <span className="segment-card__time">
                {formatClockTime(segment.startSeconds)} bis {formatClockTime(segment.endSeconds)}
              </span>
              {segment.subTitle ? <span className="segment-card__subtitle">{segment.subTitle}</span> : null}
            </button>
          ))
        )}
      </div>
    </section>
  )
}

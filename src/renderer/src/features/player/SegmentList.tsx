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
          <h2>Alle Treffer für das geladene Video</h2>
        </div>
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
              <span className="segment-card__index">#{index + 1}</span>
              <strong>{segment.title || 'Ohne Titel'}</strong>
              <span>
                {formatClockTime(segment.startSeconds)} bis {formatClockTime(segment.endSeconds)}
              </span>
              <span>{segment.subTitle || 'Keine Unterzeile'}</span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

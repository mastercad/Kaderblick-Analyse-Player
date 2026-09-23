import { formatClockTime } from '../../../../common/timeUtils'
import type { Segment } from '../../../../common/types'

interface SegmentListProps {
  segments: Segment[]
  activeSegmentIndex: number
  onSelectSegment: (segmentIndex: number) => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function SegmentList({
  segments,
  activeSegmentIndex,
  onSelectSegment,
  collapsed = false,
  onCollapsedChange
}: SegmentListProps) {
  return (
    <section className={`panel segment-list-panel${collapsed ? ' segment-list-panel--collapsed' : ''}`}>
      <div className="panel__header">
        <div className="segment-list-panel__heading">
          <p className="panel__eyebrow">Segmente</p>
          <h2>Szenen im aktuellen Video</h2>
        </div>
        <div className="segment-list-panel__actions">
          <span className="segment-list-panel__count">{segments.length}</span>
          {onCollapsedChange ? (
            <button
              className="segment-list-panel__toggle"
              type="button"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Segmentleiste ausklappen' : 'Segmentleiste einklappen'}
              title={collapsed ? 'Segmentleiste ausklappen' : 'Segmentleiste einklappen'}
              onClick={() => onCollapsedChange(!collapsed)}
            >
              <span aria-hidden="true">{collapsed ? '‹' : '›'}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="segment-list" hidden={collapsed}>
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

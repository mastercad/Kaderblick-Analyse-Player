import type { CsvFileDescriptor, VideoFileDescriptor } from '../../../../common/types'

interface LibraryToolbarProps {
  compact?: boolean
  selectedVideo?: VideoFileDescriptor
  selectedCsv?: CsvFileDescriptor
  matchedSegmentCount: number
  totalSegmentCount: number
  onLoadVideo: () => Promise<void>
  onLoadCsv: () => Promise<void>
}

export function LibraryToolbar({
  compact = false,
  selectedVideo,
  selectedCsv,
  matchedSegmentCount,
  totalSegmentCount,
  onLoadVideo,
  onLoadCsv
}: LibraryToolbarProps) {
  return (
    <section className={`panel toolbar ${compact ? 'toolbar--compact' : ''}`}>
      <div className="toolbar__lead">
        <div className="toolbar__copy">
          <p className="panel__eyebrow">Bibliothek</p>
          <h2>{compact ? 'Quellen und Segmente' : 'Dateien laden und Analyse vorbereiten'}</h2>
          {compact ? null : <p className="toolbar__hint">Videoquelle und Segmentdatei werden zentral verwaltet, damit Player und Filter immer denselben Stand zeigen.</p>}
        </div>

        <div className="toolbar__actions">
          <button className="button button--primary" type="button" onClick={() => void onLoadVideo()}>
            Video laden
          </button>
          <button className="button" type="button" onClick={() => void onLoadCsv()}>
            CSV laden
          </button>
        </div>
      </div>

      <div className="toolbar__meta">
        <div className="meta-card">
          <span className="meta-card__label">Aktuelles Video</span>
          <strong>{selectedVideo?.fileName ?? 'Noch kein Video geladen'}</strong>
        </div>
        <div className="meta-card">
          <span className="meta-card__label">Segmentdatei</span>
          <strong>{selectedCsv?.fileName ?? 'Noch keine CSV geladen'}</strong>
        </div>
        <div className="meta-card">
          <span className="meta-card__label">Passende Segmente</span>
          <strong>
            {matchedSegmentCount} / {totalSegmentCount}
          </strong>
        </div>
      </div>
    </section>
  )
}

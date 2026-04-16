import type { CsvFileDescriptor, VideoFileDescriptor } from '../../../../common/types'

interface LibraryToolbarProps {
  compact?: boolean
  videoLibrary: VideoFileDescriptor[]
  activeVideoIndex: number
  selectedCsv?: CsvFileDescriptor
  matchedSegmentCount: number
  totalSegmentCount: number
  onLoadVideos: () => Promise<void>
  onAddVideos: () => Promise<void>
  onSelectVideo: (index: number) => void
  onLoadCsv: () => Promise<void>
}

export function LibraryToolbar({
  compact = false,
  videoLibrary,
  activeVideoIndex,
  selectedCsv,
  matchedSegmentCount,
  totalSegmentCount,
  onLoadVideos,
  onAddVideos,
  onSelectVideo,
  onLoadCsv
}: LibraryToolbarProps) {
  const activeVideo = videoLibrary[activeVideoIndex]

  return (
    <section className={`panel toolbar ${compact ? 'toolbar--compact' : ''}`}>
      <div className="toolbar__lead">
        <div className="toolbar__copy">
          <p className="panel__eyebrow">Bibliothek</p>
          <h2>{compact ? 'Quellen und Segmente' : 'Dateien laden und Analyse vorbereiten'}</h2>
          {compact ? null : <p className="toolbar__hint">Videoquellen und Segmentdatei werden zentral verwaltet, damit Player und Filter immer denselben Stand zeigen.</p>}
        </div>

        <div className="toolbar__actions">
          <button className="button button--primary" type="button" onClick={() => void onLoadVideos()}>
            Videos laden
          </button>
          {videoLibrary.length > 0 && (
            <button className="button" type="button" onClick={() => void onAddVideos()}>
              Video hinzufügen
            </button>
          )}
          <button className="button" type="button" onClick={() => void onLoadCsv()}>
            CSV laden
          </button>
        </div>
      </div>

      <div className="toolbar__meta">
        <div className="meta-card meta-card--wide">
          <span className="meta-card__label">
            {videoLibrary.length === 0
              ? 'Videos'
              : `${videoLibrary.length} Video${videoLibrary.length !== 1 ? 's' : ''} geladen`}
          </span>
          {videoLibrary.length === 0 ? (
            <strong>Noch keine Videos geladen</strong>
          ) : (
            <ul className="video-library-list">
              {videoLibrary.map((video, index) => (
                <li
                  key={video.path}
                  className={`video-library-item${index === activeVideoIndex ? ' video-library-item--active' : ''}`}
                >
                  <button
                    type="button"
                    className="video-library-item__button"
                    onClick={() => onSelectVideo(index)}
                    title={video.path}
                  >
                    <span className="video-library-item__name">{video.fileName}</span>
                    {video.playbackMode === 'proxy' && (
                      <span className="playback-badge" title={video.playbackHint ?? 'Optimierte Wiedergabe'}>
                        <span className="playback-badge__dot" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {activeVideo?.playbackMode === 'proxy' && activeVideo.playbackHint ? (
            <span className="meta-card__hint">{activeVideo.playbackHint}</span>
          ) : null}
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

import { useRef, useState } from 'react'
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
  onReorderVideos?: (reordered: VideoFileDescriptor[]) => void
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
  onReorderVideos,
  onLoadCsv
}: LibraryToolbarProps) {
  const activeVideo = videoLibrary[activeVideoIndex]
  const draggedIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    draggedIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== draggedIndexRef.current) setDragOverIndex(index)
  }

  const handleDrop = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const from = draggedIndexRef.current
    draggedIndexRef.current = null
    setDragOverIndex(null)
    if (from === null || from === targetIndex || !onReorderVideos) return
    const reordered = [...videoLibrary]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(targetIndex, 0, moved)
    onReorderVideos(reordered)
  }

  const handleDragEnd = () => {
    draggedIndexRef.current = null
    setDragOverIndex(null)
  }

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
                  draggable={!!onReorderVideos}
                  onDragStart={onReorderVideos ? handleDragStart(index) : undefined}
                  onDragOver={onReorderVideos ? handleDragOver(index) : undefined}
                  onDrop={onReorderVideos ? handleDrop(index) : undefined}
                  onDragEnd={onReorderVideos ? handleDragEnd : undefined}
                  className={[
                    'video-library-item',
                    index === activeVideoIndex ? 'video-library-item--active' : '',
                    dragOverIndex === index ? 'video-library-item--drag-over' : ''
                  ].filter(Boolean).join(' ')}
                >
                  {onReorderVideos && (
                    <span className="video-library-item__drag-handle" aria-hidden="true">⠿</span>
                  )}
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

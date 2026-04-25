import type { SessionSnapshot } from '../../../../common/types'

interface SessionRestoreDialogProps {
  snapshot: SessionSnapshot
  onRestore: (snapshot: SessionSnapshot) => void
  onDecline: () => void
}

function formatSavedAt(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  } catch {
    return isoString
  }
}

export function SessionRestoreDialog({ snapshot, onRestore, onDecline }: SessionRestoreDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="session-restore-title"
        aria-modal="true"
        className="modal-card"
        role="dialog"
      >
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Gespeicherte Sitzung gefunden</p>
            <h2 id="session-restore-title">Sitzung wiederherstellen?</h2>
          </div>
        </div>

        <div className="modal-card__body">
          <p>Es wurde eine Sitzung vom <strong>{formatSavedAt(snapshot.savedAt)}</strong> gefunden.</p>

          <div className="about-grid" style={{ marginTop: '1rem' }}>
            {snapshot.videoLibrary.length > 0 && (
              <div className="about-card">
                <span className="meta-card__label">
                  {snapshot.videoLibrary.length} Video{snapshot.videoLibrary.length !== 1 ? 's' : ''}
                </span>
                <ul className="snapshot-video-list">
                  {snapshot.videoLibrary.slice(0, 3).map((v) => (
                    <li key={v.path} title={v.path}>{v.fileName}</li>
                  ))}
                  {snapshot.videoLibrary.length > 3 && (
                    <li className="snapshot-video-list__overflow">
                      +{snapshot.videoLibrary.length - 3} weitere
                    </li>
                  )}
                </ul>
              </div>
            )}
            {snapshot.csvFileName && (
              <div className="about-card">
                <span className="meta-card__label">CSV</span>
                <strong style={{ wordBreak: 'break-all' }}>{snapshot.csvFileName}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="modal-card__footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem' }}>
          <button
            className="button button--subtle"
            type="button"
            onClick={onDecline}
          >
            Nein, neu starten
          </button>
          <button
            className="button button--primary"
            type="button"
            autoFocus
            onClick={() => onRestore(snapshot)}
          >
            Ja, wiederherstellen
          </button>
        </div>
      </section>
    </div>
  )
}

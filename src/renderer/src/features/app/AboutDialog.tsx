import type { AppInfo } from '../../../../common/types'

interface AboutDialogProps {
  appInfo: AppInfo
  open: boolean
  onClose: () => void
}

export function AboutDialog({ appInfo, open, onClose }: AboutDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="about-dialog-title"
        aria-modal="true"
        className="modal-card"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Ueber die App</p>
            <h2 id="about-dialog-title">{appInfo.name}</h2>
          </div>
          <button className="button" type="button" onClick={onClose}>
            Schliessen
          </button>
        </div>

        <div className="about-grid">
          <div className="about-card">
            <span className="meta-card__label">Version</span>
            <strong>{appInfo.version}</strong>
          </div>
          <div className="about-card">
            <span className="meta-card__label">Autor</span>
            <strong>{appInfo.authorName}</strong>
          </div>
          <div className="about-card">
            <span className="meta-card__label">Kontakt</span>
            <strong>{appInfo.authorEmail}</strong>
          </div>
          <div className="about-card">
            <span className="meta-card__label">Projektseite</span>
            <strong>{appInfo.homepage}</strong>
          </div>
        </div>

        <p className="about-text">{appInfo.description}</p>

        <div className="about-columns">
          <div>
            <p className="panel__eyebrow">Schwerpunkte</p>
            <ul className="simple-list">
              <li>CSV-Segmente passend zum geladenen Video</li>
              <li>Nur-Segmente-Wiedergabe und Einzelwiederholung</li>
              <li>Live-Filter und Presets fuer schwierige Aufnahmen</li>
            </ul>
          </div>
          <div>
            <p className="panel__eyebrow">Wichtige Kurzkuerzel</p>
            <ul className="simple-list">
              <li>Leertaste fuer Play und Pause</li>
              <li>N fuer Segmentmodus</li>
              <li>R fuer Einzelwiederholung</li>
              <li>F fuer Filter ein oder aus</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

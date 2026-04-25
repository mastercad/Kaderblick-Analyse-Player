import { createPortal } from 'react-dom'
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

  return createPortal(
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
            <p className="panel__eyebrow">Über die App</p>
            <h2 id="about-dialog-title">{appInfo.name}</h2>
          </div>
          <button aria-label="Schliessen" className="icon-button" type="button" onClick={onClose}>
            <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
            <strong>
              <a href={appInfo.homepage} target="_blank" rel="noreferrer" className="about-link">
                {appInfo.homepage}
              </a>
            </strong>
          </div>
        </div>

        <p className="about-text">{appInfo.description}</p>

        <div className="about-columns">
          <div>
            <p className="panel__eyebrow">Schwerpunkte</p>
            <ul className="simple-list">
              <li>CSV-Segmente passend zum geladenen Video</li>
              <li>Nur-Segmente-Wiedergabe und Einzelwiederholung</li>
              <li>Live-Filter und Presets für schwierige Aufnahmen</li>
            </ul>
          </div>
          <div>
            <p className="panel__eyebrow">Wichtige Kürzel</p>
            <ul className="simple-list">
              <li>Leertaste für Play und Pause</li>
              <li>N für Segmentmodus</li>
              <li>R für Einzelwiederholung</li>
              <li>F für Filter ein oder aus</li>
            </ul>
          </div>
        </div>
      </section>
    </div>,
    document.body
  )
}

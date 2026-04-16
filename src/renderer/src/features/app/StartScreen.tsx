import type { AppInfo } from '../../../../common/types'

interface StartScreenProps {
  appInfo: AppInfo
  onLoadVideo: () => Promise<void>
  onLoadCsv: () => Promise<void>
  onOpenAbout: () => void
  onExportAppSettings: () => Promise<void>
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function FileTextIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function StartScreen({ appInfo, onLoadVideo, onLoadCsv, onOpenAbout, onExportAppSettings }: StartScreenProps) {
  return (
    <section className="panel start-screen">
      <div className="start-screen__hero">
        <div className="start-screen__copy">
          <p className="panel__eyebrow">Startbild</p>
          <h2>{appInfo.name}</h2>
          <p className="start-screen__lead">
            Lade ein Video und deine Segmentdatei, um Spielszenen direkt im Team zu sichten, Bildfilter live anzupassen und relevante Situationen gezielt zu besprechen.
          </p>
          <div className="button-stack">
            <button className="button button--primary button--icon" type="button" onClick={() => void onLoadVideo()}>
              <FolderIcon />
              Video laden
            </button>
            <button className="button button--icon" type="button" onClick={() => void onLoadCsv()}>
              <FileTextIcon />
              Segmentdatei laden
            </button>
            <button className="button button--icon" type="button" onClick={onOpenAbout}>
              <InfoIcon />
              Über die App
            </button>
            <button className="button button--icon" type="button" onClick={() => void onExportAppSettings()}>
              <DownloadIcon />
              Einstellungen exportieren
            </button>
          </div>
        </div>

        <div className="start-screen__art" aria-hidden="true">
          <div className="start-screen__pitch" />
          <div className="start-screen__timeline">
            <span className="start-screen__timeline-bar" />
            <span className="start-screen__timeline-marker start-screen__timeline-marker--first" />
            <span className="start-screen__timeline-marker start-screen__timeline-marker--second" />
            <span className="start-screen__timeline-marker start-screen__timeline-marker--third" />
          </div>
        </div>
      </div>

      <div className="start-screen__info-grid">
        <div className="about-card">
          <span className="meta-card__label">Schnellstart</span>
          <strong>1. Video laden, 2. CSV laden, 3. Szenen direkt ansehen</strong>
        </div>
        <div className="about-card">
          <span className="meta-card__label">Teamfall</span>
          <strong>Dunkle oder schwierige Aufnahmen live nachbessern und gemeinsam besprechen</strong>
        </div>
        <div className="about-card">
          <span className="meta-card__label">Einstellungen sichern</span>
          <strong>Aktuellen Zustand mit Filtern, Presets und geladenen Quellen als JSON exportieren</strong>
        </div>
      </div>
    </section>
  )
}

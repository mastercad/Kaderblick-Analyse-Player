import type { AppInfo } from '../../../../common/types'

interface StartScreenProps {
  appInfo: AppInfo
}

export function StartScreen({ appInfo }: StartScreenProps) {
  return (
    <section className="panel start-screen">
      <div className="start-screen__hero">
        <div className="start-screen__copy">
          <p className="panel__eyebrow">Startbild</p>
          <h2>{appInfo.name}</h2>
          <p className="start-screen__lead">
            Lade ein Video und deine Segmentdatei, um Spielszenen direkt im Team zu sichten, Bildfilter live anzupassen und relevante Situationen gezielt zu besprechen.
          </p>
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

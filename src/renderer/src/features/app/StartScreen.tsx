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
          <div className="start-screen__monitor">
            <svg className="start-screen__pitch-svg" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="sg-pitch" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e7030" />
                  <stop offset="100%" stopColor="#114a1e" />
                </linearGradient>
                <radialGradient id="sg-center" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
              </defs>
              {/* Background */}
              <rect x="0" y="0" width="320" height="180" fill="url(#sg-pitch)" />
              <rect x="0" y="0" width="320" height="180" fill="url(#sg-center)" />
              {/* Pitch border */}
              <rect x="10" y="8" width="300" height="164" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Center line */}
              <line x1="160" y1="8" x2="160" y2="172" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Center circle */}
              <circle cx="160" cy="90" r="30" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Center spot */}
              <circle cx="160" cy="90" r="2.5" fill="rgba(255,255,255,0.7)" />
              {/* Left penalty area */}
              <rect x="10" y="52" width="46" height="76" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Left goal area */}
              <rect x="10" y="68" width="20" height="44" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Left penalty spot */}
              <circle cx="46" cy="90" r="2" fill="rgba(255,255,255,0.65)" />
              {/* Left penalty arc */}
              <path d="M 56 72 A 24 24 0 0 0 56 108" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Right penalty area */}
              <rect x="264" y="52" width="46" height="76" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Right goal area */}
              <rect x="290" y="68" width="20" height="44" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Right penalty spot */}
              <circle cx="274" cy="90" r="2" fill="rgba(255,255,255,0.65)" />
              {/* Right penalty arc */}
              <path d="M 264 72 A 24 24 0 0 1 264 108" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              {/* Left goal */}
              <rect x="2" y="75" width="8" height="30" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
              {/* Right goal */}
              <rect x="310" y="75" width="8" height="30" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
              {/* Corner arcs */}
              <path d="M 10 16 A 8 8 0 0 1 18 8" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
              <path d="M 302 8 A 8 8 0 0 1 310 16" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
              <path d="M 18 172 A 8 8 0 0 1 10 164" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
              <path d="M 310 164 A 8 8 0 0 1 302 172" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
              {/* Play button overlay */}
              <circle cx="160" cy="90" r="20" fill="rgba(0,0,0,0.38)" />
              <polygon points="155,83 155,97 171,90" fill="rgba(255,255,255,0.9)" />
            </svg>
          </div>
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

# Kaderblick Analyse Player

Desktop-Anwendung für die Fußball-Videoanalyse – CSV-basierte Szenennavigation, Echtzeit-Bildfilter und Presets für schwierige Aufnahmen.

![Kaderblick Analyse Player – Startbildschirm](assets/app_screen.png)

---

## Funktionsübersicht

| Funktion | Beschreibung |
|---|---|
| **Segmentnavigation** | CSV-Datei laden, Szenen werden automatisch dem Video zugeordnet |
| **Segmentmodus** | Nur markierte Szenen hintereinander abspielen |
| **Timeline-Vorschau** | Beim Überfahren der Zeitleiste sofort das zugehörige Videobild und den Aufbaufortschritt anzeigen |
| **Einzelwiederholung** | Aktive Szene in Schleife |
| **Live-Filter** | Helligkeit, Kontrast, Sättigung, Weichzeichner – in Echtzeit während der Wiedergabe |
| **Presets** | Filtereinstellungen speichern, laden, importieren und exportieren |
| **Session-Wiederherstellung** | Geladene Videos, CSV und Einstellungen als JSON exportieren und später wieder laden |
| **Automatische Updates** | Aktualisiert installierte und portable Builds im Hintergrund; Offline-Betrieb und Wiedergabe werden nicht blockiert |
| **Tastatursteuerung** | Vollständige Bedienung ohne Maus |

---

## Tastaturkürzel

| Taste | Funktion |
|---|---|
| `Leertaste` | Wiedergabe / Pause |
| `N` | Segmentmodus ein-/ausschalten |
| `R` | Einzelwiederholung ein-/ausschalten |
| `F` | Filterbereich ein-/ausblenden |
| `S` | Screenshot eines lokalen Videos im Bilderordner unter `Kaderblick Screenshots` speichern |
| `Pfeil links` | Voriges Segment |
| `Pfeil rechts` | Nächstes Segment |
| `F11` | Vollbild |

---

## Voraussetzungen

- **Node.js** ≥ 18
- **npm** ≥ 9

---

## Installation & Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsmodus starten (Hot Reload)
npm run dev

# Tests ausführen
npm test

# Tests im Watch-Modus
npm run test:watch

# TypeScript-Typen prüfen
npm run lint
```

---

## Build & Release

```bash
# Produktions-Build + Installer erstellen
npm run build

# Nur die entpackte App bauen (schneller, kein Installer)
npm run build:dir
```

Der Build erzeugt Pakete für:

- **Linux** – AppImage + .deb
- **Windows** – NSIS-Installer + Portable
- **macOS** – DMG + ZIP

Die Ausgabe landet im Verzeichnis `release/`. Jeder Paketname enthält die aktuelle
Version aus `package.json`, zum Beispiel
`kaderblick-analyse-player-2.5.1-linux-x86_64.AppImage`.

Release-relevante Conventional Commits auf `main` lösen automatisch die nächste
Version aus. Dafür ist kein Release-PR und keine manuelle Freigabe erforderlich.
Zuerst werden die Windows-, Linux- und macOS-Artefakte gebaut und vollständig geprüft.
Erst danach wird ein Draft mit allen Dateien angelegt, nochmals geprüft und als
GitHub Release veröffentlicht.

Commit-Nachrichten müssen dem [Conventional Commits](https://www.conventionalcommits.org/)-Standard folgen.

---

## Projektstruktur

```
src/
  common/       # Shared-Logik (Segmente, Filter, Typen, Tests)
  main/         # Electron-Hauptprozess (Dateidialoge, FFprobe, Streaming)
  preload/      # IPC-Bridge (contextBridge API)
  renderer/     # React-Frontend (UI, Hooks, Feature-Komponenten)
assets/         # App-Icons und Schriften
docs/           # Benutzerhandbuch und technische Architektur
release/        # Build-Ausgabe (wird generiert)
```

---

## Technischer Stack

| Schicht | Technologie |
|---|---|
| Desktop-Framework | Electron 41 |
| Frontend | React 19, TypeScript 5 |
| Build | electron-vite, Vite 7 |
| Medienverarbeitung | Native Chromium-Wiedergabe, WebCodecs/MP4Box für Timeline-Vorschaubilder, FFmpeg/FFprobe für Format-Fallbacks |
| CSV-Parsing | PapaParse |
| Tests | Vitest 4, @testing-library/react |
| Release | Release Please |

---

## Dokumentation

- [Benutzerhandbuch](docs/benutzerhandbuch.md)
- [Technische Architektur](docs/technical-architecture.md)
- [Changelog](CHANGELOG.md)

---

## Lizenz

Proprietär – alle Rechte vorbehalten.  
Kontakt: Andreas Kempe &lt;andreas.kempe@byte-artist.de&gt;  
Projektseite: [kaderblick.de](https://kaderblick.de)

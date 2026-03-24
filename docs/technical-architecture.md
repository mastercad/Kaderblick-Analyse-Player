# Technische Dokumentation

## Ziel

Die Anwendung ist eine plattformubergreifende Desktop-App fur die gemeinsame Videoanalyse. Der Fokus liegt auf stabiler lokaler Wiedergabe, CSV-basierten Segmenten, Live-Filtern und klar getrennten Zuständigkeiten im Quellcode.

## Architekturuberblick

Die App besteht aus drei Schichten:

1. Main Process
   Verwaltet Fenster, native Dateidialoge und das Speichern oder Laden von Presets im Benutzerprofil.
2. Preload Layer
   Stellt eine kleine, klar definierte API fur den Renderer bereit und verhindert, dass die UI direkten Node-Zugriff benotigt.
3. Renderer
   Enthalt Benutzeroberflache, Video-Interaktion, Segmentlogik, Filtersteuerung und Preset-Verwaltung.

## Ordnerstruktur

- `src/main`
  Electron-Hauptprozess, Dialoge, Persistenz.
- `src/preload`
  Sichere IPC-Schnittstelle zwischen UI und nativen Funktionen.
- `src/common`
  Gemeinsam genutzte Typen und reine Domänenlogik ohne UI-Abhangigkeiten.
- `src/renderer/src/app`
  App-Zusammenbau, Layout und globale Hooks.
- `src/renderer/src/features/app`
  Startbild, App-Metadaten und Uber-die-App-Dialog.
- `src/renderer/src/features/player`
  Videoelement, Timeline, Segmentnavigation, Vollbild und Segment-Modus.
- `src/renderer/src/features/filters`
  Kompaktes Filter-Overlay, Slider, Presets, Dirty-Status und Speicherdialog.
- `src/renderer/src/features/library`
  CSV-Einlesen, Segmentliste und Zuordnung zum geladenen Video.
- `src/renderer/src/components`
  Wiederverwendbare UI-Bausteine.

## Fachliche Regeln

### Segmentzuordnung

- In der CSV wird nur der Dateiname des Videopfads fur das Matching verwendet.
- Alle Segmente mit passendem Dateinamen werden geladen.
- Die Segmente werden nach Startzeit sortiert.

### Segmentmodus

- Im Modus "Nur Segmente abspielen" werden definierte Segmente der Reihe nach abgespielt.
- Bereiche zwischen Segmenten werden automatisch ubersprungen.
- Sind keine weiteren Segmente vorhanden, pausiert die Wiedergabe.
- Optional kann ein einzelnes aktives Segment in Endlosschleife wiederholt werden.
- Die Segmentliste folgt dem aktuell aktiven Segment automatisch, damit im Team immer sichtbar bleibt, welche Szene gerade lauft.

### Filter

- Filter wirken nur auf die Live-Darstellung im Player.
- Presets bestehen aus JSON-Daten mit Namen und Filterwerten.
- Eingebaute Presets sind unveranderlich.
- Benutzerdefinierte Presets werden im Electron-`userData`-Verzeichnis abgelegt.
- Das aktive Preset wird als `dirty` behandelt, sobald Filterwerte von den Presetwerten abweichen.
- Das Filter-Overlay integriert Presetauswahl, Neu-Anlage, Speichern, Import und Export direkt im Overlay statt in einer separaten Seitenleiste.
- Beim Speichern fragt ein Dialog, ob ein bestehendes benutzerdefiniertes Preset uberschrieben oder ein neues Preset angelegt werden soll.

### Vollbild

- Der Player kann direkt in den Vollbildmodus wechseln.
- Der Vollbildmodus bezieht sich auf den Player-Bereich und nicht nur auf das rohe Videoelement.
- Die Umschaltung ist sowohl per Button als auch ueber `F11` moeglich.

### App-Metadaten und Einstellungen

- Der Renderer laedt App-Informationen uber die Preload-API aus dem Main Process.
- Ein Uber-die-App-Dialog zeigt Produktname, Version, Kontakt und die wichtigsten Funktionen.
- Aktuelle App-Einstellungen lassen sich als JSON exportieren.
- Der Export umfasst geladene Quellen, Filterzustand, Presetauswahl, benutzerdefinierte Presets und UI-Zustaende wie Filter-Sichtbarkeit oder Einzelwiederholung.

## Tests

Die Teststrategie trennt reine Fachlogik von UI:

1. Unit-Tests fur CSV-Parsing, Segmentnavigation und Filterumrechnung.
2. Component-Tests fur zentrale UI-Elemente.
3. Electron-nahe Funktionen bleiben dunn und werden uber reine Helfer testbar gehalten.
4. Exportformate wie App-Einstellungen werden uber reine Common-Module getestet.

## Build und Auslieferung

- Entwicklung: `npm run dev`
- Tests: `npm test`
- Paketbau: `npm run build`

Der Build erzeugt Pakete fur Linux und Windows uber `electron-builder`.

## Branding und Installer

- Produktname: Kaderblick Analyse Player
- Build-Ressourcen liegen unter `build/`
- Linux nutzt ein Desktop-Icon und einen aussagekraftigen Desktop-Kommentar.
- Windows nutzt ein eigenes Installer-, Uninstaller- und Programm-Icon sowie einen sprechenden Programmnamen im Installer.

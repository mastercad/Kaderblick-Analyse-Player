# Teststrategie für Electron, Darstellung und Videoleistung

Die schnellen Unit- und Komponententests bleiben mit `npm test` von Electron und echten Dateien unabhängig. Ergänzend startet die E2E-Suite die gebaute Desktop-Anwendung als echten Electron-Prozess mit einem isolierten Benutzerprofil.

## Lokale Befehle

- `npm run lint` prüft Anwendungs- und E2E-TypeScript.
- `npm run test:e2e` baut die Anwendung, erzeugt kleine lokale H.264-Testvideos und führt Electron-Workflows, Neustart-Persistenz sowie visuelle Regressionen aus.
- `npm run test:e2e:workflow` führt die plattformneutralen Electron-Workflows ohne Linux-Screenshotvergleich aus.
- `npm run test:e2e:update` aktualisiert die Linux-Referenzbilder bewusst nach einer geprüften UI-Änderung.
- `npm run test:e2e:performance` erzeugt drei echte 4K-Dateien und misst über mindestens eine Minute Hauptansicht und zwei Zusatzperspektiven.

Die generierten Videos liegen ausschließlich unter `.cache/e2e-media` und werden nicht versioniert. Eine Spezifikationsdatei je Video sorgt dafür, dass geänderte Auflösung, Bildrate oder Dauer den Cache zuverlässig neu erzeugen.

## Was verbindlich geprüft wird

- Videoauswahl über den produktiven Electron-IPC-Pfad, Metadatenanalyse und reale Wiedergabe.
- Sitzungsdaten, Zeitzuordnungen, aktives Video, Dark Mode, Zeitbezug und Perspektivenauswahl über einen vollständigen Prozess-Neustart.
- Gerenderte Linux-Referenzbilder für Arbeitsansicht, Vollbild-Splash sowie alle vier Vollbild-Flyouts.
- Tatsächliche Bounding-Boxes aller Flyouts gegen die PiP-Flächen und WCAG-Farbkontrast der sichtbaren Flyout-Inhalte.
- Drei reale 3840×2160-Streams über mindestens 60 Sekunden: Zeitfortschritt, gerenderte Frames, Abspielbereitschaft, Stillstandsintervalle und Synchronitätsdrift.

Bewegte Videoflächen werden in den visuellen Referenzen maskiert, weil Decoder den Präsentationszeitpunkt um einzelne Frames variieren können. Die vollständige Wiedergabe der Videos wird unabhängig davon in den Electron- und 4K-Tests geprüft.

## CI

Pull Requests führen die Electron- und Screenshot-Suite unter Linux/Xvfb sowie die plattformneutralen Electron-Workflows zusätzlich unter Windows und macOS aus. Der reale 4K-Langzeittest läuft wöchentlich und manuell, damit er die normale Rückmeldung nicht um mehrere Minuten verlängert. Bei Fehlern werden Trace, Bildschirmbild, Video und HTML-Bericht gespeichert; der Langzeittest legt zusätzlich seine Messreihe als JSON-Artefakt ab.

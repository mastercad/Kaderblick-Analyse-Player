# Build und Auslieferung

- Entwicklung: `npm run dev`
- Tests: `npm test`
- Paketbau: `npm run build`

Der Build erzeugt Pakete fur Linux, Windows und MacOS über `electron-builder`.

## Timeline-Vorschau

- Der Renderer startet höchstens einen Preview-Worker gleichzeitig und priorisiert das aktuell ausgewählte Video.
- MP4Box liest den MP4/MOV/M4V-Index über begrenzte Dateibereiche. H.264-Schlüsselbilder werden im Worker mit WebCodecs dekodiert und als WebP-Spritebögen gespeichert.
- Zuerst entsteht eine grobe Abdeckung im Abstand von zehn Sekunden, anschließend eine Abdeckung im Abstand von einer Sekunde.
- Jeder Spritebogen wird vom Main-Prozess bestätigt, bevor der Worker weiterarbeitet. Dadurch kann sich kein unbeschränkter Schreibstau bilden.
- Laufende Hauptwiedergabe pausiert den Preview-Worker und den nativen Format-Fallback. Bereits gecachte Bilder bleiben abrufbar.
- Der persistente Cache liegt im Electron-Cacheverzeichnis, ist nach Pfad, Dateigröße und Änderungszeit versioniert und wird auf 512 MB beziehungsweise 30 Tage begrenzt.
- App-seitig gestartete Kindprozesse werden beim Beenden registriert beendet; die indexbasierte Timeline-Vorschau selbst startet keinen FFmpeg-Prozess.

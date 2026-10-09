# Benutzerhandbuch

## Wofur ist die App gedacht?

Mit der App kann euer Team Videos gemeinsam anschauen, markierte Spielszenen schnell anspringen und schwierige Aufnahmen direkt beim Ansehen verbessern.

Der Name der App ist `Kaderblick Analyse Player`.

## So startet ihr

1. App offnen.
2. Auf dem Startbild zuerst Video oder Segmentdatei laden.
3. Danach beide Quellen vervollstandigen.
4. Die passenden Szenen werden automatisch zum geladenen Video angezeigt.

## Das Startbild

Direkt nach dem Start zeigt die App eine grosse Einstiegsansicht.

Dort könnt ihr:

- die Videos laden
- die Segmentdatei laden

## Was ihr im Player machen konnt

- Video normal abspielen und pausieren
- Den Player in den Vollbildmodus schalten
- Zu vorherigem oder nachstem Segment springen
- Nur die markierten Segmente hintereinander abspielen
- Ein einzelnes Segment in Wiederholung laufen lassen
- Segmentmarken direkt in der Zeitleiste sehen

## Vorschau in der Zeitleiste

Wenn ihr mit der Maus über die Zeitleiste fahrt, erscheint direkt das Videobild an der jeweiligen Position. Ein schmaler Fortschrittsbalken in der Zeitleiste zeigt, wie weit die Vorschau für das aktuelle Video vorbereitet ist.

Nach dem Laden erstellt die App zuerst eine schnelle Übersicht über das gesamte Video. Anschließend werden die Abstände im Hintergrund bis auf eine Sekunde verfeinert. Weitere geladene Halbzeiten oder Teile desselben Spiels werden danach automatisch vorbereitet.

Während das Hauptvideo läuft, pausiert die Hintergrundaufbereitung vollständig, damit die Wiedergabe Vorrang vor der Vorschau hat. Bereits vorbereitete Bilder bleiben trotzdem sofort verfügbar. Beim Pausieren des Videos wird die Aufbereitung fortgesetzt.

Die Vorschaubilder bleiben nach dem Schließen der App erhalten. Der Cache ist auf 512 MB begrenzt; Einträge, die 30 Tage lang nicht verwendet wurden, werden automatisch entfernt. Wird eine Quelldatei verändert, verwendet die App deren alte Vorschaubilder nicht mehr.

Für MP4-, MOV- und M4V-Dateien mit H.264 liest die App gezielt nur den Dateiindex und die benötigten Schlüsselbilder. Dafür wird kein separater FFmpeg-Prozess gestartet. Bei anderen direkt abspielbaren Formaten versucht die App die Vorschau über den eingebauten Videodecoder zu erzeugen. Falls ein Format auch damit nicht gelesen werden kann, zeigt die Zeitleiste `Vorschau nicht verfügbar`; die normale Wiedergabe bleibt davon unabhängig.

## Filter benutzen

Über dem Video gibt es einen Filterbereich. Dort konnt ihr das Bild während der Wiedergabe direkt anpassen.

Die Filter sind kompakt aufgebaut:

- links steht jeweils der Name des Filters
- daneben seht ihr direkt den aktuellen Wert
- rechts passt ihr den Wert mit dem Slider an

Beispiele:

- Helligkeit anheben, wenn das Bild zu dunkel ist
- Kontrast verstärken, wenn Linien oder Spieler schwer erkennbar sind
- Farben anpassen, wenn Trikots oder Markierungen deutlicher sichtbar werden sollen
- Weichzeichnen, wenn das Bild unruhig oder sehr hart wirkt

Mit `Reset` stellt ihr alles auf die Ausgangswerte zuruck.

## Presets nutzen

Presets sind gespeicherte Bildeinstellungen.

Damit könnt ihr zum Beispiel fur bestimmte Kameras oder Wettersituationen eine passende Einstellung vorbereiten.

Ihr könnt:

- mitgelieferte Presets laden
- eigene Presets speichern
- Presets importieren
- Presets exportieren

Wenn ihr einen Filterwert verändert, zeigt die App an, dass das aktuelle Preset noch nicht gespeichert ist.

Beim Speichern fragt die App dann, ob ihr:

- das aktuelle eigene Preset überschreiben wollt
- oder ein neues Preset anlegen wollt

Ein `+` im Filterbereich legt ein neues Preset an. Das Speichersymbol speichert Veränderungen.

## App-Einstellungen sichern

Wenn ihr euren aktuellen Stand festhalten wollt, könnt ihr die App-Einstellungen als JSON-Datei exportieren.

Dabei werden zum Beispiel gesichert:

- welche Videos geladen waren
- welche CSV-Datei geladen war
- welche Filter eingestellt waren
- welches Preset aktiv war
- welche eigenen Presets vorhanden waren

Das ist hilfreich, wenn ihr einen Analysezustand dokumentieren oder später wieder nachvollziehen wollt.

## Segmentübergänge einstellen

Im Menü oben rechts könnt ihr unter `Übergangsscreen` die Dauer zwischen zwei Segmenten festlegen. Mit `0s` werden Segmentübergänge vollständig deaktiviert; die Wiedergabe springt dann ohne Übergangsscreen direkt zum nächsten Segment.

## Zeitformat für spontane Sprünge

Unter `Einstellungen` im Menü oben rechts legt ihr fest, wie eine im Player eingegebene Sprungzeit verstanden wird:

- `Videozeit – je Video`: direkte Position im aktuell geöffneten Video
- `Videozeit – fortlaufend`: Laufzeiten vorheriger Videos desselben Spiels sind eingerechnet
- `Spielzeit – je Halbzeit/Teil`: die Zeit beginnt je Halbzeit oder Teil wieder bei null
- `Spielzeit – fortlaufend`: die Spieluhr läuft über alle Halbzeiten oder Teile weiter

Im Vollbild findet ihr denselben Zeitbezug unter `Info`. Dort seht ihr jederzeit, wie gespeicherte Segmentzeiten und Eingaben bei `Springe zu Zeit` interpretiert werden, und könnt die gemeinsame Einstellung direkt ändern.

Segmentzeiten werden im Editor und in der CSV unverändert gespeichert. Der gewählte Modus bestimmt erst bei der Wiedergabe, wie Sprung- und Segmentzeiten auf die Position im zugeordneten Video abgebildet werden.

### Videoausschnitte einer Spielzeit zuordnen

Im Segment-Editor öffnet ihr unter `Spielzeit im Video festlegen` das gewünschte Video. Das aktive Video ist bereits aufgeklappt. Für jeden Spielabschnitt werden nur drei Angaben benötigt:

- `Anstoß/Wiederbeginn im Video`: die Stelle in der Aufnahme, an der dieser Spielabschnitt beginnt
- `Spieluhr startet bei`: der Stand der Spieluhr an dieser Stelle
- `Dauer des Spielabschnitts`: wie lange in diesem Abschnitt gespielt wird

Für eine normale erste Halbzeit spult ihr zum Anstoß, klickt auf `Aktuelle Videoposition einsetzen` und lasst `Spieluhr startet bei 00:00` sowie `Dauer 45:00` stehen. Beginnt der Anstoß im Video beispielsweise bei `03:10`, zeigt der Editor als Ergebnis: Im Video `03:10–48:10` läuft die Spieluhr von `00:00–45:00`.

Kennt ihr die Spielminute nicht, klappt im betreffenden Spielabschnitt optional `Aus Aufnahmezeiten berechnen` auf. Tragt dort Aufnahmebeginn, Aufnahmeende und die Uhrzeit des Anstoßes beziehungsweise Wiederbeginns ein. Mit `Vollständig` wird die ganze zeitliche Überschneidung der Aufnahme verwendet; alternativ begrenzt `Bis Spielminute …` die Zuordnung. Eine Vorschau stellt die bisherigen und die berechneten Werte gegenüber. Erst `Berechnete Zeiten übernehmen` füllt die drei vorhandenen Zeitfelder aus. Eine abweichende vorhandene Zuordnung muss zusätzlich ausdrücklich bestätigt werden. Die manuelle Eingabe bleibt unverändert verfügbar.

Die Vorlagen `1. Halbzeit` und `2. Halbzeit` setzen Start und Dauer der Spieluhr passend voraus. Die Position des Anstoßes beziehungsweise Wiederbeginns im Video bestimmt ihr weiterhin selbst.

Unberührte Videos erhalten keine automatische Spielzeit-Zuordnung. Eine vorhandene falsche Zuordnung könnt ihr mit `Spielzeit-Zuordnung entfernen` vollständig löschen. Unfertige Zeitangaben eines Videos verhindern nicht, dass gültige Änderungen an einem anderen Video gespeichert werden.

Enthält eine Aufnahme beide Halbzeiten, legt ihr zwei Spielabschnitte an. Beispiel:

- `Video 02:10 bis 47:10` entspricht `Spielzeit 00:00 bis 45:00`
- `Video 58:30 bis 103:30` entspricht `Spielzeit 45:00 bis 90:00`

Die Halbzeitpause zwischen `47:10` und `58:30` bleibt dadurch bewusst ohne Spielzeit. Das funktioniert genauso für Aufnahmeunterbrechungen und geschnittene Videos: Nach jeder Lücke beginnt ein neuer Spielabschnitt.

Gebt Videos desselben Spiels im Feld `Spiel` denselben Namen. Falls mehrere Videos dieselbe Spielzeit zeigen, bleibt der Player nach Möglichkeit im aktuellen Video; andernfalls verwendet er das erste passende Video aus der Videoliste. Zeiten in Lücken zwischen den Ausschnitten werden nicht angesprungen.

### Zusatzperspektiven manuell auswählen

Unter `Perspektiven` bestimmt ihr selbst, welche weiteren Videos klein über dem Hauptvideo angezeigt werden. Der Player wählt niemals selbst eine Kamera aus. Erst wenn ihr `Zusatzperspektiven anzeigen` aktiviert und bei einem Video ein Häkchen setzt, wird dieses Video eingeblendet.

Die Vorschau benutzt die oben eingetragenen Spielabschnitte, um dieselbe Spielzeit zu zeigen. Angezeigt werden ausschließlich ausgewählte Zusatzvideos, die an der aktuellen Spielzeit tatsächlich ein Bild besitzen. Die Auswahl bleibt auch außerhalb ihres verfügbaren Zeitbereichs erhalten und erscheint automatisch wieder, sobald sie die aktuelle Spielzeit abdeckt.

Auch Aufnahmen vor dem Anstoß, in der Halbzeitpause und nach Spielende werden synchronisiert. Dafür verwendet der Player den zeitlichen Abstand zur nächstgelegenen festgelegten Spielzeit-Grenze: beispielsweise „zwei Minuten vor Anstoß“. Eine Kamera erscheint nur, wenn sie an der berechneten Stelle tatsächlich schon beziehungsweise noch aufgenommen hat.

Klickt auf eine Zusatzperspektive, um sie bewusst zur Hauptansicht zu machen. Die bisherige Hauptansicht wechselt dabei an dieselbe Spielzeit in die Vorschau. Der Player wählt weiterhin niemals selbstständig eine Kamera aus. Geöffnete Werkzeug-, Informations- und Steuerungsleisten verdrängen die Vorschauen in den jeweils freien Bildschirmbereich. Die Zusatzperspektiven sind stumm und können jederzeit vollständig ausgeblendet werden.

Wenn ein Rechner bei einer Zusatzperspektive wiederholt Bilder verwirft, reduziert der Player automatisch nur diese Vorschau. Flüssig laufende Ansichten und das Hauptvideo bleiben in ihrer ursprünglichen Qualität.

## Über die App

Im Bereich `Über die App` seht ihr die wichtigsten Informationen zur Anwendung, zur Version und zu den wichtigsten Kürzeln.

## Tastaturkurzel

- `Leertaste`: Wiedergabe oder Pause
- `N`: Nur Segmente abspielen starten
- `R`: Wiederholung des aktuell aktiven Segments ein- oder ausschalten
- `Pfeil links/rechts` bei aktivem Segmentmodus: voriges beziehungsweise nächstes Segment
- `Pfeil links/rechts` bei ausgeschaltetem Segmentmodus: ein Bild zurück beziehungsweise vor
- `Strg + Pfeil links/rechts`: zum vorherigen beziehungsweise nächsten geladenen Video wechseln
- `F`: Filterbereich einblenden oder ausblenden
- `F11`: Vollbild ein- oder ausschalten

## Wiederholung eines einzelnen Segments

Wenn ihr eine Szene mehrfach direkt hintereinander ansehen wollt, aktiviert die Option zur Wiederholung eines einzelnen Segments.

Dann lauft nur die aktuell ausgewählte Szene in Schleife. Das ist praktisch, wenn ihr eine strittige Situation mehrfach direkt vergleichen wollt.

## Typischer Ablauf im Team

1. Video(s) laden
2. CSV laden
3. Direkt zu den relevanten Szenen springen
4. Bei schwierigen Bildern einen passenden Filter oder ein Preset aktivieren
5. Gemeinsam die Szene besprechen

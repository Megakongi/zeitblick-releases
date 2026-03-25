# ZeitBlick v1.4.0

## 🆕 Neue Features

### Gagen-Umstrukturierung
- **Projekt-spezifische Personengagen**: Individuelle Gagen pro Person pro Projekt einstellbar
- Neue Kaskade: Projekt-Personengage → Personengage → Positionsgage → Global
- Dashboard-Eingabe speichert automatisch auf der richtigen Ebene

### Universeller PDF-Import mit OCR
- **Handschriftliche Stundenzettel** werden jetzt per OCR erkannt (macOS Vision Framework)
- Drei Formate unterstützt: Numbers/iOS-Export, Rahmenfutter-Formulare, handschriftliche Zettel
- Intelligente Spalten-Erkennung mit Fuzzy-Matching
- Automatische Korrektur von Zahlen, Uhrzeiten und Datumsangaben

### Finale Abrechnung — Zeitkonto-Spalte
- Neue Spalte "Zeitkonto" in der Übersichtstabelle (Stunden im Zeitkonto)

### Urlaubstage — Zusammenhängende Anstellung
- Urlaubstage werden nur bei zusammenhängender Anstellung berechnet
- Lücke > 7 Tage zwischen Arbeitstagen unterbricht den Block
- Mehrere Beschäftigungsblöcke werden separat berechnet und summiert

## 🔧 Verbesserungen

### Navigation
- Projektfilter bleibt erhalten beim Wechsel zwischen Personen
- Automatische Projektauswahl beim Personen-Filter
- Zurück-Navigation behält den Projektkontext bei

### Vertretungslogik
- Vertretung wird erst ab >50% der Arbeitstage erkannt (statt bei jeder Anmerkung)
- Vertretungstage werden von den Zusatztagen abgezogen

### Projektansicht
- Aktive Projekte werden vor abgeschlossenen sortiert
- Vereinfachte Projekt-Kacheln (Firma statt Statistiken)

### Sonstiges
- Name-Alias-Auflösung in der TV-FFS-Berechnung (z.B. "Alex" → "Alexander")
- Gesamtsumme aus der Finale Abrechnung entfernt
- Multi-Personen Anstellungstage korrekt summiert

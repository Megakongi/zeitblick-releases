# ZeitBlick v1.2.0

## 🆕 Neue Features

### Auto-Updater
- Automatische Update-Prüfung beim App-Start
- Release Notes werden **vor dem Download** angezeigt
- Fortschrittsbalken beim Herunterladen
- Automatisches Backup vor jeder Installation
- "Was ist neu?" Overlay nach erfolgreichem Update
- Manueller Update-Check in den Einstellungen

### Backup & Restore
- Backups erstellen, anzeigen und wiederherstellen (max. 20, automatische Bereinigung)
- Daten als JSON exportieren & importieren
- Automatisches Backup vor jedem Update
- Neue Sektion in den Einstellungen

### Excel-Export (.xlsx)
- Dashboard-Daten als Excel-Datei exportieren
- Multi-Sheet-Workbook: Zusammenfassung + Wochenübersicht

### Batch-PDF-Export
- Mehrere Stundenzettel auswählen → alle als separate PDFs in einen Ordner exportieren
- Automatische Dateinamen (Name_Projekt_Datum)

### Crew-Übersicht
- Neue Übersicht bei "Alle Personen": Klickbare Karten mit Avatar, Position, Stunden, Überstunden
- Stammteam/Weitere-Trennung mit positionsbasierter Sortierung
- Samstag-/Sonntag-/Krank-/Urlaubs-Badges

### Zusatztage-Berechnung
- Erkennt automatisch Personen, die nicht an allen Drehtagen da waren
- Auto-Ausschluss: Stammteam, Vertretung, Krank
- Ausblendbar pro Person

### Spesen-Tracking
- Ausgaben erfassen: Datum, Beschreibung, Betrag, Kategorie (Fahrt, Unterkunft, Verpflegung, Material, Sonstiges)
- Einklappbar mit Summe im Header

### Weitere neue Features
- **"Speichern & nächste Woche →"** — Sofort weiter zur Folgewoche
- **"Von Vorwoche kopieren"** — Zeiten, Pausen, Fahrzeit aus der Vorwoche übernehmen
- **Vor/Zurück-Navigation** im Detailansicht zwischen Zetteln derselben Person
- **Datumsbereich-Filter** in der Einträgsliste
- **KW-Schnellauswahl** — Dropdown zum Filtern nach Kalenderwoche
- **Checkbox-Auswahl & Batch-Aktionen** in der Liste
- **Name-Alias-System** — Duplikate erkennen und Personen zusammenführen
- **Gagen pro Person** — Individuelle Tages-/Wochengage pro Mitarbeiter
- **Gagen nach Position** — Standard-Gagen für Oberbeleuchter, Best-Boy, Beleuchter etc.
- **Stundenverlauf-Chart** — Balkendiagramm mit Stunden & Überstunden pro Woche
- **Autocomplete** — Vorschläge bei Projekt, Firma, Name, Position
- **Keyboard Shortcuts** — ⌘N (Neu), ⌘I (Import), ⌘Z (Undo), Escape (Zurück)
- **Undo-Delete (Papierkorb)** — Gelöschte Zettel wiederherstellen (⌘Z oder Button)

---

## ⚙️ Berechnungen & TV-FFS

- **Wöchentliche Mehrarbeit (TZ 5.4.3.3)** — 51.–55. Stunde: 25% Zuschlag, ab 56. Stunde: 50%
- **6-Wochen-Krankheitsgrenze (TZ 13.3)** — Max. 42 bezahlte Krankheitstage, Warnung bei Überschreitung
- **Feiertags-Erkennung & Zuschlag 100% (TZ 5.6.3)** — 9 bundesweite Feiertage dynamisch berechnet
- **Heiligabend/Silvester-Hinweis** — Kein gesetzlicher Feiertag, aber Hinweiskarte
- **Ruhezeit-Verletzung (ArbZG §5)** — Warnung bei weniger als 11h Ruhezeit zwischen Schichten
- **Erweiterte Anstellungstage-Berechnung** — Berücksichtigt Arbeit, Krank, AZV, Urlaub, ZA
- **TV-FFS 2025 Referenz** — Vollständige Tarifübersicht mit TZ-Verweisen in den Einstellungen

---

## 🎨 UI/UX Verbesserungen

- **Universeller PDF-Parser** — Komplett neugeschrieben mit dynamischer Spalten-Erkennung statt hardkodierter Positionen. Unterstützt verschiedenste PDF-Layouts
- **Feiertag-Highlighting** — Visuelle Hervorhebung in Erstellen & Detail (🎄 Badge + farbige Zeile)
- **Wochenend-Highlighting** — Samstag/Sonntag-Zeilen farblich markiert
- **Hinweise-Sektion im Dashboard** — Dedizierter Bereich für Warnungen (Krankheit, Ruhezeit, Feiertage)
- **Sidebar-Personenliste** — Farbige Initialen-Avatare, einklappbar, Zettel-Anzahl pro Person
- **Sortierung** — 4 Optionen: Name, KW, Projekt, Datum (auf-/absteigend)
- **ARIA-Accessibility** — Navigation, Buttons und Sektionen mit Screen-Reader-Unterstützung
- **Validierung** — Pflichtfeld-Prüfung beim Speichern mit visuellen Fehlermeldungen
- **Auto-Berechnung** — Gesamtstunden, Überstunden und Nachtstunden automatisch bei Zeiteingabe
- **Professioneller PDF-Export** — A4 Landscape mit Metadaten-Grid und Unterschriftszeilen

---

## 💾 Unter der Haube

- **Daten-Versionierung** — Automatische Migration beim Laden, Importieren und Wiederherstellen
- **Atomares Speichern** — Schreibt erst in Temp-Datei, dann Rename (kein Datenverlust bei Crash)
- **Debounced Auto-Save** — 500ms Verzögerung verhindert übermäßige Schreibvorgänge
- **Duplikat-Erkennung beim Import** — Identische Zettel werden übersprungen
- **Fehlerbehandlung** — Lade-/Speicherfehler werden als Toast angezeigt
- **Drag & Drop-Fix** — Kein Flackern mehr bei Datei-Drop

---

> 🔒 Deine Daten bleiben bei jedem Update erhalten. Vor der Installation wird automatisch ein Backup erstellt.

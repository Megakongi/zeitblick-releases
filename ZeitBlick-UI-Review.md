# ZeitBlick — UI-Review, UX-Copy & Redesign-Konzept

*Erstellt am 29. April 2026 · Stilrichtung: Modern / Freundlich*

Diese Datei ist eine strukturierte Bestandsaufnahme der ZeitBlick-UI auf Basis von Code-Lektüre (`App.jsx`, `Sidebar.jsx`, `Dashboard.jsx`, `TimesheetList.jsx`, `OnboardingTour.jsx`, `global.css`). Sie ist in drei Teile gegliedert:

1. Design-Kritik
2. UX-Copy: Vorher/Nachher
3. Redesign-Konzept (das Mockup liegt als `ZeitBlick-Redesign-Mockup.html` daneben)

---

## 1. Design-Kritik

### Schwere-Skala

| Stufe | Bedeutung |
|---|---|
| **Hoch** | Beeinträchtigt zentrale Workflows oder ist nicht zugänglich. Sollte vor Release adressiert werden. |
| **Mittel** | Erhöht kognitive Last, ist aber nicht blockierend. Sollte mittelfristig konsolidiert werden. |

### 1.1 Marken-Identität & visuelles System — Mittel

Der Wortmark "ZeitBlick" steht als Gradient-Text in der Sidebar, ist aber sehr klein (18 px) und konkurriert visuell mit zehn Akzentfarben (Blau, Lila, Cyan, Grün, Gelb, Orange, Rot, Pink, Indigo, Teal). Eine Marke, deren Logo nicht als erstes Element wahrgenommen wird, kann ihre Identität nicht aufbauen.

Es gibt keine erkennbare Hierarchie zwischen Primär- und Sekundärfarben. Sowohl Lila als auch Blau werden als Akzent verwendet — das macht die "aktive" Sidebar-Position (Blau) weniger eindeutig.

Emojis (📊 📋 ✏️ ➕ ⚙️ 🌙) ersetzen Icons. Sie skalieren systemabhängig (macOS-Emojis sehen anders aus als Windows-Emojis), brechen das Dark-Mode-Konzept (Emojis bleiben farbig) und wirken auf einer Business-Anwendung im Filmproduktionsumfeld nicht professionell.

### 1.2 Information Architecture & Navigation — Hoch

Der Sidebar-Eintrag **"Zusatz" (➕)** ist kein Verb und beschreibt nicht, was sich dahinter verbirgt — laut Code: Stammteam, Projekt-Verwaltung, Drehkalender, Staffing. Das sind die meistgenutzten Workflows. Sie hinter "Zusatz" zu verstecken ist ein Irrtum.

**"Erstellen" (✏️)** öffnet die Stundenzettel-Erstellung — das ist eine Aktion, kein Bereich. Aktionen gehören in die App-Bar (oben rechts) oder als FAB, nicht in die Hauptnavigation neben "Übersicht" und "Einträge".

Drei Filter-Mechanismen ohne klare Hierarchie:

- Personenfilter in Sidebar
- Projektfilter im Dashboard
- Suche per `⌘K`

Nutzer wissen nie, welcher Filter gerade aktiv ist und welche Daten sie sehen.

Ein Onboarding mit **10 Schritten** ist zu lang. Am Ende erinnert sich niemand mehr an Schritt 1. Empfehlung: 3–4 Schritte (Importieren, Übersicht lesen, Exportieren) plus kontextuelle Tooltips.

### 1.3 Typografie & Lesbarkeit — Mittel

Schriftgrade in der CSS-Datei: 10 px, 11 px, 12 px, 13 px, 14 px, 15 px, 18 px — sieben verschiedene Größen ohne klare Skala. Empfohlene Skala: 12 / 14 / 16 / 20 / 24 / 32.

Body-Text ist 13 px — bei macOS-System-DPI knapp unter dem Komfort-Schwellwert. Apple HIG empfiehlt 13 pt = 17 px für Fließtext.

`--text-muted: #555577` auf `--bg-card: #1a1a2e` erreicht Kontrast ca. 3,5:1 — das fällt unter WCAG AA für Fließtext (4,5:1). Light-Mode ist nur fragmentarisch via `[data-theme="light"]`-Selektoren überschrieben, das System ist also nicht vollständig.

Tabular-Numerals werden nicht durchgängig erzwungen — Stundenzahlen "3,75" rechtsbündig in Tabellen "wandern" optisch zwischen Zeilen, weil die Ziffernbreite variiert.

### 1.4 Komponenten-Konsistenz — Hoch

Inline-Styles in JSX (z.B. ErrorBoundary `style={{ padding: 40, color: '#ff4444' }}`) konkurrieren mit CSS-Variablen. Theme-Wechsel wirkt inkonsistent.

Buttons haben mindestens fünf verschiedene Stile: `.import-btn` (gestrichelt), `.theme-toggle-btn`, `.tour-btn-next`, `.search-result-item` plus diverse Inline-`<button>`. Es gibt kein Button-System (Primary / Secondary / Ghost / Destructive).

Dialoge: Die Suche ist ein Overlay mit eigener `.search-dialog`-Klasse, Bulk-Delete ist ein anderer Confirm-Dialog, Settings-Dialoge wieder anders. Kein gemeinsames Modal-Primitive.

Toasts sind teils oben (`.import-toast`), teils als FAB (`.undo-fab`) — Position ist unvorhersehbar.

### 1.5 Dichte & Whitespace — Mittel

Die App ist eine Datenanwendung — aber das Dashboard-Layout zeigt KPI-Karten mit 16–20 px Padding und großen Lücken. Im Filmsetkontext (oft am Laptop, schnelle Zeiterfassung) ist mehr Information pro Bildschirm wertvoller.

Sidebar (240 px) ist breit für nur 5 Nav-Einträge. Auf 13"-Laptops bleiben für den Hauptinhalt ~1100 px — zu wenig für die Wochen-Tabellen.

Stundenzettel-Liste rendert Personen-Sektionen mit großen Headern. Bei 20 Personen × 12 Wochen wird die Seite endlos. Empfehlung: Virtualisierte Tabelle mit Sticky-Headers und Personen als Filter-Chips.

### 1.6 Feedback & Statuskommunikation — Hoch

Import-Toast verschwindet nach 4 Sekunden — bei 50 importierten PDFs zu schnell, um zu lesen. Empfehlung: persistenter Toast mit Schließen-Button.

"PDFs werden importiert..." ohne Fortschritt: Nutzer denken, die App hängt. Kein Counter ("3/12"), kein Cancel-Button.

Save-Errors verschwinden nach 6 Sekunden — bei einem echten Fehler fatal: die Daten könnten verloren sein und der Nutzer weiß es nicht mehr.

Drag-and-Drop-Overlay erscheint global — auch wenn man nur eine Datei auf den Desktop zieht und kurz die App überquert.

### 1.7 Accessibility-Auffälligkeiten — Hoch

`aria-label="Suche öffnen (⌘K)"` ist gut, aber Emojis in Icons haben `aria-hidden="true"` — der visuelle "Sinn" wird damit für Screen-Reader entfernt, was OK ist, aber `nav-label`-Texte sind die einzige Quelle. "Zusatz" sagt einem blinden Nutzer nichts.

Keyboard-Trap im Onboarding nicht geprüft: Tab-Reihenfolge im Tour-Tooltip nicht klar.

Skip-Link `<a href="#main-content">` führt auf eine ID, die im React-Code nirgends auf `<main>` gesetzt ist (`<main className="main-content">` hat kein `id`).

Touch-Target `.search-clear-btn` (✕) hat keine festgelegte Mindestgröße — bei kleiner Bildschirmskalierung unter 24×24 px.

### 1.8 UX-Copy & Tonfall — Mittel

"Stundenzettel-Liste" als Section-Label klingt nach Behörde. "Einträge" — der Sidebar-Begriff — ist auch nicht emotional. Empfehlung: "Wochen" oder "Stundenzettel".

Onboarding-Texte sind voll von Floskeln ("auf einen Blick", "Lass uns eine kurze Tour machen!"). Direkter, aktionsorientierter Stil ist freundlicher als gespielte Lockerheit.

Fehlermeldungen sind technisch ("Speicherfehler: ENOSPC: no space left"). Empfehlung: Klartext + Lösung.

"Spesen", "AZV-Tage", "TZ 5.4.3.2" sind Fachbegriffe ohne Tooltip-Erklärung. Neue Nutzer sind verloren.

### 1.9 Zusammenfassung der wichtigsten Hebel

- Navigation aufräumen: "Zusatz" auflösen, "Erstellen" als globale Aktion behandeln, Filter-Status sichtbar machen.
- Komponenten-System einführen: Buttons, Inputs, Modals, Toasts als wiederverwendbare Primitive.
- Emojis durch ein konsistentes Icon-Set (z.B. Lucide oder Phosphor) ersetzen.
- Farbpalette von 10 auf 4–5 Akzente reduzieren; Semantik klären (Primary, Success, Warning, Danger).
- Typografie auf eine Skala bringen, Body auf 14–15 px erhöhen, Tabular-Numerals durchgängig.
- Onboarding von 10 auf 3 Schritte kürzen; Rest in kontextuellen Tooltips.
- Persistente Fehler-Toasts mit Dismiss-Button; Import-Fortschrittsanzeige mit Counter.

---

## 2. UX-Copy: Vorher/Nachher

Konkrete Code-Stellen mit aktueller und vorgeschlagener Formulierung. Stilrichtung: aktiv, kurz, freundlich-professionell, ohne gespielte Lockerheit.

| Bereich | Datei | Vorher | Nachher |
|---|---|---|---|
| Sidebar | `Sidebar.jsx` | "Zusatz" mit ➕-Icon | "Team & Projekte" — Sammelbereich für Stammteam, Projekt-Stammdaten, Drehkalender. |
| Sidebar | `Sidebar.jsx` | "Erstellen" als Nav-Eintrag | Aus der Hauptnav entfernen. Stattdessen oben rechts: "+ Neuer Stundenzettel" als Primärbutton. |
| Sidebar | `Sidebar.jsx` | "PDF importieren" / "Ordner importieren" als zwei separate Buttons | Ein Button "PDFs importieren" mit Dropdown: Datei wählen / Ordner wählen / per Drag-and-Drop ablegen. |
| Sidebar | `Sidebar.jsx` | "Arbeitszeitverwaltung" (Subtitle) | Ersatzlos streichen oder durch Projekt-Kontext ersetzen ("Aktiv: Frier & 50 · KW 18"). |
| Onboarding | `OnboardingTour.jsx` | "Willkommen bei ZeitBlick! Deine App für Arbeitszeitverwaltung nach TV-FFS — Stundenzettel erstellen, importieren, auswerten und exportieren. Lass uns eine kurze Tour machen!" | "Willkommen. ZeitBlick rechnet TV-FFS-Stundenzettel für dich aus. In drei Schritten zeigen wir dir das Wichtigste." |
| Onboarding | `OnboardingTour.jsx` | "Starten! 🎉" | "Loslegen" |
| Onboarding | `OnboardingTour.jsx` | "Überspringen" | Beibehalten — aber als sekundäre Text-Action stylen, nicht als Button. |
| Import-Toast | `App.jsx` | "Import fehlgeschlagen" | "Import abgebrochen — keine Datei konnte gelesen werden. Details ansehen ↗" |
| Import-Toast | `App.jsx` | "3 importiert, 1 Duplikate übersprungen, 2 fehlgeschlagen: a.pdf, b.pdf" | "3 Stundenzettel importiert. 1 Duplikat übersprungen. 2 konnten nicht gelesen werden — anzeigen?" |
| Save-Error | `App.jsx` | "⚠ Speicherfehler: \<error\>" | "Konnte nicht speichern. Letzte Änderung wird beim nächsten Versuch erneut gesichert. (Details)" |
| Empty-State Suche | `App.jsx` | "Keine Ergebnisse für „\<query\>"" | "Nichts gefunden. Tipp: Suche nach Name, Projektnummer oder KW (z.B. \"KW 18\")." |
| Drag-and-Drop | `ImportOverlay.jsx` | Generische "Hier ablegen"-Anzeige | "PDFs hier ablegen — wir lesen Stunden, Datum und Person automatisch aus." |
| Confirm-Delete | `TimesheetList.jsx` | "Wirklich löschen?" | "Stundenzettel von Anna Becker (KW 18) in Papierkorb verschieben? Du kannst es mit ⌘Z rückgängig machen." |
| Bulk-Delete | `TimesheetList.jsx` | "Alle 12 Einträge" | "Alle 12 Stundenzettel aus „Frier & 50" in den Papierkorb verschieben" |
| Empty-State Liste | `TimesheetList.jsx` | (generisch) | "Noch keine Stundenzettel. Importiere PDFs oder erstelle einen neuen Stundenzettel." |
| Empty-State Dashboard | `Dashboard.jsx` | "Keine Daten" | "Sobald du Stundenzettel anlegst oder importierst, siehst du hier Stunden, Überstunden und Verdienst nach TV-FFS." |
| Settings — Gage | `Settings.jsx` | "Tagesgage" | "Tagesgage" beibehalten. Helfer-Text darunter: "Brutto pro 12-Stunden-Tag laut Vertrag. Wir multiplizieren mit Anstellungstagen." |
| Settings — Zeitkonto | `Settings.jsx` | "Zeitkonto" | "Zeitkonto aktivieren". Helfer-Text: "Überstunden werden auf das Zeitkonto gebucht statt sofort ausbezahlt (TV-FFS Anlage A.1.1)." |
| Tour Schritt 4 | `OnboardingTour.jsx` | "Verwalte das Stammteam per Drag & Drop und sieh Zusatztage ein." | "Du siehst Stunden, Verdienst und Urlaub auf einen Blick. Filter rechts oben." |
| Schnellsuche-Placeholder | `App.jsx` | "Name, Projekt, KW oder Datum suchen…" | "Suche: Person, Projekt, KW (z.B. \"KW 18\") oder Datum" |

### Stil-Prinzipien für ZeitBlick-Texte

- Verb statt Substantiv. Buttons heißen "Importieren", nicht "Import".
- Konkretes Subjekt statt "Eintrag". "Stundenzettel von Anna" statt "Eintrag".
- Fehler erklären, was passiert ist und was als Nächstes passiert. Niemals nur den Error-Code.
- Fachbegriffe (TV-FFS, AZV, TZ 5.x.x) nur mit Tooltip oder Hover-Erklärung verwenden.
- Keine Emojis in Erfolgsmeldungen. Keine Ausrufezeichen außer in echten Warnungen.

---

## 3. Redesign-Konzept (Modern / Freundlich)

Im Workspace liegt zusätzlich `ZeitBlick-Redesign-Mockup.html`. Datei doppelklicken — sie öffnet sich im Browser. Dieses Kapitel beschreibt die Designentscheidungen, die du dort siehst.

### 3.1 Designprinzipien

- Datendichte vor Dekoration: Stunden und Verdienst sind wichtiger als Hintergrundeffekte.
- Eine Primärfarbe (Indigo), eine Akzentfarbe (Mint für positive Werte), Rot nur für Destruktives.
- Drei Grautöne plus eine warme weiße Hintergrundfläche (`#FAFAF7`) statt fünf bläuliche Töne.
- Icons aus einem konsistenten Set (Lucide-Stil), 1.5 px Strichbreite, monochrom.
- Typografie: Inter Variable, Skala 12 / 13 / 15 / 18 / 24 / 32; tabular-numerals erzwungen.
- Subtile Mikrointeraktionen: 120 ms Easing, kein Bouncing, kein Glassmorphismus.

### 3.2 Layout-Architektur

**Drei-Säulen-Layout** statt Sidebar + Inhalt. Schmale linke Navigation (60 px, nur Icons + Tooltips), kontextueller Filterbereich (200 px, ein-/ausklappbar), Hauptbereich (rest).

- Topbar mit Brand, globaler Suche (immer sichtbar), Notification-Glocke, Account-Avatar.
- Primäre Aktionen ("+ Neuer Stundenzettel", "Importieren") sind oben rechts in der Topbar.
- Bei aktiven Filtern erscheint eine Filter-Chip-Leiste unter der Topbar — nie unsichtbar gefiltert.

### 3.3 Farbsystem

| Token | Hex | Verwendung |
|---|---|---|
| Primary / Indigo 600 | `#4F46E5` | Aktive Navigation, Primärbuttons, Links. |
| Accent / Mint 500 | `#22C58F` | Positive Werte, Verdienstbeträge, Erfolg. |
| Warning / Amber 500 | `#F59E0B` | Hinweise, fast vollendete Importe. |
| Danger / Rose 600 | `#E11D48` | Destruktive Aktionen, Fehler, Überstunden-Übergrenze. |
| Ink / Neutral 900 | `#0F1115` | Primärtext, Headlines. |
| Muted / Neutral 500 | `#6B7280` | Sekundärtext, Hilfstexte. |
| Surface / Warm 50 | `#FAFAF7` | Seitenhintergrund (statt `#0a0a0f`-Schwarz). |
| Card / White | `#FFFFFF` | Kartenflächen, Modale. |
| Border / Neutral 200 | `#E5E7EB` | Trennlinien, Eingabefelder. |

### 3.4 Komponentenkonzept

**Sidebar (links).** 60 px breit, vertikal gestapelte Icon-Buttons mit Tooltip beim Hover. Aktiver Eintrag: linke 3 px Indigo-Bar plus Indigo-Icon. Kein Hintergrund-Glow. Sektionen: Übersicht, Stundenzettel, Team, Projekte, Einstellungen. "Erstellen" und "Importieren" wandern in die Topbar.

**Topbar.** 48 px hoch, weiß, 1 px Border-Bottom. Links: ZeitBlick-Logo (Wortmark, 14 px Bold). Mitte: globale Suche, 380 px breit, immer sichtbar (kein Modal mehr). Rechts: Importieren (Sekundärbutton), + Neuer Stundenzettel (Primärbutton), Avatar.

**Dashboard / KPI-Karten.** Viertel-Grid (4 Karten in einer Reihe), nicht 2×2-Boxen mit großen Lücken. Pro Karte: Label (12 px Muted), Wert (32 px Bold, tabular), Veränderung (kleine Pfeil-Icon plus Mint/Rose). Unter den KPIs: Wochen-Tabelle als Hauptcontent. Keine versteckten Akkordeons.

**Stundenzettel-Liste.** Tabelle statt Karten. Sticky Header. Spalten: Person, Projekt, KW, Tage, Stunden, Verdienst, Aktionen. Personenfilter und Projektfilter als Chip-Leiste über der Tabelle, nicht in der Sidebar. Bulk-Selection per Checkbox-Spalte. Bulk-Action-Bar erscheint sticky unten, wenn etwas ausgewählt ist.

**Stundenzettel-Detail.** Master-Detail-Layout: Liste links (240 px), Detail rechts. Pfeiltasten navigieren. Tagesübersicht als kompakte Tabelle, nicht als gestapelte Karten. Inline-Edit der Stunden, Save automatisch (debounced wie aktuell, aber sichtbar via "Gespeichert" Mikrolabel).

**Modale & Toasts.** Modal-Primitive: Header, Body, Footer mit Buttons rechts. Esc und Backdrop-Click schließt. Erstes fokusbares Element: Eingabe oder Cancel. Toast-Position: oben rechts, gestapelt, persistent bis manuell geschlossen oder Timeout (10 s) für reine Erfolgsmeldungen. Destruktive Toasts (Fehler) haben einen "Details ansehen"-Link, der ein Modal mit Stack-Trace öffnet.

### 3.5 Implementierungs-Roadmap

- **Phase 1 — Tokens & Typografie (1–2 Tage).** Inter einbinden, CSS-Variablen-Set ersetzen, Lucide-Icons importieren. Sichtbarer Effekt sofort.
- **Phase 2 — Layout-Shell (2–3 Tage).** Topbar einführen, Sidebar auf 60 px schmälern, Filter-Chip-Leiste bauen.
- **Phase 3 — Komponenten-System (3–5 Tage).** Button, Input, Modal, Toast als wiederverwendbare React-Komponenten extrahieren.
- **Phase 4 — Dashboard- und Listen-Refactor (3–5 Tage).** KPI-Karten neu, Wochen-Tabelle virtualisiert.
- **Phase 5 — Onboarding kürzen, UX-Copy live ziehen, Accessibility-Pass (2 Tage).**

### 3.6 Was im Mockup zu sehen ist

- Linke Schmal-Sidebar mit Lucide-Icons.
- Topbar mit Branding, Suche, Aktionen.
- Dashboard mit 4 KPI-Karten und Wochenverdienst-Tabelle.
- Light- und Dark-Mode (Toggle oben rechts).
- Beispiel-Toast und Beispiel-Empty-State.

Die Datei ist statisches HTML/CSS — bewusst kein React, damit du sie direkt im Browser öffnen kannst. Die Klassennamen und CSS-Variablen sind so benannt, dass sie 1:1 in dein React-Projekt übernommen werden können.

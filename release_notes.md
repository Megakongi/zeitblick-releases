## ZeitBlick v1.3.16

### Upgrade
- Electron 28 → 35, electron-builder 24 → 26, Vite 5.4, plugin-react 4.7

### Sicherheit
- HTML-Escaping im PDF-Export
- Symlink-Traversal-Schutz beim Ordner-Import
- Import-Validierung für PDF-Daten

### Performance
- Batch-PDF-Export: einzelnes Fenster statt eines pro PDF
- useMemo für TV-FFS-Berechnungen

### Code-Qualität
- TV-FFS Magic Numbers → benannte Konstanten mit Tarifvertrag-Referenzen
- Shared calcNightHours/overlapHours Modul
- React Context API (FilterContext, SettingsContext)
- Error Boundaries pro Sektion

### UX
- Export-Loading-State im Dashboard
- Nachtschicht-Warnung bei Ende < Start
- Suchergebnisse: Limit 50 + Hinweis

### Robustheit
- Backup-Löschung mit Error Handling
- localStorage try-catch in UpdateOverlay

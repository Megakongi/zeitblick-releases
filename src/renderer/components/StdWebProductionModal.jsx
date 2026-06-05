import React, { useState, useEffect, useRef } from 'react';

/**
 * Kleiner Dialog zur Eingabe der StdWeb-Produktion (Ersatz für window.prompt,
 * das Electron nicht unterstützt). Merkt sich den letzten Wert in localStorage.
 *
 * Props:
 *  open         – sichtbar?
 *  projectName  – Projektname (für Default + Anzeige)
 *  onConfirm(production)
 *  onCancel()
 */
export default function StdWebProductionModal({ open, projectName, onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let last = '';
    try { last = localStorage.getItem('stdwebLastProduction') || ''; } catch (_) {}
    setVal(last || projectName || '');
    setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, 30);
  }, [open, projectName]);

  if (!open) return null;

  const confirm = () => {
    const p = (val || '').trim();
    try { localStorage.setItem('stdwebLastProduction', p); } catch (_) {}
    onConfirm(p);
  };

  return (
    <div className="dispo-viewer-overlay" onClick={onCancel}>
      <div className="stdweb-prod-modal" onClick={e => e.stopPropagation()}>
        <h3 className="stdweb-prod-title">StdWeb-Produktion</h3>
        <p className="settings-description">
          Exakt wie im StdWeb-Login{projectName ? ` für „${projectName}"` : ''} (z. B. „Doll Film – ROLAND").
        </p>
        <input
          ref={inputRef}
          type="text"
          className="stdweb-prod-input"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onCancel(); }}
          placeholder="StdWeb-Produktionsname"
        />
        <div className="stdweb-prod-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="btn btn-primary" onClick={confirm}>Übertragen</button>
        </div>
      </div>
    </div>
  );
}

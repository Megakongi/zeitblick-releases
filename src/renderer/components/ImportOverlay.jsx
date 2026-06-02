import React from 'react';

export default function ImportOverlay() {
  return (
    <div className="drag-overlay">
      <div className="drag-content">
        <div className="drag-icon" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <h2>PDFs hier ablegen</h2>
        <p>Wir lesen Stunden, Datum und Person automatisch aus.</p>
      </div>
    </div>
  );
}

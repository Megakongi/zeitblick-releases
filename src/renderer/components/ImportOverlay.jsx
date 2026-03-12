import React from 'react';

export default function ImportOverlay() {
  return (
    <div className="drag-overlay">
      <div className="drag-content">
        <div className="drag-icon">📄</div>
        <h2>PDF-Dateien ablegen</h2>
        <p>Lasse die PDF-Dateien los, um sie zu importieren</p>
      </div>
    </div>
  );
}

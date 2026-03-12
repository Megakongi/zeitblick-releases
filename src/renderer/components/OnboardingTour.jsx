import React, { useState, useEffect, useCallback, useRef } from 'react';

const TOUR_STEPS = [
  {
    target: null,
    title: 'Willkommen bei ZeitBlick 1.1!',
    description: 'Deine App für Arbeitszeitverwaltung nach TV-FFS — Stundenzettel erstellen, importieren, auswerten und exportieren. Lass uns eine kurze Tour machen!',
    icon: '👋',
    position: 'center',
  },
  {
    target: '.sidebar',
    title: 'Navigation',
    description: 'Über die Seitenleiste navigierst du zwischen Übersicht, Einträgen, Erstellen und Einstellungen.',
    icon: '🧭',
    position: 'right',
  },
  {
    target: '.nav-item:nth-child(1)',
    title: 'Übersicht / Dashboard',
    description: 'Deine Gesamtauswertung: Arbeitstage, AZV-Tage, Überstunden, Nacht-/Wochenend-/Feiertagszuschläge und Verdienst auf einen Blick.',
    icon: '📊',
    position: 'right',
  },
  {
    target: '.nav-item:nth-child(2)',
    title: 'Einträge-Liste',
    description: 'Alle Stundenzettel sortierbar nach Name, KW, Projekt oder Datum. Wähle einzelne oder ganze Kalenderwochen aus und exportiere sie als PDF.',
    icon: '📋',
    position: 'right',
  },
  {
    target: '.nav-item:nth-child(3)',
    title: 'Stundenzettel erstellen',
    description: 'Erstelle Stundenzettel direkt in der App — einzeln oder im Batch-Modus für ganze Crews. Überstunden, Nachtarbeit und Pausen werden automatisch berechnet.',
    icon: '✏️',
    position: 'right',
  },
  {
    target: '.nav-item:nth-child(4)',
    title: 'Einstellungen & Crews',
    description: 'Verwalte deine Gagen (Tages-, Wochen- und Positionsgagen), Name-Aliase und Crews. Crews lassen sich umbenennen und Mitglieder hinzufügen, bearbeiten oder entfernen.',
    icon: '⚙️',
    position: 'right',
  },
  {
    target: '.import-btn',
    title: 'PDF importieren',
    description: 'Importiere bestehende Stundenzettel als PDF — einzeln oder ganze Ordner. Du kannst auch Dateien per Drag & Drop auf die App ziehen!',
    icon: '📄',
    position: 'right',
  },
  {
    target: '.theme-toggle-btn',
    title: 'Design anpassen',
    description: 'Wechsle zwischen Dark- und Light-Mode — ganz nach deinem Geschmack.',
    icon: '🎨',
    position: 'right',
  },
  {
    target: null,
    title: 'Neu in Version 1.1',
    description: 'Stundenzettel erstellen & als PDF exportieren, Crew-Verwaltung mit Batch-Modus, automatische Berechnung nach TV-FFS, KW-basierter Export und AZV-Tage-Erkennung.',
    icon: '✨',
    position: 'center',
  },
  {
    target: null,
    title: 'Los geht\'s!',
    description: 'Du bist bereit! Importiere Stundenzettel, erstelle neue oder werte bestehende aus. Viel Spaß mit ZeitBlick!',
    icon: '🚀',
    position: 'center',
  },
];

export default function OnboardingTour({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef(null);

  const step = TOUR_STEPS[currentStep];

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Calculate target element position
  const updateTargetRect = useCallback(() => {
    if (!step.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        originalTop: rect.top,
        originalLeft: rect.left,
        originalWidth: rect.width,
        originalHeight: rect.height,
      });
    } else {
      setTargetRect(null);
    }
  }, [step.target]);

  useEffect(() => {
    setIsAnimating(true);
    updateTargetRect();
    const timer = setTimeout(() => setIsAnimating(false), 300);
    return () => clearTimeout(timer);
  }, [currentStep, updateTargetRect]);

  // Recalculate on resize
  useEffect(() => {
    window.addEventListener('resize', updateTargetRect);
    return () => window.removeEventListener('resize', updateTargetRect);
  }, [updateTargetRect]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleFinish();
    }
  }, [currentStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleFinish = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      localStorage.setItem('zeitblick-tour-completed', 'true');
      onComplete();
    }, 300);
  }, [onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'Escape') handleFinish();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleFinish]);

  // Tooltip position calculation
  const getTooltipStyle = () => {
    if (step.position === 'center' || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const tooltipWidth = 340;
    const tooltipHeight = 220;
    const gap = 16;

    let top = targetRect.originalTop + targetRect.originalHeight / 2 - tooltipHeight / 2;
    let left = targetRect.left + targetRect.width + gap;

    // Keep within viewport
    if (top < 20) top = 20;
    if (top + tooltipHeight > window.innerHeight - 20) {
      top = window.innerHeight - tooltipHeight - 20;
    }
    if (left + tooltipWidth > window.innerWidth - 20) {
      left = targetRect.left - tooltipWidth - gap;
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
    };
  };

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <div className={`tour-overlay ${isVisible ? 'tour-visible' : ''}`}>
      {/* SVG mask for spotlight effect */}
      <svg className="tour-spotlight-svg" width="100%" height="100%">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                ry="12"
                fill="black"
                className="tour-spotlight-cutout"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          className="tour-highlight-ring"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`tour-tooltip ${isAnimating ? 'tour-tooltip-animating' : ''} ${step.position === 'center' ? 'tour-tooltip-center' : ''}`}
        style={getTooltipStyle()}
      >
        <div className="tour-tooltip-icon">{step.icon}</div>
        <h3 className="tour-tooltip-title">{step.title}</h3>
        <p className="tour-tooltip-desc">{step.description}</p>

        {/* Progress dots */}
        <div className="tour-progress">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`tour-dot ${i === currentStep ? 'tour-dot-active' : ''} ${i < currentStep ? 'tour-dot-done' : ''}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="tour-actions">
          <button className="tour-btn tour-btn-skip" onClick={handleFinish}>
            {isLastStep ? '' : 'Überspringen'}
          </button>
          <div className="tour-actions-right">
            {!isFirstStep && (
              <button className="tour-btn tour-btn-prev" onClick={handlePrev}>
                ← Zurück
              </button>
            )}
            <button className="tour-btn tour-btn-next" onClick={handleNext}>
              {isLastStep ? 'Starten! 🎉' : 'Weiter →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

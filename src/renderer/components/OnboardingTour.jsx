import React, { useState, useEffect, useCallback, useRef } from 'react';

const TOUR_STEPS = [
  {
    target: null,
    title: 'Willkommen bei ZeitBlick',
    description: 'ZeitBlick verwaltet und berechnet TV-FFS-Stundenzettel für dein ganzes Team. Wir zeigen dir kurz das Wichtigste.',
    icon: '',
    position: 'center',
  },
  {
    target: '.app-topbar',
    title: 'Importieren oder neu anlegen',
    description: 'Oben rechts findest du „PDFs importieren" und „Neuer Stundenzettel". PDFs kannst du auch einfach per Drag-and-Drop ins Fenster ziehen.',
    icon: '',
    position: 'bottom',
  },
  {
    target: '.app-sidebar',
    title: 'Navigation',
    description: 'Über die Seitenleiste erreichst du die Übersicht, die Stundenzettel und „Team & Projekte". Mit ⌘K öffnest du die Schnellsuche.',
    icon: '',
    position: 'right',
  },
  {
    target: null,
    title: 'Team & Projekte',
    description: 'Unter „Team & Projekte" legst du Projekte an, stellst pro Projekt die Stammcrew zusammen (sie wird in den Stundenzetteln oben angezeigt) und verwaltest deine Personen.',
    icon: '',
    position: 'center',
  },
  {
    target: null,
    title: 'Stundenzettel auswerten',
    description: 'In der Übersicht siehst du Stunden, Überstunden und Verdienst. In der Stundenzettel-Liste sind die Personen pro Projekt zusammengeklappt — ein Klick auf den Pfeil öffnet sie. Export als PDF oder Excel.',
    icon: '',
    position: 'center',
  },
  {
    target: null,
    title: 'Automatisierung mit n8n (optional)',
    description: 'ZeitBlick kann Stundenzettel automatisch aus Dateien erzeugen, die ein n8n-Workflow in deinen iCloud-Ordner legt. n8n (n8n.io) ist ein Automatisierungs-Tool, das z. B. Dispo-Mails oder Tabellen in fertige Zeit-Dateien umwandelt. Du kannst das jetzt aktivieren oder später in den Einstellungen.',
    icon: '',
    position: 'center',
    n8nChoice: true,
  },
  {
    target: null,
    title: 'Los geht’s',
    description: 'Du bist startklar. Die Einführung findest du bei Bedarf wieder in den Einstellungen.',
    icon: '',
    position: 'center',
  },
];

export default function OnboardingTour({ onComplete, onEnableN8N }) {
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
        {step.n8nChoice ? (
          <div className="tour-actions">
            <button className="tour-btn tour-btn-skip" onClick={() => { onEnableN8N && onEnableN8N(false); handleNext(); }}>
              Später
            </button>
            <div className="tour-actions-right">
              {!isFirstStep && (
                <button className="tour-btn tour-btn-prev" onClick={handlePrev}>
                  ← Zurück
                </button>
              )}
              <button className="tour-btn tour-btn-next" onClick={() => { onEnableN8N && onEnableN8N(true); handleNext(); }}>
                n8n aktivieren →
              </button>
            </div>
          </div>
        ) : (
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
                {isLastStep ? 'Loslegen' : 'Weiter →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

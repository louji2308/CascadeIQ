import { useEffect, useState, useRef } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  onComplete: () => void;
}

const BOOT_LINES = [
  { text: 'INITIALIZING GRAPH INTELLIGENCE ENGINE…', delay: 0 },
  { text: 'NEO4J AURADB → HANDSHAKE ESTABLISHED', delay: 280 },
  { text: 'LOADING DISASTER CASCADE SCHEMA…', delay: 520 },
  { text: 'PATH-WEIGHTED CENTRALITY MODULE → READY', delay: 760 },
  { text: 'NASA FIRMS VIIRS SATELLITE FEED → ACTIVE', delay: 980 },
  { text: 'CASCADE PROPAGATION ANALYZER → ARMED', delay: 1180 },
  { text: 'RENDERING GRAPH INTELLIGENCE DASHBOARD…', delay: 1360 },
];

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [radarAngle, setRadarAngle] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      setRadarAngle((elapsed / 1800) * 360);
      setProgress(Math.min(100, (elapsed / 1900) * 100));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    BOOT_LINES.forEach((line, i) => {
      setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
      }, line.delay + 200);
    });

    const exitTimer = setTimeout(() => {
      setExiting(true);
      setTimeout(onComplete, 600);
    }, 2200);

    return () => clearTimeout(exitTimer);
  }, [onComplete]);

  return (
    <div className={`splash ${exiting ? 'splash--exit' : ''}`}>
      {/* Animated scanlines */}
      <div className="splash-scanlines" />

      {/* Radar */}
      <div className="splash-radar-wrap">
        <div className="splash-radar">
          {/* Rings */}
          {[1, 0.67, 0.33].map((scale, i) => (
            <div key={i} className="radar-ring" style={{ transform: `scale(${scale})` }} />
          ))}
          {/* Cross hairs */}
          <div className="radar-crossh" />
          <div className="radar-crossv" />
          {/* Sweep */}
          <div
            className="radar-sweep"
            style={{ transform: `rotate(${radarAngle}deg)` }}
          />
          {/* Center dot */}
          <div className="radar-center" />
          {/* Blips */}
          <div className="radar-blip" style={{ top: '28%', left: '62%' }} />
          <div className="radar-blip" style={{ top: '55%', left: '38%' }} />
          <div className="radar-blip" style={{ top: '40%', left: '72%' }} />
          <div className="radar-blip" style={{ top: '70%', left: '55%' }} />
        </div>
      </div>

      {/* Logo */}
      <div className="splash-logo">
        <div className="splash-logo-mark">
          <svg viewBox="0 0 40 40" fill="none">
            <polygon points="20,2 38,35 2,35" fill="none" stroke="#FF5F1F" strokeWidth="1.5" />
            <polygon points="20,9 31,33 9,33" fill="rgba(255,95,31,0.06)" stroke="#FF5F1F" strokeWidth="0.5" />
            <circle cx="20" cy="24" r="3.5" fill="#FF5F1F" />
            <circle cx="20" cy="24" r="6" fill="none" stroke="rgba(255,95,31,0.3)" strokeWidth="1">
              <animate attributeName="r" values="3.5;8;3.5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
        <div>
          <div className="splash-title">CASCADE<span>IQ</span></div>
          <div className="splash-sub">DISASTER CASCADE INTELLIGENCE SYSTEM</div>
        </div>
      </div>

      {/* Boot log */}
      <div className="splash-log">
        {BOOT_LINES.map((line, i) => (
          <div
            key={i}
            className={`splash-log-line ${visibleLines.includes(i) ? 'visible' : ''}`}
          >
            <span className="log-prefix">
              {i === BOOT_LINES.length - 1 ? '✓' : '›'}
            </span>
            <span className="log-text">{line.text}</span>
            {i === BOOT_LINES.length - 1 && visibleLines.includes(i) && (
              <span className="log-ok">OK</span>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="splash-progress-wrap">
        <div className="splash-progress-bar">
          <div className="splash-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="splash-progress-pct">{Math.round(progress)}%</div>
      </div>

      {/* Corner deco */}
      <div className="splash-corner tl" />
      <div className="splash-corner tr" />
      <div className="splash-corner bl" />
      <div className="splash-corner br" />
    </div>
  );
}

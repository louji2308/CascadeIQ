import { useMemo } from 'react';
import './WindCompass.css';

interface WindCompassProps {
  windSpeedKmh: number;
  windDirectionDeg: number;
}

function bearingToCompassLabel(deg: number) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function WindCompass({ windSpeedKmh, windDirectionDeg }: WindCompassProps) {
  const cx = 100, cy = 100, r = 72;

  const cardinalLabels = useMemo(() => {
    return [
      { label: 'N', deg: 0 }, { label: 'NE', deg: 45 },
      { label: 'E', deg: 90 }, { label: 'SE', deg: 135 },
      { label: 'S', deg: 180 }, { label: 'SW', deg: 225 },
      { label: 'W', deg: 270 }, { label: 'NW', deg: 315 },
    ];
  }, []);

  const windArrowEnd = polarToCartesian(cx, cy, r - 8, windDirectionDeg);
  const windArrowStart = polarToCartesian(cx, cy, -(r * 0.35), windDirectionDeg + 180);

  return (
    <div className="wind-compass">
      <svg viewBox="0 0 200 200" className="wind-compass-svg">
        <defs>
          <radialGradient id="compass-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,95,31,0.08)" />
            <stop offset="100%" stopColor="rgba(255,95,31,0)" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={r} fill="url(#compass-glow)" stroke="rgba(255,95,31,0.12)" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={4} fill="#FF5F1F" opacity="0.6" />

        {cardinalLabels.map(c => {
          const pos = polarToCartesian(cx, cy, r + 14, c.deg);
          return (
            <text
              key={c.label}
              x={pos.x} y={pos.y}
              textAnchor="middle" dominantBaseline="central"
              className={`compass-cardinal ${c.label === 'N' ? 'compass-north' : ''}`}
              fontSize={c.label === 'N' ? 11 : 9}
            >
              {c.label}
            </text>
          );
        })}

        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
          const outer = polarToCartesian(cx, cy, r - 4, deg);
          const inner = polarToCartesian(cx, cy, r - 10, deg);
          return (
            <line
              key={deg}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={deg % 90 === 0 ? 1.5 : 0.5}
            />
          );
        })}

        {[30, 60, 120, 150, 210, 240, 300, 330].map(deg => {
          const outer = polarToCartesian(cx, cy, r - 4, deg);
          const inner = polarToCartesian(cx, cy, r - 7, deg);
          return (
            <line
              key={deg}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          );
        })}

        <line
          x1={windArrowStart.x} y1={windArrowStart.y}
          x2={windArrowEnd.x} y2={windArrowEnd.y}
          stroke="#FF5F1F"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.9"
        />
        <polygon
          points={`${windArrowEnd.x},${windArrowEnd.y - 6} ${windArrowEnd.x + 8},${windArrowEnd.y} ${windArrowEnd.x},${windArrowEnd.y + 6}`}
          fill="#FF5F1F"
          transform={`rotate(${windDirectionDeg - 90}, ${windArrowEnd.x}, ${windArrowEnd.y})`}
        />

        <text x={cx} y={cy - 4} textAnchor="middle" className="compass-fire-label">
          FIRE
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="compass-fire-label" style={{ fontSize: 7, opacity: 0.4 }}>
          ●
        </text>
      </svg>

      <div className="compass-data">
        <div className="compass-wind-row">
          <span className="compass-wind-label">WIND</span>
          <span className="compass-wind-value">{windSpeedKmh.toFixed(0)} km/h</span>
          <span className="compass-wind-dir">{windDirectionDeg}° {bearingToCompassLabel(windDirectionDeg)}</span>
        </div>
      </div>
    </div>
  );
}

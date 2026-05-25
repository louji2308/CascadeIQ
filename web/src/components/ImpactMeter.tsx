import { useState, useEffect, useRef, useCallback } from 'react';

interface ImpactMeterProps {
  baselineRiskScore: number;
  currentRiskScore: number;
  deaths: number;
  cascadeAttributionFactor: number;
  scenarioName: string;
  scenarioLocation: string;
  removedCount: number;
}

function computeLives(
  baselineRiskScore: number,
  currentRiskScore: number,
  deaths: number,
  cascadeAttributionFactor: number,
): { value: number; positive: boolean } {
  if (baselineRiskScore <= 0 || deaths <= 0) return { value: 0, positive: true };
  const riskReduction = (baselineRiskScore - currentRiskScore) / baselineRiskScore;
  const livesAtRisk = deaths * cascadeAttributionFactor;
  const raw = livesAtRisk * Math.abs(riskReduction);
  return {
    value: Math.round(raw),
    positive: riskReduction >= 0,
  };
}

function useAnimatedValue(target: number, duration: number): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const from = value;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}

export default function ImpactMeter({
  baselineRiskScore,
  currentRiskScore,
  deaths,
  cascadeAttributionFactor,
  scenarioName,
  scenarioLocation,
  removedCount,
}: ImpactMeterProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { value: rawValue, positive } = computeLives(
    baselineRiskScore, currentRiskScore, deaths, cascadeAttributionFactor,
  );

  const animatedValue = useAnimatedValue(rawValue, 600);

  const showTooltip = useCallback(() => {
    setTooltipVisible(true);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimer.current = setTimeout(() => setTooltipVisible(false), 200);
  }, []);

  useEffect(() => {
    return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
  }, []);

  // Neutral state: no nodes toggled
  if (removedCount === 0) {
    return (
      <div className="impact-meter impact-meter--neutral">
        <div className="impact-meter-icon">
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
            <path d="M8 4v4M8 10v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="impact-meter-neutral-text">TOGGLE SYSTEMS TO MODEL INTERVENTION IMPACT</span>
      </div>
    );
  }

  if (rawValue === 0 && baselineRiskScore === currentRiskScore) {
    return null;
  }

  const isPositive = positive && rawValue > 0;

  return (
    <div
      className={`impact-meter ${isPositive ? 'impact-meter--positive' : 'impact-meter--negative'}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onTouchStart={showTooltip}
      onTouchEnd={hideTooltip}
    >
      <div className="impact-meter-header">
        <span className="impact-meter-label">
          {isPositive ? 'LIVES POTENTIALLY SAVED' : 'LIVES AT ADDITIONAL RISK'}
        </span>
        <div className="impact-meter-info-icon" aria-label="More information">ⓘ</div>
      </div>

      <div className="impact-meter-value-wrap">
        <span className={`impact-meter-value ${isPositive ? 'impact-meter-value--green' : 'impact-meter-value--red'}`}>
          {isPositive ? '' : '+'}{animatedValue.toLocaleString()}
        </span>
      </div>

      <span className="impact-meter-subtext">
        {isPositive ? 'IN SIMILAR EVENT' : '— RESTORE SYSTEMS'}
      </span>

      <div className="impact-meter-disclaimer">
        Based on historical data from {scenarioName}. Model estimate only.
      </div>

      {tooltipVisible && (
        <div className="impact-meter-tooltip">
          This estimate models how many lives a similar intervention could have saved in {scenarioLocation}.
          It is calculated from the documented death toll multiplied by the estimated fraction
          attributable to cascade failures, scaled by your risk reduction percentage.
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import './ControlPanel.css';
import ImpactMeter from './ImpactMeter';

interface CascadeNode {
  id: string;
  name: string;
  label: string;
  severity?: number;
  type?: string;
}

interface ControlPanelProps {
  removedNodes: string[];
  setRemovedNodes: (nodes: string[]) => void;
  availableNodes: CascadeNode[];
  riskScore?: number;
  baselineRiskScore?: number;
  deaths?: number;
  scenarioName?: string;
  scenarioLocation?: string;
  cascadeAttributionFactor?: number;
}

const LABEL_META: Record<string, { icon: string; color: string; abbr: string }> = {
  Resource:       { icon: '🏥', color: '#E04545', abbr: 'RES' },
  Infrastructure: { icon: '🏭', color: '#3D8EF0', abbr: 'INF' },
};

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
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

function ThreatDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className="threat-delta"
      style={{ color: up ? 'var(--red)' : 'var(--green)' }}
      aria-label={`Risk ${up ? 'increases' : 'decreases'} by ${Math.abs(delta)}`}
    >
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
}

function NodeToggle({
  node,
  removed,
  onToggle,
  index,
}: {
  node: CascadeNode;
  removed: boolean;
  onToggle: () => void;
  index: number;
}) {
  const meta = LABEL_META[node.label] ?? { icon: '⚙', color: '#8888AA', abbr: '???' };

  return (
    <div
      className={`node-toggle ${removed ? 'node-toggle--removed' : ''}`}
      style={{ '--node-color': meta.color, '--delay': `${index * 60}ms` } as React.CSSProperties}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onToggle()}
      aria-pressed={removed}
    >
      {/* Left: type badge */}
      <div className="nt-badge" style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}40` }}>
        <span className="nt-abbr" style={{ color: meta.color }}>{meta.abbr}</span>
      </div>

      {/* Center: info */}
      <div className="nt-body">
        <span className="nt-name">{node.name}</span>
        <div className="nt-meta-row">
          <span className="nt-icon">{meta.icon}</span>
          <span className="nt-type">{node.label}</span>
          {node.severity != null && (
            <span className="nt-sev">SEV {node.severity}/10</span>
          )}
        </div>
      </div>

      {/* Right: custom toggle switch */}
      <div className={`nt-switch ${removed ? 'nt-switch--off' : 'nt-switch--on'}`}>
        <div className="nt-switch-track">
          <div className="nt-switch-thumb" />
        </div>
        <span className="nt-switch-label">{removed ? 'OFFLINE' : 'ONLINE'}</span>
      </div>
    </div>
  );
}

function SystemMatrix({ total, removed }: { total: number; removed: number }) {
  const online = total - removed;
  const pct = total > 0 ? (online / total) * 100 : 100;

  return (
    <div className="sys-matrix">
      <div className="sys-matrix-header">
        <span className="sys-matrix-label">SYSTEM INTEGRITY</span>
        <span
          className="sys-matrix-pct"
          style={{ color: pct < 50 ? 'var(--red)' : pct < 80 ? 'var(--amber)' : 'var(--green)' }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div className="sys-matrix-track">
        <div
          className="sys-matrix-fill"
          style={{
            width: `${pct}%`,
            background: pct < 50
              ? 'linear-gradient(90deg, #FF3D3D, #FF6060)'
              : pct < 80
              ? 'linear-gradient(90deg, #FFD740, #FFEB80)'
              : 'linear-gradient(90deg, #00E676, #69F0AE)',
          }}
        />
      </div>
      <div className="sys-matrix-counts">
        <span style={{ color: 'var(--green)' }}>▲ {online} ONLINE</span>
        <span style={{ color: removed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>▼ {removed} OFFLINE</span>
      </div>
    </div>
  );
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  removedNodes,
  setRemovedNodes,
  availableNodes,
  riskScore = 0,
  baselineRiskScore = 0,
  deaths = 0,
  scenarioName = '',
  scenarioLocation = '',
  cascadeAttributionFactor = 0.35,
}) => {
  const mitigable = availableNodes.filter(
    n => n.label === 'Resource' || n.label === 'Infrastructure'
  );

  const animatedRisk = useCountUp(riskScore, 900);
  const removedCount = removedNodes.length;

  const toggle = (nodeId: string) => {
    setRemovedNodes(
      removedNodes.includes(nodeId)
        ? removedNodes.filter(id => id !== nodeId)
        : [...removedNodes, nodeId]
    );
  };

  const resetAll = () => setRemovedNodes([]);

  // Estimated risk delta from removals (rough heuristic)
  const riskDelta = removedCount > 0 ? Math.min(removedCount * 12, 40) : 0;

  if (mitigable.length === 0) {
    return (
      <div className="control-panel control-panel--empty">
        <div className="cp-header">
          <div className="cp-header-left">
            <div className="cp-pulse" />
            <span className="cp-title">MITIGATION CONTROLS</span>
          </div>
        </div>
        <div className="cp-empty-state">
          <svg viewBox="0 0 40 40" fill="none" className="cp-empty-icon">
            <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            <path d="M14 20h12M20 14v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
          </svg>
          <p>SELECT A SCENARIO TO CONFIGURE MITIGATION OPTIONS</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`control-panel ${removedCount > 0 ? 'control-panel--active' : ''}`}>
      {/* ── HEADER ── */}
      <div className="cp-header">
        <div className="cp-header-left">
          <div className={`cp-pulse ${removedCount > 0 ? 'cp-pulse--alert' : ''}`} />
          <span className="cp-title">MITIGATION CONTROLS</span>
        </div>
        {removedCount > 0 && (
          <button className="cp-reset-btn" onClick={resetAll} title="Restore all systems">
            ↺ RESET
          </button>
        )}
      </div>

      {/* ── RISK DELTA BANNER (when systems removed) ── */}
      {removedCount > 0 && (
        <div className="cp-alert-banner">
          <span className="cp-alert-icon">⚠</span>
          <span className="cp-alert-text">
            {removedCount} SYSTEM{removedCount > 1 ? 'S' : ''} OFFLINE —
            PROJECTED RISK INCREASE
          </span>
          <ThreatDeltaBadge delta={riskDelta} />
        </div>
      )}

      {/* ── SYSTEM INTEGRITY MATRIX ── */}
      <SystemMatrix total={mitigable.length} removed={removedCount} />

      {/* ── IMPACT METER ── */}
      <ImpactMeter
        baselineRiskScore={baselineRiskScore}
        currentRiskScore={riskScore}
        deaths={deaths}
        cascadeAttributionFactor={cascadeAttributionFactor}
        scenarioName={scenarioName}
        scenarioLocation={scenarioLocation}
        removedCount={removedCount}
      />

      <div className="cp-risk-readout">
        <span>LIVE RISK INDEX</span>
        <strong>{animatedRisk}</strong>
      </div>

      {/* ── NODE TOGGLES ── */}
      <div className="cp-divider">
        <span>MITIGABLE SYSTEMS</span>
      </div>

      <div className="cp-toggle-list">
        {mitigable.map((node, i) => (
          <NodeToggle
            key={node.id}
            node={node}
            removed={removedNodes.includes(node.id)}
            onToggle={() => toggle(node.id)}
            index={i}
          />
        ))}
      </div>

      {/* ── FOOTER NOTE ── */}
      <div className="cp-footer-note">
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 5.5V8.5M6 3.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span>Disabling systems reveals cascading failure paths and recalculates risk score in real-time</span>
      </div>
    </div>
  );
};

export default ControlPanel;

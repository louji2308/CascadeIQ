import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Scenario {
  id: string;
  name: string;
  year: number;
  location: string;
  deaths: number;
  damage_usd?: number;
  description?: string;
}

interface CascadeNode {
  id: string;
  name: string;
  label: string;
  severity?: number;
}

interface CascadeEdge {
  from: string;
  to: string;
  type: string;
  prob: number;
  delay_hrs: number;
  mechanism: string;
}

interface CascadePath {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  depth: number;
  probability_pct: number;
  hours_to_end: number;
}

interface CascadeData {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  riskScore: number;
  paths: CascadePath[];
}

interface NeoInt {
  low: number;
}

interface ScenarioRecord extends Omit<Scenario, 'year' | 'deaths'> {
  year: number | NeoInt;
  deaths: number | NeoInt;
}

interface ScenarioResponse {
  data: ScenarioRecord[];
}

interface ScenarioNodeRecord {
  node?: CascadeNode;
  edge?: CascadeEdge | null;
}

interface ScenarioNodeResponse {
  data: ScenarioNodeRecord[];
}

interface CascadeResponse {
  paths?: CascadePath[];
  riskScore?: number;
}

const NODE_COLORS: Record<string, string> = {
  Hazard: '#FF5F1F',
  Infrastructure: '#3D8EF0',
  Resource: '#E04545',
  Failure: '#8B0000',
  Event: '#F4A020',
};

function getRiskColor(score: number) {
  if (score < 40) return '#00E676';
  if (score < 65) return '#FFD740';
  if (score < 85) return '#FF9800';
  return '#FF3D3D';
}

function getRiskLevel(score: number) {
  if (score < 40) return 'LOW';
  if (score < 65) return 'MODERATE';
  if (score < 85) return 'HIGH';
  return 'CRITICAL';
}

function buildArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

// Circumference of arc (180° = π*r)
const ARC_LEN = Math.PI * 80; // r=80 half circle

function RiskGauge({ score }: { score: number }) {
  const color = getRiskColor(score);
  const level = getRiskLevel(score);
  const fillLen = (score / 100) * ARC_LEN;
  const offset = ARC_LEN - fillLen;
  const bgPath = buildArcPath(90, 90, 80, 180, 360);
  const fillPath = buildArcPath(90, 90, 80, 180, 360);

  const levelColors: Record<string, string> = {
    LOW: 'rgba(0,230,118,0.15)',
    MODERATE: 'rgba(255,215,64,0.15)',
    HIGH: 'rgba(255,152,0,0.15)',
    CRITICAL: 'rgba(255,61,61,0.15)',
  };

  return (
    <div className="risk-gauge-wrap">
      <svg className="risk-gauge-svg" viewBox="0 0 180 100">
        {/* Background arc */}
        <path d={bgPath} className="risk-arc-bg" />
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const angle = 180 + (pct / 100) * 180;
          const rad = (angle * Math.PI) / 180;
          const x1 = 90 + 72 * Math.cos(rad);
          const y1 = 90 + 72 * Math.sin(rad);
          const x2 = 90 + 80 * Math.cos(rad);
          const y2 = 90 + 80 * Math.sin(rad);
          return (
            <line key={pct} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          );
        })}
        {/* Fill arc */}
        <path d={fillPath}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1), stroke 0.6s ease' }}
        />
        {/* Glow layer */}
        <path d={fillPath}
          stroke={color}
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN}`}
          strokeDashoffset={offset}
          opacity="0.15"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text x="90" y="80" className="risk-num" style={{ fill: color }}>{score}</text>
        <text x="90" y="95" className="risk-label-svg">RISK INDEX</text>
      </svg>
      <div className="risk-level-badge" style={{
        color,
        background: levelColors[level] || 'transparent',
        border: `1px solid ${color}40`,
      }}>{level}</div>
    </div>
  );
}

function SysClock() {
  const [time, setTime] = useState(() => new Date().toISOString().replace('T', ' ').slice(0, 19));
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toISOString().replace('T', ' ').slice(0, 19));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="sys-clock">{time} UTC</span>;
}

function asNumber(value: number | NeoInt) {
  return typeof value === 'object' ? value.low : value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'FETCH ERROR';
}

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [cascadeData, setCascadeData] = useState<CascadeData | null>(null);
  const [removedNodes, setRemovedNodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<CascadeNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<number>(0);
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState(-1);
  const selectedScenario = useMemo(
    () => scenarios.find(s => s.id === selectedId) || null,
    [scenarios, selectedId],
  );

  const fetchCascade = useCallback(async (scenarioId: string, removed: string[]) => {
    setLoading(true);
    setError(null);
    setCascadeData(null);

    try {
      if (scenarioId === 'live_wildfires_satellite') {
        await axios.get(`${API_BASE}/api/realtime/wildfires`);
      }

      const scenRes = await axios.get<ScenarioNodeResponse>(`${API_BASE}/api/scenarios/${scenarioId}`);
      const records = scenRes.data.data;
      const hazardRec = records.find(r => r.node?.label === 'Hazard');
      if (!hazardRec?.node) throw new Error('No hazard node found');

      const hazardId = hazardRec.node.id;
      const cascRes = await axios.get<CascadeResponse>(`${API_BASE}/api/cascade/${hazardId}`, {
        params: { removed: removed.join(',') },
      });

      const paths: CascadePath[] = cascRes.data.paths || [];
      const nodeMap = new Map<string, CascadeNode>();
      const edgeMap = new Map<string, CascadeEdge>();

      records.forEach((r) => {
        if (r.node && !nodeMap.has(r.node.id)) nodeMap.set(r.node.id, r.node);
        if (r.edge) {
          const k = `${r.edge.from}->${r.edge.to}`;
          if (!edgeMap.has(k)) edgeMap.set(k, r.edge);
        }
      });

      paths.forEach((p) => {
        (p.nodes || []).forEach((n: CascadeNode) => {
          if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
        });
        (p.edges || []).forEach((e: CascadeEdge) => {
          const k = `${e.from}->${e.to}`;
          if (!edgeMap.has(k)) edgeMap.set(k, e);
        });
      });

      setCascadeData({
        nodes: Array.from(nodeMap.values()),
        edges: Array.from(edgeMap.values()),
        riskScore: cascRes.data.riskScore || 0,
        paths,
      });
      setSelectedPath(0);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    axios.get<ScenarioResponse>(`${API_BASE}/api/scenarios`)
      .then(res => {
        const data = res.data.data.map((s): Scenario => ({
          ...s,
          year: asNumber(s.year),
          deaths: asNumber(s.deaths),
        }));
        setScenarios(data);
      })
      .catch(() => setError('NEO4J CONNECTION FAILED'));
  }, []);

  const toggleNode = (nodeId: string) => {
    const next = removedNodes.includes(nodeId)
      ? removedNodes.filter(id => id !== nodeId)
      : [...removedNodes, nodeId];
    setRemovedNodes(next);
    if (selectedId) fetchCascade(selectedId, next);
  };

  const handleScenarioSelect = (scenarioId: string) => {
    setSelectedId(scenarioId);
    setRemovedNodes([]);
    setSelectedNode(null);
    setSimStep(-1);
    setSimRunning(false);
    setCascadeData(null);
    if (scenarioId) fetchCascade(scenarioId, []);
  };

  const runSimulation = () => {
    if (!cascadeData || simRunning) return;
    setSimRunning(true);
    setSimStep(0);
    const path = cascadeData.paths[selectedPath];
    if (!path) { setSimRunning(false); return; }

    path.nodes.forEach((_, i) => {
      setTimeout(() => {
        setSimStep(i);
        if (i === path.nodes.length - 1) {
          setTimeout(() => setSimRunning(false), 600);
        }
      }, path.nodes.slice(0, i).reduce((acc, __, j) =>
        acc + (j === 0 ? 0 : (path.edges[j - 1]?.delay_hrs || 1) * 500), 0));
    });
  };

  const mitigable = cascadeData?.nodes.filter(
    n => n.label === 'Resource' || n.label === 'Infrastructure'
  ) || [];

  const activePath = cascadeData?.paths[selectedPath];

  return (
    <div className="dashboard">
      {/* ── HEADER ── */}
      <header className="dash-header">
        <div className="header-logo">
          <div className="logo-mark">
            <svg viewBox="0 0 32 32" fill="none">
              <polygon points="16,2 30,28 2,28" fill="none" stroke="#FF5F1F" strokeWidth="1.5" />
              <polygon points="16,8 25,26 7,26" fill="rgba(255,95,31,0.08)" stroke="#FF5F1F" strokeWidth="0.5" />
              <circle cx="16" cy="18" r="3" fill="#FF5F1F" />
            </svg>
          </div>
          <div>
            <div className="logo-text">CASCADE<span>IQ</span></div>
            <div className="logo-sub">DISASTER CASCADE INTELLIGENCE</div>
          </div>
        </div>

        <div className="header-center">
          <div className="sys-status">
            <span className={`status-dot ${error ? 'alert' : ''}`} />
            {error ? 'SYSTEM FAULT' : 'NEO4J CONNECTED'}
          </div>
          <div className="sys-status">
            <span className="status-dot" />
            {cascadeData ? `${cascadeData.nodes.length} NODES MAPPED` : 'AWAITING TARGET'}
          </div>
        </div>

        <div className="header-right">
          <SysClock />
          <div className="threat-level">
            THREAT&nbsp;
            <span className="tl-value" style={{ color: cascadeData ? getRiskColor(cascadeData.riskScore) : undefined }}>
              {cascadeData ? getRiskLevel(cascadeData.riskScore) : '—'}
            </span>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="dash-body">

        {/* ── LEFT PANEL ── */}
        <div className="left-panel">
          {/* Scenario Selector */}
          <div className="panel-block">
            <div className="panel-label">TARGET SCENARIO</div>
            <div className="scenario-select-wrap">
              <select value={selectedId} onChange={e => handleScenarioSelect(e.target.value)}>
                <option value="">— SELECT DISASTER EVENT —</option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} [{s.year}]
                  </option>
                ))}
              </select>
            </div>
            {selectedScenario && (
              <div className="scenario-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div className="scenario-card-name">{selectedScenario.name}</div>
                  {selectedScenario.id === 'live_wildfires_satellite' && (
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      padding: '2px 7px',
                      background: 'rgba(255,61,61,0.15)',
                      border: '1px solid rgba(255,61,61,0.4)',
                      borderRadius: 2,
                      color: '#FF3D3D',
                      letterSpacing: 1.5,
                      animation: 'blink 1.5s step-end infinite'
                    }}>● LIVE</span>
                  )}
                </div>
                <div className="scenario-card-loc">{selectedScenario.location}</div>
                <div className="stat-grid">
                  <div className="stat-item">
                    <div className="stat-val">{selectedScenario.deaths?.toLocaleString()}</div>
                    <div className="stat-lbl">Casualties</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-val">{selectedScenario.year}</div>
                    <div className="stat-lbl">Year</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* System Indicators */}
          <div className="panel-block">
            <div className="panel-label">SYSTEM STATUS</div>
            <div className="sys-indicators">
              {[
                { label: 'GRAPH DEPTH', val: cascadeData ? Math.max(...cascadeData.paths.map(p => p.depth), 0) * 10 : 0, unit: cascadeData ? `${Math.max(...cascadeData.paths.map(p => p.depth), 0)} HOPS` : '—', color: '#FF5F1F' },
                { label: 'CASCADE PATHS', val: cascadeData ? Math.min(cascadeData.paths.length * 6.5, 100) : 0, unit: cascadeData ? `${cascadeData.paths.length} PATHS` : '—', color: '#00CFFF' },
                { label: 'NODE DENSITY', val: cascadeData ? Math.min(cascadeData.nodes.length * 12, 100) : 0, unit: cascadeData ? `${cascadeData.nodes.length} NODES` : '—', color: '#A78BFA' },
                { label: 'RISK INDEX', val: cascadeData?.riskScore || 0, unit: cascadeData ? `${cascadeData.riskScore}/100` : '—', color: cascadeData ? getRiskColor(cascadeData.riskScore) : '#3D4F66' },
              ].map(({ label, val, unit, color }) => (
                <div key={label} className="sys-indicator">
                  <span>{label}</span>
                  <div className="sys-indicator-bar">
                    <div className="sys-indicator-fill" style={{ width: `${val}%`, background: color }} />
                  </div>
                  <span style={{ color, minWidth: 60, textAlign: 'right' }}>{unit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mitigation Controls */}
          <div className="panel-block grow">
            <div className="panel-label">MITIGATION CONTROLS</div>
            {mitigable.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1 }}>
                SELECT SCENARIO TO CONFIGURE
              </div>
            ) : (
              <div className="control-list">
                {mitigable.map(node => {
                  const removed = removedNodes.includes(node.id);
                  return (
                    <label key={node.id} className={`control-item ${removed ? 'checked' : ''}`}>
                      <input type="checkbox" className="control-checkbox"
                        checked={removed} onChange={() => toggleNode(node.id)} />
                      <div className="control-item-info">
                        <div className="control-item-name">{node.name}</div>
                        <div className="control-item-type">{node.label}</div>
                      </div>
                      {removed && <span className="impact-badge">REMOVED</span>}
                    </label>
                  );
                })}
                {removedNodes.length > 0 && (
                  <div style={{ padding: '8px', background: 'rgba(255,61,61,0.06)', border: '1px solid rgba(255,61,61,0.2)', borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', letterSpacing: 1 }}>
                    ⚠ {removedNodes.length} SYSTEM{removedNodes.length > 1 ? 'S' : ''} OFFLINE — RISK RECALCULATED
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER PANEL ── */}
        <div className="center-panel">
          <div className="graph-header">
            <span className="graph-title">◈ CASCADE PROPAGATION GRAPH</span>
            <div className="graph-meta">
              {[
                { color: '#FF5F1F', label: 'Hazard' },
                { color: '#3D8EF0', label: 'Infrastructure' },
                { color: '#E04545', label: 'Resource' },
                { color: '#F4A020', label: 'Event' },
                { color: '#8B0000', label: 'Failure' },
              ].map(({ color, label }) => (
                <div key={label} className="graph-meta-item">
                  <div className="graph-meta-dot" style={{ background: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="graph-wrap">
            <div className="graph-corner tl" />
            <div className="graph-corner tr" />
            <div className="graph-corner bl" />
            <div className="graph-corner br" />

            {loading ? (
              <div className="loading-state">
                <div className="loading-ring" />
                <div className="loading-text">QUERYING NEO4J</div>
                <div className="loading-sub">TRAVERSING CASCADE GRAPH…</div>
              </div>
            ) : error ? (
              <div className="error-state">
                <div className="error-title">⚠ {error}</div>
                <div className="error-msg">Check API connection and Neo4j credentials</div>
              </div>
            ) : !cascadeData ? (
              <div className="empty-state">
                <svg className="empty-state-icon" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M14 24 L24 14 L34 24 L24 34 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <circle cx="24" cy="24" r="3" fill="currentColor" />
                </svg>
                <span>SELECT A DISASTER SCENARIO</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>GRAPH WILL RENDER CASCADE PATHS</span>
              </div>
            ) : (
              <GraphView
                nodes={cascadeData.nodes}
                edges={cascadeData.edges}
                onNodeClick={setSelectedNode}
                highlightPath={simRunning && activePath ? activePath.nodes.slice(0, simStep + 1).map(n => n.id) : []}
              />
            )}

            {cascadeData && (
              <div className="graph-coords">
                {cascadeData.nodes.length} NODES · {cascadeData.edges.length} EDGES · {cascadeData.paths.length} PATHS
              </div>
            )}
          </div>

          <div className="graph-footer">
            <div className="legend">
              {Object.entries(NODE_COLORS).map(([label, color]) => (
                <div key={label} className="legend-item">
                  <div className="legend-dot" style={{ background: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <button
              className={`simulate-btn ${simRunning ? 'running' : ''}`}
              disabled={!cascadeData || simRunning}
              onClick={runSimulation}
            >
              <span className="simulate-icon" />
              {simRunning ? 'SIMULATING…' : 'RUN SIMULATION'}
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="right-panel">
          {/* Risk Gauge */}
          <div className="panel-block">
            <div className="panel-label">CASCADE RISK INDEX</div>
            <RiskGauge score={cascadeData?.riskScore || 0} />
          </div>

          {/* Node Detail */}
          {selectedNode && (
            <div className="panel-block">
              <div className="panel-label">NODE ANALYSIS</div>
              <div className="node-detail">
                <div className="node-detail-name">{selectedNode.name}</div>
                <span className="node-detail-type" style={{
                  background: `${NODE_COLORS[selectedNode.label] || '#999'}22`,
                  color: NODE_COLORS[selectedNode.label] || '#999',
                  border: `1px solid ${NODE_COLORS[selectedNode.label] || '#999'}44`,
                }}>
                  {selectedNode.label}
                </span>
                <div className="node-detail-rows" style={{ marginTop: 10 }}>
                  <div className="node-detail-row">
                    <span className="key">NODE ID</span>
                    <span className="val" style={{ fontSize: 9 }}>{selectedNode.id}</span>
                  </div>
                  {selectedNode.severity !== undefined && (
                    <div className="node-detail-row">
                      <span className="key">SEVERITY</span>
                      <span className="val">{selectedNode.severity}/10</span>
                    </div>
                  )}
                  <div className="node-detail-row">
                    <span className="key">TYPE</span>
                    <span className="val">{selectedNode.label}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cascade Paths */}
          <div className="panel-block grow">
            <div className="panel-label">CASCADE PATHS</div>
            {!cascadeData ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1 }}>
                NO DATA LOADED
              </div>
            ) : (
              <div className="path-list">
                {cascadeData.paths.slice(0, 8).map((path, i) => (
                  <div
                    key={i}
                    className={`path-item ${selectedPath === i ? 'active' : ''}`}
                    onClick={() => setSelectedPath(i)}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="path-header-row">
                      <span className="path-prob">{path.probability_pct}%</span>
                      <div className="path-meta">
                        <div>{path.depth} HOPS</div>
                        <div>{path.hours_to_end}H</div>
                      </div>
                    </div>
                    <div className="path-bar-wrap">
                      <div className="path-bar" style={{ width: `${path.probability_pct}%` }} />
                    </div>
                    <div className="path-chain">
                      {path.nodes.map((n, j) => (
                        <span key={n.id}>
                          {j > 0 && <span className="arrow">→</span>}
                          <span className="node-name"
                            style={{ color: NODE_COLORS[n.label] || 'var(--text-primary)' }}>
                            {n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

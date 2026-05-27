import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';
import ControlPanel from './components/ControlPanel';
import WindCompass from './components/WindCompass';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '';
const apiBaseLooksVercel = API_BASE.toLowerCase().includes('vercel.app');

console.log('[App] API_BASE:', API_BASE);
console.log('[App] VITE_API_URL:', import.meta.env.VITE_API_URL);

function getWsBase(apiBase: string) {
  if (!apiBase) return '';
  try {
    const url = new URL(apiBase, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

const WS_BASE = getWsBase(API_BASE);
const wsAvailable = Boolean(WS_BASE) && !apiBaseLooksVercel;

interface Scenario {
  id: string;
  name: string;
  year: number;
  location: string;
  deaths: number;
  damage_usd?: number;
  description?: string;
  cascadeAttributionFactor?: number;
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

interface ValidationData {
  validationSource: string;
  documentedFailures: number;
  predictedFailures: number;
  matchedFailures: number;
  accuracyPercent: number;
  validationDate: string;
  note: string;
}

interface TopRecommendation {
  nodeId: string;
  nodeName: string;
  nodeLabel: string;
  riskReduction: number;
  eliminatedPaths: number;
  riskScoreAfter: number;
  recommendation: string;
  livesSaved: number;
  disclaimer: string;
}

interface RecommendOption {
  nodeId: string;
  nodeName: string;
  nodeLabel: string;
  riskScoreAfter: number;
  riskReduction: number;
  eliminatedPaths: number;
  pathCountAfter: number;
}

interface CombinedTopTwo {
  node1: { id: string; name: string; label: string };
  node2: { id: string; name: string; label: string };
  riskScoreAfter: number;
  riskReduction: number;
  eliminatedPaths: number;
}

interface RecommendationData {
  scenarioId: string;
  scenarioName: string;
  deaths: number;
  baselineRiskScore: number;
  baselinePathCount: number;
  topRecommendation: TopRecommendation | null;
  allOptions: RecommendOption[];
  combinedTopTwo: CombinedTopTwo | null;
  error?: string;
}

interface CascadeResponse {
  paths?: CascadePath[];
  riskScore?: number;
}

interface CompassDataPoint {
  name: string;
  bearing: number;
  distanceKm: number;
  prob: number;
  category: string;
  label: string;
}

interface SynthesisResult {
  success: boolean;
  fireId: string;
  fireName: string;
  placeName?: string;
  wind: { speedKmh: number; directionDeg: number };
  spreadRadiusKm: number;
  infrastructureFound: number;
  nodesSeeded: number;
  edgesSeeded: number;
  riskScore: number;
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  paths: CascadePath[];
  compassData: CompassDataPoint[];
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

const ARC_LEN = Math.PI * 80;

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
        <path d={bgPath} className="risk-arc-bg" />
        {[0, 25, 50, 75, 100].map((pct) => {
          const angle = 180 + (pct / 100) * 180;
          const rad = (angle * Math.PI) / 180;
          return (
            <line
              key={pct}
              x1={90 + 72 * Math.cos(rad)} y1={90 + 72 * Math.sin(rad)}
              x2={90 + 80 * Math.cos(rad)} y2={90 + 80 * Math.sin(rad)}
              stroke="rgba(255,255,255,0.12)" strokeWidth="1"
            />
          );
        })}
        <path
          d={fillPath}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1), stroke 0.6s ease' }}
        />
        <path
          d={fillPath}
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

function useCountUp(end: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = val;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (end - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [end, duration]);
  return val;
}

function AnimatedStat({ label, value, color = 'var(--orange)' }: { label: string; value: number; color?: string }) {
  const animated = useCountUp(value);
  return (
    <div className="stat-item">
      <div className="stat-val" style={{ color }}>{animated.toLocaleString()}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   BOOT SCREEN
   ═══════════════════════════════════════════════════ */

function BootScreen() {
  const [show, setShow] = useState(true);
  const [bootText] = useState([
    { text: '> INITIALIZING CASCADE CORE ENGINE...', status: 'ok' as const },
    { text: '> LOADING NEO4J GRAPH DATABASE...', status: 'ok' as const },
    { text: '> ESTABLISHING SECURE API TUNNEL...', status: 'ok' as const },
    { text: '> CALIBRATING RISK PROPAGATION ALGORITHMS...', status: 'warn' as const },
    { text: '> DEPLOYING CASCADE VISUALIZATION LAYER...', status: 'ok' as const },
    { text: '> SYSTEM READY — CASCADEIQ STANDBY', status: 'info' as const },
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="boot-overlay">
      <div className="boot-container">
        <div className="boot-logo">
          <svg viewBox="0 0 72 72" fill="none">
            <polygon points="36,4 68,64 4,64" fill="none" stroke="#FF5F1F" strokeWidth="2" />
            <polygon points="36,16 62,60 10,60" fill="rgba(255,95,31,0.08)" stroke="#FF5F1F" strokeWidth="1" />
            <circle cx="36" cy="38" r="8" fill="#FF5F1F">
              <animate attributeName="r" values="6;9;6" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <line x1="36" y1="4" x2="36" y2="16" stroke="#FF5F1F" strokeWidth="1" opacity="0.4" />
            <line x1="68" y1="64" x2="62" y2="60" stroke="#FF5F1F" strokeWidth="1" opacity="0.4" />
            <line x1="4" y1="64" x2="10" y2="60" stroke="#FF5F1F" strokeWidth="1" opacity="0.4" />
          </svg>
        </div>

        <div className="boot-title">
          CASCADE<span>IQ</span>
        </div>
        <div className="boot-subtitle">Disaster Cascade Intelligence System</div>

        <div className="boot-progress-track">
          <div className="boot-progress-fill" />
        </div>

        <div className="boot-lines">
          {bootText.map((line, i) => (
            <div key={i} className="boot-line">
              <span className={line.status}>
                {line.status === 'ok' ? '✓' : line.status === 'warn' ? '⚠' : '◆'} {line.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PARTICLE BACKGROUND
   ═══════════════════════════════════════════════════ */

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];
    const count = Math.min(60, Math.floor((window.innerWidth * window.innerHeight) / 20000));

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      });
    }

    let animId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 95, 31, ${p.o})`;
        ctx.fill();

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const dx = p.x - particles[j].x;
          const dy = p.y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255, 95, 31, ${0.05 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════
   SIMULATION TIMELINE
   ═══════════════════════════════════════════════════ */

function SimulationTimeline({
  path,
  simStep,
  simRunning,
}: {
  path: CascadePath | null;
  simStep: number;
  simRunning: boolean;
}) {
  if (!path || !simRunning) return null;

  const totalSteps = path.nodes.length;
  const progress = totalSteps > 1 ? ((simStep + 1) / totalSteps) * 100 : 0;

  return (
    <div className="sim-timeline-compact">
      <div className="sim-timeline-bar-track">
        <div
          className="sim-timeline-bar-fill"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
        {path.nodes.map((node, i) => (
          <div
            key={node.id}
            className={`sim-timeline-dot ${i <= simStep ? 'active' : ''} ${i === simStep ? 'current' : ''}`}
            style={{
              left: `${totalSteps > 1 ? (i / (totalSteps - 1)) * 100 : 50}%`,
              borderColor: NODE_COLORS[node.label] || '#FF5F1F',
            }}
          >
            <span className="sim-timeline-dot-inner" style={{
              background: i <= simStep ? (NODE_COLORS[node.label] || '#FF5F1F') : 'transparent',
            }} />
          </div>
        ))}
      </div>
      <div className="sim-timeline-info">
        <span className="sim-timeline-step">
          STEP {Math.min(simStep + 1, totalSteps)}/{totalSteps}
        </span>
        <span className="sim-timeline-node" style={{ color: path.nodes[Math.min(simStep, totalSteps - 1)]?.label ? NODE_COLORS[path.nodes[Math.min(simStep, totalSteps - 1)].label] : '#FF5F1F' }}>
          {path.nodes[Math.min(simStep, totalSteps - 1)]?.name || ''}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */

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
  const [baselineRiskScore, setBaselineRiskScore] = useState(0);
  const [removedNodes, setRemovedNodes] = useState<string[]>([]);
  const [validationData, setValidationData] = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<CascadeNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<number>(0);
  const [recommendation, setRecommendation] = useState<RecommendationData | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState(-1);
  const [simElapsed, setSimElapsed] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [resetCameraFn, setResetCameraFn] = useState<(() => void) | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisStatus, setSynthesisStatus] = useState('');
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [selectedFireId, setSelectedFireId] = useState<string | null>(null);
  const simTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simStartRef = useRef<number>(0);
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const selectedScenario = useMemo(
    () => scenarios.find(s => s.id === selectedId) || null,
    [scenarios, selectedId],
  );

  const fetchCascade = useCallback(async (scenarioId: string, removed: string[]) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setCascadeData(null);
    setRecommendation(null);
    setLoadingStatus('Connecting to Neo4j...');

    try {
      if (scenarioId === 'live_wildfires_satellite') {
        await axios.get(`${API_BASE}/api/realtime/wildfires`, { signal });
        if (signal.aborted) return;
      } else {
        try {
          const valUrl = `${API_BASE}/api/scenarios/${scenarioId}/validation`;
          console.log('[Validation] Fetching from:', valUrl);
          const valRes = await axios.get(valUrl, { signal });
          console.log('[Validation] Response:', valRes.data);
          if (!signal.aborted && valRes.data.success && valRes.data.data) {
            console.log('[Validation] Setting validation data:', valRes.data.data);
            setValidationData(valRes.data.data);
          } else {
            console.log('[Validation] No data in response or request aborted');
          }
        } catch (e) {
          console.error("[Validation] Fetch error:", e);
        }
      }

      const scenRes = await axios.get<ScenarioNodeResponse>(`${API_BASE}/api/scenarios/${scenarioId}`, { signal });
      if (signal.aborted) return;

      setLoadingStatus('Calculating cascade paths...');

      const records = scenRes.data.data;
      const hazardRec = records.find(r => r.node?.label === 'Hazard');
      if (!hazardRec?.node) throw new Error('No hazard node found');

      const hazardId = hazardRec.node.id;
      const cascRes = await axios.get<CascadeResponse>(`${API_BASE}/api/cascade/${hazardId}`, {
        params: { removed: removed.join(',') },
        signal,
      });
      if (signal.aborted) return;

      setLoadingStatus('Building graph...');

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

      const newRiskScore = cascRes.data.riskScore || 0;
      setCascadeData({
        nodes: Array.from(nodeMap.values()),
        edges: Array.from(edgeMap.values()),
        riskScore: newRiskScore,
        paths,
      });
      if (removed.length === 0) setBaselineRiskScore(newRiskScore);
      setSelectedPath(0);
    } catch (e: unknown) {
      if (axios.isCancel(e)) return;
      setError(getErrorMessage(e));
    } finally {
      setLoadingStatus('');
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      simTimersRef.current.forEach(clearTimeout);
      simTimersRef.current = [];
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  const filterCascadeLocally = useCallback((removed: string[], syn: SynthesisResult): CascadeData => {
    if (!syn || !syn.paths) {
      return { nodes: syn?.nodes || [], edges: syn?.edges || [], riskScore: syn?.riskScore || 0, paths: [] };
    }

    const removedSet = new Set(removed);
    const filteredPaths = syn.paths.filter(p => {
      const firstNode = p.nodes[0];
      if (firstNode && removedSet.has(firstNode.id)) return false;
      return p.nodes.every(n => !removedSet.has(n.id));
    });

    const usedNodeIds = new Set<string>();
    const usedEdgeKeys = new Set<string>();
    filteredPaths.forEach(p => {
      p.nodes.forEach(n => usedNodeIds.add(n.id));
      p.edges.forEach(e => usedEdgeKeys.add(`${e.from}->${e.to}`));
    });

    const nodes = syn.nodes.filter(n => usedNodeIds.has(n.id));
    const edges = syn.edges.filter(e => usedEdgeKeys.has(`${e.from}->${e.to}`));

    let riskScore = 0;
    if (filteredPaths.length > 0) {
      const maxProb = Math.max(...filteredPaths.map(p => p.probability_pct));
      const ratio = filteredPaths.length / syn.paths.length;
      riskScore = Math.min(99, Math.round((syn.riskScore || 0) * ratio * (0.6 + 0.4 * (maxProb / 100))));
    }

    return { nodes, edges, riskScore, paths: filteredPaths };
  }, []);

  const toggleNode = (nodeId: string) => {
    const next = removedNodes.includes(nodeId)
      ? removedNodes.filter(id => id !== nodeId)
      : [...removedNodes, nodeId];
    setRemovedNodes(next);
    setRecommendation(null);
    if (synthesisResult) {
      setCascadeData(filterCascadeLocally(next, synthesisResult));
      if (next.length === 0) setBaselineRiskScore(synthesisResult.riskScore);
    } else if (selectedId) {
      fetchCascade(selectedId, next);
    }
  };

  const handleControlPanelChange = useCallback((nodes: string[]) => {
    setRemovedNodes(nodes);
    setRecommendation(null);
    if (synthesisResult) {
      setCascadeData(filterCascadeLocally(nodes, synthesisResult));
      if (nodes.length === 0) setBaselineRiskScore(synthesisResult.riskScore);
    } else if (selectedId) {
      fetchCascade(selectedId, nodes);
    }
  }, [selectedId, fetchCascade, synthesisResult, filterCascadeLocally]);

  const handleOptimize = useCallback(async () => {
    if (!cascadeData || optimizing) return;
    const hazardNode = cascadeData.nodes.find(n => n.label === 'Hazard') || cascadeData.nodes[0];
    if (!hazardNode) return;

    setOptimizing(true);
    setRecommendation(null);

    try {
      const url = `${API_BASE}/api/recommend-interventions/${hazardNode.id}`;
      console.log('[Optimizer] Fetching:', url);
      const res = await axios.get(url);
      console.log('[Optimizer] Response:', res.data);
      if (res.data?.success) {
        setRecommendation(res.data);
      }
    } catch (e) {
      console.error('[Optimizer] Error:', e);
      setRecommendation({
        baselineRiskScore: 0,
        baselinePathCount: 0,
        allOptions: [],
        topRecommendation: null,
        combinedTopTwo: null,
        deaths: 0,
        scenarioId: '',
        scenarioName: '',
        error: e instanceof Error ? e.message : 'Optimization failed',
      } as RecommendationData);
    } finally {
      setOptimizing(false);
    }
  }, [cascadeData, optimizing]);

  const handleSynthesize = async (fireId: string) => {
    setSynthesizing(true);
    setSynthesisStatus('DETECTING WIND DIRECTION...');
    setError(null);
    setRemovedNodes([]);
    setRecommendation(null);

    try {
      await new Promise(r => setTimeout(r, 600));
      setSynthesisStatus('QUERYING OPENSTREETMAP INFRASTRUCTURE...');
      await new Promise(r => setTimeout(r, 400));

      console.log(`[Synthesize] Calling API: ${API_BASE}/api/realtime/wildfires/cascade/${fireId}`);
      const startTime = performance.now();

      const res = await axios.get(
        `${API_BASE}/api/realtime/wildfires/cascade/${fireId}`,
        { timeout: 45000 }
      );

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`[Synthesize] API responded in ${elapsed}s`, res.data);

      if (!res.data.success) throw new Error(res.data.error || 'Synthesis failed');
      if (!res.data.nodes || res.data.nodes.length === 0) throw new Error('Synthesis returned zero nodes');
      if (!res.data.paths) res.data.paths = [];

      console.log(`[Synthesize] Got ${res.data.nodes.length} nodes, ${(res.data.edges || []).length} edges, ${res.data.infrastructureFound} OSM results`);

      setSynthesisStatus('BUILDING CASCADE GRAPH...');
      await new Promise(r => setTimeout(r, 500));

      const syn = res.data as SynthesisResult;
      setSynthesisResult(syn);
      setCascadeData({
        nodes: syn.nodes,
        edges: syn.edges || [],
        riskScore: syn.riskScore || 0,
        paths: syn.paths,
      });
      setBaselineRiskScore(syn.riskScore || 0);
      setSelectedPath(0);
      if (syn.placeName) {
        setSelectedNode(prev => prev && prev.id === selectedFireId
          ? { ...prev, name: `Live Fire · ${syn.placeName}` }
          : prev);
      }
    } catch (e: unknown) {
      console.error('[Synthesize] Error:', e);
      setError(getErrorMessage(e));
    } finally {
      setSynthesizing(false);
      setSynthesisStatus('');
    }
  };

  const handleBackFromSynthesis = useCallback(() => {
    setSynthesisResult(null);
    setCascadeData(null);
    setRecommendation(null);
    setRemovedNodes([]);
    setSelectedPath(0);
    setSimRunning(false);
    setSimStep(-1);
    setSimElapsed(0);
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    simTimersRef.current.forEach(clearTimeout);
    simTimersRef.current = [];
    if (selectedId) fetchCascade(selectedId, []);
  }, [selectedId, fetchCascade]);

  const handleNodeClick = useCallback((node: CascadeNode) => {
    setSelectedNode(node);
    if (selectedId === 'live_wildfires_satellite' && node.label === 'Hazard') {
      setSelectedFireId(node.id);
    } else {
      setSelectedFireId(null);
    }
  }, [selectedId]);

  const handleScenarioSelect = (scenarioId: string) => {
    setSelectedId(scenarioId);
    setRemovedNodes([]);
    setSelectedNode(null);
    setSelectedFireId(null);
    setSynthesisResult(null);
    // Clear any running simulation
    wsRef.current?.close();
    wsRef.current = null;
    simTimersRef.current.forEach(clearTimeout);
    simTimersRef.current = [];
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    setSimStep(-1);
    setSimRunning(false);
    setSimElapsed(0);
    setCascadeData(null);
    setValidationData(null);
    setRecommendation(null);
    if (scenarioId) fetchCascade(scenarioId, []);
  };

  /**
   * runClientSideSimulation — propagates through path with proper time gaps
   * Uses 1.5-2.5s delays between each cascade step for a cinematic experience
   */
  const runClientSideSimulation = useCallback((path: CascadePath) => {
    // Mark start time inside callback so it's not called during render
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setSimRunning(true);
    setSimStep(-1);
    setSimElapsed(0);
    simStartRef.current = startTime;

    // Clear any existing timers
    simTimersRef.current.forEach(clearTimeout);
    simTimersRef.current = [];

    if (!path.nodes.length) {
      setSimRunning(false);
      return;
    }

    const totalSteps = path.nodes.length;

    // Elapsed time counter
    simIntervalRef.current = setInterval(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setSimElapsed(Math.floor((now - simStartRef.current) / 1000));
    }, 200);

    // Step 0 — immediate (hazard node lights up)
    const step0Timer = setTimeout(() => {
      setSimStep(0);

      // If only one node, simulation is done
      if (totalSteps <= 1) {
        const doneTimer = setTimeout(() => {
          if (simIntervalRef.current) clearInterval(simIntervalRef.current);
          setSimRunning(false);
          setSimStep(-1);
        }, 800);
        simTimersRef.current.push(doneTimer);
        return;
      }
    }, 400);
    simTimersRef.current.push(step0Timer);

    // Subsequent steps with 1.5-2.5s cinematic delays
    // Use cumulative addition, NOT multiplication, so steps spread properly
    let accumulatedMs = 400; // start after step0's 400ms timer
    for (let i = 1; i < totalSteps; i++) {
      const delayBase = 1500 + (i * 200); // Increasing delay for dramatic effect
      const delayVariation = Math.sin(i * 1.5) * 300; // Natural variation
      const delay = Math.max(1200, delayBase + delayVariation);
      accumulatedMs += delay;

      const timer = setTimeout(() => {
        setSimStep(i);

        // If this is the last step, complete simulation after a pause
        if (i === totalSteps - 1) {
          const doneTimer = setTimeout(() => {
            if (simIntervalRef.current) clearInterval(simIntervalRef.current);
            setSimRunning(false);
            setSimStep(-1);
          }, 1200);
          simTimersRef.current.push(doneTimer);
        }
      }, accumulatedMs);
      simTimersRef.current.push(timer);
    }
  }, []);

  const activePath = cascadeData?.paths[selectedPath];

  const runSimulation = useCallback(() => {
    if (!cascadeData || simRunning || !activePath) return;

    const hazardNode = cascadeData.nodes.find(n => n.label === 'Hazard') || cascadeData.nodes[0];
    if (!hazardNode) return;

    if (!wsAvailable) {
      wsRef.current?.close();
      wsRef.current = null;
      runClientSideSimulation(activePath);
      return;
    }

    setSimRunning(true);
    setSimStep(-1);
    setSimElapsed(0);
    // Use setTimeout to avoid calling Date.now during render
    setTimeout(() => {
      simStartRef.current = performance.now ? performance.now() : Date.now();
    }, 0);

    simIntervalRef.current = setInterval(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setSimElapsed(Math.floor((now - simStartRef.current) / 1000));
    }, 200);

    simTimersRef.current.forEach(clearTimeout);
    simTimersRef.current = [];

    wsRef.current?.close();

    const socket = new WebSocket(WS_BASE);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'SIMULATE',
        hazardId: hazardNode.id,
      }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'CASCADE_NODE':
          setSimStep(data.step);
          break;
        case 'SIMULATE_COMPLETE':
          if (simIntervalRef.current) clearInterval(simIntervalRef.current);
          setSimRunning(false);
          setSimStep(-1);
          socket.close();
          if (wsRef.current === socket) {
            wsRef.current = null;
          }
          break;
        case 'SIMULATE_ERROR':
          console.error(data.error || data.message);
          if (simIntervalRef.current) clearInterval(simIntervalRef.current);
          setSimRunning(false);
          setSimStep(-1);
          break;
      }
    };

    socket.onerror = () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      setSimRunning(false);
      setSimStep(-1);
    };

    socket.onclose = () => {
      setSimRunning(false);
      setSimStep(-1);
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
    };

    wsRef.current = socket;
  }, [cascadeData, simRunning, activePath, wsAvailable, runClientSideSimulation]);

  const mitigable = cascadeData?.nodes.filter(
    n => n.label === 'Resource' || n.label === 'Infrastructure'
  ) || [];

  return (
    <>
      <BootScreen />
      <ParticleField />

      <div className="dashboard">
        {/* ══════════ HEADER ══════════ */}
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

        {/* ══════════ BODY ══════════ */}
        <div className="dash-body">

          {/* ── LEFT PANEL ── */}
          <div className="left-panel">
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
                    <AnimatedStat label="Casualties" value={selectedScenario.deaths} />
                    <AnimatedStat label="Year" value={selectedScenario.year} color="var(--cyan)" />
                  </div>
                  {validationData && typeof validationData.accuracyPercent === 'number' && (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div className={`validation-badge ${validationData.accuracyPercent > 80 ? 'high' : validationData.accuracyPercent >= 60 ? 'medium' : 'low'}`}>
                        <span className="validation-pct">{validationData.accuracyPercent}%</span>
                        <span className="validation-src">{validationData.validationSource}</span>
                        <div className="validation-tooltip">
                          Of the {validationData.predictedFailures} cascade events our model predicted, {validationData.matchedFailures} were independently documented in official post-incident reports.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

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

            <div className="panel-block grow">
              <div className="panel-label" style={{ justifyContent: 'space-between' }}>
                <span>MITIGATION CONTROLS</span>
                {cascadeData && mitigable.length > 0 && (
                  <button
                    className="optimize-btn"
                    onClick={handleOptimize}
                    disabled={optimizing}
                  >
                    {optimizing ? 'CALCULATING...' : 'OPTIMIZE'}
                  </button>
                )}
              </div>

              {recommendation && !recommendation.error && recommendation.topRecommendation && (
                <div className="recommendation-card">
                  <div className="rec-header">OPTIMAL INTERVENTION</div>
                  <div className="rec-node-name">{recommendation.topRecommendation.nodeName}</div>
                  <div className="rec-metrics">
                    <div className="rec-metric">
                      <span className="rec-metric-val" style={{ color: '#00E676' }}>↓{recommendation.topRecommendation.riskReduction}</span>
                      <span className="rec-metric-lbl">RISK REDUCTION</span>
                    </div>
                    <div className="rec-metric">
                      <span className="rec-metric-val" style={{ color: '#00CFFF' }}>{recommendation.topRecommendation.eliminatedPaths}</span>
                      <span className="rec-metric-lbl">CHAINS ELIMINATED</span>
                    </div>
                    <div className="rec-metric">
                      <span className="rec-metric-val" style={{ color: '#A78BFA' }}>~{recommendation.topRecommendation.livesSaved}</span>
                      <span className="rec-metric-lbl">LIVES SAVED</span>
                    </div>
                  </div>
                  <div className="rec-text">{recommendation.topRecommendation.recommendation}</div>
                  <div className="rec-lives-note">
                    Intervention could prevent approximately {recommendation.topRecommendation.livesSaved} deaths in a similar future event.
                    <span className="rec-disclaimer"> {recommendation.topRecommendation.disclaimer}</span>
                  </div>
                  {recommendation.combinedTopTwo && (
                    <div className="rec-top-two">
                      Combined with {recommendation.combinedTopTwo.node2.name}: ↓{recommendation.combinedTopTwo.riskReduction} risk, {recommendation.combinedTopTwo.eliminatedPaths} chains eliminated.
                    </div>
                  )}
                  <button
                    className="rec-apply-btn"
                    onClick={() => {
                      if (recommendation.topRecommendation) {
                        const nodeId = recommendation.topRecommendation.nodeId;
                        if (!removedNodes.includes(nodeId)) {
                          toggleNode(nodeId);
                        }
                      }
                    }}
                  >
                    APPLY THIS RECOMMENDATION
                  </button>
                </div>
              )}
              {recommendation && !recommendation.topRecommendation && !recommendation.error && (
                <div className="recommendation-card" style={{ borderColor: 'rgba(255,152,0,0.25)', background: 'rgba(255,152,0,0.04)' }}>
                  <div className="rec-header" style={{ color: '#FF9800' }}>INTERVENTION ANALYSIS</div>
                  <div className="rec-text">
                    No single-node intervention produces meaningful risk reduction in this scenario. The cascade risk is distributed across multiple parallel branches — protecting any one node does not eliminate the top failure path.
                  </div>
                  {recommendation.allOptions && recommendation.allOptions.length > 0 && (
                    <div className="rec-top-two">
                      Best option: {recommendation.allOptions[0].nodeName} (↓{recommendation.allOptions[0].riskReduction} risk, {recommendation.allOptions[0].eliminatedPaths} chains eliminated)
                    </div>
                  )}
                  {recommendation.combinedTopTwo && (
                    <div className="rec-top-two">
                      Combined: protect {recommendation.combinedTopTwo.node1.name} + {recommendation.combinedTopTwo.node2.name} → ↓{recommendation.combinedTopTwo.riskReduction} risk, {recommendation.combinedTopTwo.eliminatedPaths} chains eliminated.
                    </div>
                  )}
                  <button
                    className="rec-apply-btn"
                    style={{ borderColor: 'rgba(255,152,0,0.3)', color: '#FF9800', background: 'rgba(255,152,0,0.08)' }}
                    onClick={() => {
                      if (recommendation.allOptions && recommendation.allOptions.length > 0 && !removedNodes.includes(recommendation.allOptions[0].nodeId)) {
                        toggleNode(recommendation.allOptions[0].nodeId);
                      }
                    }}
                  >
                    PROTECT BEST AVAILABLE
                  </button>
                </div>
              )}
              {recommendation && recommendation.error && (
                <div className="recommendation-card" style={{ borderColor: 'rgba(255,61,61,0.25)', background: 'rgba(255,61,61,0.04)' }}>
                  <div className="rec-header" style={{ color: '#FF3D3D' }}>OPTIMIZATION ERROR</div>
                  <div className="rec-text">{recommendation.error}</div>
                </div>
              )}

              <ControlPanel
                removedNodes={removedNodes}
                setRemovedNodes={handleControlPanelChange}
                availableNodes={synthesisResult?.nodes || cascadeData?.nodes || []}
                riskScore={cascadeData?.riskScore}
                baselineRiskScore={baselineRiskScore}
                deaths={selectedScenario?.deaths}
                scenarioName={selectedScenario?.name}
                scenarioLocation={selectedScenario?.location}
                cascadeAttributionFactor={selectedScenario?.cascadeAttributionFactor}
              />
            </div>
          </div>

          {/* ── CENTER PANEL ── */}
          <div className="center-panel">
            <div className="graph-header">
              <span className="graph-title">◈ CASCADE PROPAGATION GRAPH</span>
              <div className="graph-meta">
                <div className="graph-meta-item">
                  <div className="graph-meta-dot" style={{ background: '#FF5F1F' }} />
                  <span>Hazard</span>
                </div>
                <div className="graph-meta-item">
                  <div className="graph-meta-dot" style={{ background: '#3D8EF0' }} />
                  <span>Infrastructure</span>
                </div>
                <div className="graph-meta-item">
                  <div className="graph-meta-dot" style={{ background: '#E04545' }} />
                  <span>Resource</span>
                </div>
                <div className="graph-meta-item">
                  <div className="graph-meta-dot" style={{ background: '#F4A020' }} />
                  <span>Event</span>
                </div>
                <div className="graph-meta-item">
                  <div className="graph-meta-dot" style={{ background: '#8B0000' }} />
                  <span>Failure</span>
                </div>
              </div>
            </div>

            <div className="graph-wrap">
              <div className="graph-corner tl" />
              <div className="graph-corner tr" />
              <div className="graph-corner bl" />
              <div className="graph-corner br" />

              {synthesizing ? (
                <div className="loading-state">
                  <div className="loading-ring" />
                  <div className="loading-text">SYNTHESIZING CASCADE</div>
                  <div className="loading-sub" style={{
                    animation: 'blink 1.2s step-end infinite',
                    transition: 'opacity 0.3s',
                  }}>{synthesisStatus}</div>
                  <div className="synthesis-steps">
                    <div className={`synth-step ${synthesisStatus.includes('WIND') ? 'active' : synthesisStatus.includes('INFRASTRUCTURE') || synthesisStatus.includes('CASCADE') ? 'done' : ''}`}>
                      {synthesisStatus.includes('INFRASTRUCTURE') || synthesisStatus.includes('CASCADE') ? '✓' : '○'} WIND
                    </div>
                    <div className={`synth-step ${synthesisStatus.includes('INFRASTRUCTURE') ? 'active' : synthesisStatus.includes('CASCADE') ? 'done' : ''}`}>
                      {synthesisStatus.includes('CASCADE') ? '✓' : '○'} INFRASTRUCTURE
                    </div>
                    <div className={`synth-step ${synthesisStatus.includes('CASCADE') ? 'active' : ''}`}>
                      ○ CASCADE
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="loading-state">
                  <div className="loading-ring" />
                  <div className="loading-text">QUERYING NEO4J</div>
                  <div className="loading-sub">{loadingStatus || 'TRAVERSING CASCADE GRAPH…'}</div>
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
                  onNodeClick={handleNodeClick}
                  highlightPath={simRunning && activePath ? activePath.nodes.slice(0, simStep + 1).map(n => n.id) : []}
                  simRunning={simRunning}
                  simStep={simStep}
                  onReady={setResetCameraFn}
                />
              )}

              {cascadeData && (
                <>
                  <div className="graph-coords">
                    {cascadeData.nodes.length} NODES · {cascadeData.edges.length} EDGES · {cascadeData.paths.length} PATHS
                  </div>
                  {resetCameraFn && (
                    <button
                      className="reset-view-btn"
                      onClick={resetCameraFn}
                      title="Reset camera to default view"
                    >
                      ↺ RESET VIEW
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ── SIMULATION TIMELINE ── */}
            {simRunning && activePath && (
              <div className="sim-timeline">
                <SimulationTimeline path={activePath} simStep={simStep} simRunning={simRunning} />
              </div>
            )}

            <div className="graph-footer">
              <div className="legend">
                {Object.entries(NODE_COLORS).map(([label, color]) => (
                  <div key={label} className="legend-item">
                    <div className="legend-dot" style={{ background: color }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              {simRunning && (
                <div className="sim-status-bar">
                  <span className="sim-elapsed">
                    ⏱ {simElapsed}s
                  </span>
                </div>
              )}

              <button
                className={`simulate-btn ${simRunning ? 'running' : ''}`}
                disabled={!cascadeData || simRunning}
                onClick={runSimulation}
              >
                <span className="simulate-icon" />
                {simRunning
                    ? (simStep === -1 ? 'STARTING…' : `PROPAGATING… ${Math.min(simStep + 1, activePath?.nodes.length || 0)}/${activePath?.nodes.length || 0}`)
                  : 'RUN SIMULATION'}
              </button>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="right-panel">
            <div className="panel-block">
              <div className="panel-label">CASCADE RISK INDEX</div>
              <RiskGauge score={cascadeData?.riskScore || 0} />
            </div>

            {validationData && typeof validationData.accuracyPercent === 'number' && (
              <div className="panel-block">
                <div className="panel-label">HISTORICAL VALIDATION</div>
                <div className="validation-panel">
                  <div className="node-detail-row">
                    <span className="key">DOCUMENTED FAILURES</span>
                    <span className="val">{validationData.documentedFailures}</span>
                  </div>
                  <div className="node-detail-row">
                    <span className="key">PREDICTED BY MODEL</span>
                    <span className="val">{validationData.predictedFailures}</span>
                  </div>
                  <div className="node-detail-row">
                    <span className="key">MATCHED FAILURES</span>
                    <span className="val">{validationData.matchedFailures}</span>
                  </div>
                  <div className="node-detail-row">
                    <span className="key">VALIDATION DATE</span>
                    <span className="val">{validationData.validationDate}</span>
                  </div>
                  {validationData.note && (
                    <div className="validation-note">
                      {validationData.note}
                    </div>
                  )}
                </div>
              </div>
            )}

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
                    {/* Show connected edges for selected node */}
                    {cascadeData && (() => {
                      const connectedEdges = cascadeData.edges.filter(
                        e => e.from === selectedNode.id || e.to === selectedNode.id
                      );
                      return connectedEdges.length > 0 && (
                        <div className="node-detail-row" style={{ flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          <span className="key">CONNECTIONS ({connectedEdges.length})</span>
                          {connectedEdges.slice(0, 5).map(e => {
                            const other = e.from === selectedNode.id
                              ? cascadeData.nodes.find(n => n.id === e.to)
                              : cascadeData.nodes.find(n => n.id === e.from);
                            return other ? (
                              <div key={`${e.from}->${e.to}`} style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontSize: 8, fontFamily: 'var(--font-mono)',
                                color: 'var(--text-muted)', padding: '2px 0',
                              }}>
                                <span>→ {other.name.length > 16 ? other.name.slice(0, 15) + '…' : other.name}</span>
                                <span style={{ color: NODE_COLORS[other.label] || '#999' }}>{Math.round(e.prob * 100)}%</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {selectedId === 'live_wildfires_satellite' && selectedFireId && !synthesisResult && !synthesizing && (
              <div className="panel-block">
                <div className="panel-label">LIVE CASCADE GENESIS</div>
                <div className="synth-fire-info">
                  <div className="synth-fire-name">{selectedNode?.name}</div>
                  <div className="synth-fire-id">{selectedFireId}</div>
                  <button
                    className="synth-btn"
                    onClick={() => handleSynthesize(selectedFireId)}
                    disabled={synthesizing}
                  >
                    <span className="synth-btn-icon">◈</span>
                    SYNTHESIZE CASCADE
                  </button>
                  <div className="synth-note">
                    Queries live wind + OpenStreetMap infrastructure within threat radius
                  </div>
                </div>
              </div>
            )}

            {synthesizing && selectedFireId && (
              <div className="panel-block">
                <div className="panel-label">SYNTHESIS IN PROGRESS</div>
                <div className="synth-progress">
                  <div className="synth-progress-step">
                    <span className={`synth-progress-dot ${synthesisStatus.includes('WIND') ? 'active' : ''}`} />
                    <span>Wind detection</span>
                  </div>
                  <div className="synth-progress-step">
                    <span className={`synth-progress-dot ${synthesisStatus.includes('INFRASTRUCTURE') ? 'active' : ''}`} />
                    <span>Infrastructure mapping</span>
                  </div>
                  <div className="synth-progress-step">
                    <span className={`synth-progress-dot ${synthesisStatus.includes('CASCADE') ? 'active' : ''}`} />
                    <span>Graph construction</span>
                  </div>
                  <div className="synth-progress-label">{synthesisStatus}</div>
                </div>
              </div>
            )}

            {synthesisResult && (
              <div className="panel-block synth-back-block">
                <button className="synth-back-btn" onClick={handleBackFromSynthesis}>
                  <span className="synth-back-arrow">←</span>
                  <span className="synth-back-text">BACK TO LIVE FIRES</span>
                </button>
                <div className="synth-back-fire">
                  <span className="synth-back-fire-dot" />
                  {synthesisResult.placeName || synthesisResult.fireName}
                </div>
              </div>
            )}

            {synthesisResult && (
              <div className="panel-block">
                <div className="panel-label">WIND COMPASS</div>
                <WindCompass
                  windSpeedKmh={synthesisResult.wind.speedKmh}
                  windDirectionDeg={synthesisResult.wind.directionDeg}
                />
                <div className="synth-meta">
                  {synthesisResult.placeName && (
                    <div className="synth-meta-row">
                      <span className="key">LOCATION</span>
                      <span className="val" style={{ fontSize: 9 }}>{synthesisResult.placeName}</span>
                    </div>
                  )}
                  <div className="synth-meta-row">
                    <span className="key">SPREAD RADIUS</span>
                    <span className="val">{synthesisResult.spreadRadiusKm.toFixed(0)} km</span>
                  </div>
                  <div className="synth-meta-row">
                    <span className="key">INFRASTRUCTURE</span>
                    <span className="val">{synthesisResult.infrastructureFound} NODES</span>
                  </div>
                  <div className="synth-meta-row">
                    <span className="key">CASCADE SEEDED</span>
                    <span className="val">{synthesisResult.nodesSeeded} NODES · {synthesisResult.edgesSeeded} EDGES</span>
                  </div>
                </div>
              </div>
            )}

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
                      className={`path-item ${selectedPath === i ? 'active' : ''} ${simRunning && selectedPath === i ? 'sim-active' : ''}`}
                      onClick={() => {
                        if (!simRunning) setSelectedPath(i);
                      }}
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
                              style={{
                                color: NODE_COLORS[n.label] || 'var(--text-primary)',
                                ...(simRunning && selectedPath === i && j <= simStep ? {
                                  textShadow: `0 0 8px ${NODE_COLORS[n.label] || '#FF5F1F'}40`,
                                } : {}),
                              }}>
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
    </>
  );
}

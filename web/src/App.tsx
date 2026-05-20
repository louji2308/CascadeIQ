import { useState, useEffect } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';
import ControlPanel from './components/ControlPanel';
import './App.css';

// In production on Vercel, VITE_API_URL is empty — calls go to relative /api/*
// which Vercel rewrites to /api/index.js serverless function
const API_BASE = import.meta.env.VITE_API_URL || '';

interface Scenario {
  id: string;
  name: string;
  year: number;
  location: string;
  deaths: number;
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

interface CascadeData {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  riskScore: number;
}

interface ScenarioDetailRecord {
  scenario: {
    id: string;
    name: string;
    year: number;
    deaths: number;
    location: string;
  };
  node: {
    id: string;
    name: string;
    label: string;
    severity: number;
  } | null;
  edge: {
    from: string;
    to: string;
    type: string;
    prob: number;
    delay_hrs: number;
    mechanism: string;
  } | null;
}

function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [cascadeData, setCascadeData] = useState<CascadeData | null>(null);
  const [removedNodes, setRemovedNodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/scenarios`)
      .then(res => {
        const scenarios = res.data.data.map((s: any) => ({
          id: s.id,
          name: s.name,
          year: typeof s.year === 'object' ? s.year.low : s.year,
          location: s.location,
          deaths: typeof s.deaths === 'object' ? s.deaths.low : s.deaths,
          description: s.description,
        }));
        setScenarios(scenarios);
      })
      .catch(err => {
        console.error('Failed to fetch scenarios:', err);
        setError('Failed to load scenarios. Check API connection.');
      });
  }, []);

  useEffect(() => {
    if (!selectedScenarioId) return;

    const fetchCascade = async () => {
      setLoading(true);
      setError(null);
      setCascadeData(null);

      try {
        // Step 1: get scenario nodes to find the starting Hazard
        const scenarioRes = await axios.get(`${API_BASE}/api/scenarios/${selectedScenarioId}`);
        const records = scenarioRes.data.data as ScenarioDetailRecord[];

        const hazardRecord = records.find(
          (r: ScenarioDetailRecord) => r.node?.label === 'Hazard'
        );

        if (!hazardRecord || !hazardRecord.node) {
          setError('No Hazard node found in this scenario.');
          setLoading(false);
          return;
        }

        const hazardId = hazardRecord.node.id;

        // Step 2: get cascade paths from that hazard
        const cascadeRes = await axios.get(`${API_BASE}/api/cascade/${hazardId}`, {
          params: { removed: removedNodes.join(',') },
        });

        const firstPath = cascadeRes.data.paths?.[0];

        // Collect all unique nodes from all paths
        const nodeMap = new Map<string, CascadeNode>();
        const edgeMap = new Map<string, CascadeEdge>();

        (cascadeRes.data.paths || []).forEach((path: any) => {
          (path.nodes || []).forEach((n: CascadeNode) => {
            if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
          });
          (path.edges || []).forEach((e: CascadeEdge) => {
            const key = `${e.from}->${e.to}`;
            if (!edgeMap.has(key)) edgeMap.set(key, e);
          });
        });

        setCascadeData({
          nodes: Array.from(nodeMap.values()),
          edges: Array.from(edgeMap.values()),
          riskScore: cascadeRes.data.riskScore || 0,
        });
      } catch (err: any) {
        console.error('Cascade fetch error:', err);
        setError(`Failed to load cascade: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchCascade();
  }, [selectedScenarioId, removedNodes]);

  return (
    <div className="app">
      <header>
        <h1>CascadeIQ</h1>
        <select
          value={selectedScenarioId}
          onChange={e => {
            setSelectedScenarioId(e.target.value);
            setRemovedNodes([]);
          }}
        >
          <option value="">Select a disaster scenario</option>
          {scenarios.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.year}) – {s.location}
            </option>
          ))}
        </select>
      </header>

      <main>
        {loading && (
          <div className="loader">Loading cascade graph...</div>
        )}

        {error && (
          <div style={{ color: '#ef4444', padding: '1rem', background: '#1a0000', borderRadius: '8px', marginBottom: '1rem' }}>
            ⚠️ {error}
          </div>
        )}

        {cascadeData && !loading && (
          <>
            <div className="risk-badge">
              🔥 Risk Score: <strong>{cascadeData.riskScore}</strong> / 100
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
                {cascadeData.nodes.length} nodes · {cascadeData.edges.length} edges
              </span>
            </div>
            <GraphView nodes={cascadeData.nodes} edges={cascadeData.edges} />
            <ControlPanel
              removedNodes={removedNodes}
              setRemovedNodes={setRemovedNodes}
              availableNodes={cascadeData.nodes}
            />
          </>
        )}

        {!loading && !error && !cascadeData && selectedScenarioId && (
          <div className="loader" style={{ color: '#888' }}>No cascade data returned.</div>
        )}
      </main>
    </div>
  );
}

export default App;
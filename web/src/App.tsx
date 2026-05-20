import { useState, useEffect } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';   
import ControlPanel from './components/ControlPanel';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL;

interface Scenario {
  id: string;
  name: string;
  year: number;
  location: string;
  deaths: number;
}

interface Node {
  id: string;
  name: string;
  label: string;
  severity?: number;
}

interface Edge {
  from: string;
  to: string;
  type: string;
  prob: number;
  delay_hrs: number;
  mechanism: string;
}

interface CascadeData {
  nodes: Node[];
  edges: Edge[];
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

  useEffect(() => {
    axios.get(`${API_BASE}/api/scenarios`)
      .then(res => setScenarios(res.data.data))
      .catch(err => console.error('Failed to fetch scenarios:', err));
  }, []);

  useEffect(() => {
    if (!selectedScenarioId) return;

    const fetchCascade = async () => {
      setLoading(true);
      try {
        const scenarioRes = await axios.get(`${API_BASE}/api/scenarios/${selectedScenarioId}`);
        const records = scenarioRes.data.data as ScenarioDetailRecord[];
        const hazardRecord = records.find((r: ScenarioDetailRecord) => r.node?.label === 'Hazard');
        if (!hazardRecord || !hazardRecord.node) throw new Error('No Hazard node found');
        const hazardId = hazardRecord.node.id;

        const cascadeRes = await axios.get(`${API_BASE}/api/cascade/${hazardId}`, {
          params: { removed: removedNodes.join(',') }
        });
        setCascadeData({
          nodes: cascadeRes.data.nodes || [],
          edges: cascadeRes.data.edges || [],
          riskScore: cascadeRes.data.riskScore || 0,
        });
      } catch (err) {
        console.error(err);
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
          onChange={e => setSelectedScenarioId(e.target.value)}
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
        {loading && <div className="loader">Loading cascade graph...</div>}
        {cascadeData && (
          <>
            <div className="risk-badge">
              🔥 Risk Score: <strong>{cascadeData.riskScore}</strong> / 100
            </div>
            <GraphView nodes={cascadeData.nodes} edges={cascadeData.edges} />
            <ControlPanel
              removedNodes={removedNodes}
              setRemovedNodes={setRemovedNodes}
              availableNodes={cascadeData.nodes}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
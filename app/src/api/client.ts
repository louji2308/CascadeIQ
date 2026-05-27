import axios from 'axios';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_WEB_URL || 'http://localhost:3000';

export interface Scenario {
  id: string;
  name: string;
  year: number;
  location: string;
  deaths: number;
  damage_usd?: number;
  description?: string;
}

export interface CascadeNode {
  id: string;
  name: string;
  label: string;
  severity?: number;
}

export interface CascadeEdge {
  from: string;
  to: string;
  type: string;
  prob: number;
  delay_hrs: number;
  mechanism: string;
}

export interface CascadePath {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  depth: number;
  probability_pct: number;
  hours_to_end: number;
}

export interface CascadeData {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  riskScore: number;
  paths: CascadePath[];
}

interface ScenarioRecord {
  scenario: Scenario;
  node: CascadeNode;
  edge: CascadeEdge | null;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await axios.get(`${API_BASE}/api/scenarios`);
  return res.data.data;
}

export async function fetchScenarioDetails(id: string): Promise<{ scenario: Scenario; nodes: CascadeNode[]; edges: CascadeEdge[] }> {
  const res = await axios.get(`${API_BASE}/api/scenarios/${id}`);
  const records: ScenarioRecord[] = res.data.data;
  const scenario = records[0]?.scenario;
  const nodeMap = new Map<string, CascadeNode>();
  const edgeMap = new Map<string, CascadeEdge>();
  for (const r of records) {
    if (r.node && !nodeMap.has(r.node.id)) nodeMap.set(r.node.id, r.node);
    if (r.edge) {
      const k = `${r.edge.from}->${r.edge.to}`;
      if (!edgeMap.has(k)) edgeMap.set(k, r.edge);
    }
  }
  return {
    scenario,
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

export async function fetchCascade(hazardId: string): Promise<CascadeData> {
  const res = await axios.get(`${API_BASE}/api/cascade/${hazardId}`);
  const d = res.data;
  const nodeMap = new Map<string, CascadeNode>();
  const edgeMap = new Map<string, CascadeEdge>();
  const paths: CascadePath[] = (d.paths || []).map((p: CascadePath) => {
    (p.nodes || []).forEach((n: CascadeNode) => nodeMap.set(n.id, n));
    (p.edges || []).forEach((e: CascadeEdge) => edgeMap.set(`${e.from}->${e.to}`, e));
    return p;
  });
  (d.nodes || []).forEach((n: CascadeNode) => nodeMap.set(n.id, n));
  (d.edges || []).forEach((e: CascadeEdge) => edgeMap.set(`${e.from}->${e.to}`, e));
  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    riskScore: d.riskScore ?? 0,
    paths,
  };
}

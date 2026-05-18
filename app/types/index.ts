// The shape of a Scenario from GET /api/scenarios
export interface Scenario {
  id: string;
  name: string;
  year: number;
  location: string;
  deaths: number;
  damage_usd: number;
  description: string;
}

// A single node in the cascade graph
export interface CascadeNode {
  id: string;
  name: string;
  label: 'Hazard' | 'Infrastructure' | 'Resource' | 'Event' | 'Failure' | 'Scenario';
  severity?: number;
  type?: string;
}

// A single edge connecting two nodes
export interface CascadeEdge {
  type: string;
  prob: number;
  delay_hrs: number;
  mechanism: string;
}

// One cascade path from the API
export interface CascadePath {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  depth: number;
  probability_pct: number;
  hours_to_end: number;
}

// The full response from GET /api/cascade/:hazardId
export interface CascadeResponse {
  success: boolean;
  hazard: { name: string; severity: number; type: string };
  riskScore: number;
  pathCount: number;
  paths: CascadePath[];
}

// A positioned node for graph rendering — extends CascadeNode with x,y coords
export interface PositionedNode extends CascadeNode {
  x: number;
  y: number;
  depth: number;
}

// An edge ready for rendering — knows source and target positions
export interface RenderedEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  prob: number;
  type: string;
  mechanism: string;
}

// Navigation param types — tells TypeScript what each screen expects
export type RootStackParamList = {
  Home: undefined;
  Cascade: {
    scenarioId: string;
    scenarioName: string;
    hazardId: string;
    hazardName: string;
  };
  Timeline: {
    paths: CascadePath[];
    riskScore: number;
    scenarioName: string;
  };
};
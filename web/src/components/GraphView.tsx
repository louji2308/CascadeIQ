import React, { useRef, useEffect } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import assign from 'graphology-layout-forceatlas2';
import './GraphView.css';

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
}

interface GraphViewProps {
  nodes: Node[];
  edges: Edge[];
}

const nodeColor = (label: string): string => {
  switch (label) {
    case 'Hazard': return '#FF5F1F';
    case 'Infrastructure': return '#3D8EF0';
    case 'Resource': return '#E04545';
    case 'Failure': return '#8B0000';
    case 'Event': return '#F4A020';
    default: return '#AAAAAA';
  }
};

const nodeSize = (severity?: number): number => {
  const base = 8;
  if (!severity) return base;
  return base + severity * 1.2;
};

const GraphView: React.FC<GraphViewProps> = ({ nodes, edges }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);

  useEffect(() => {
    // Kill previous Sigma instance cleanly
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    if (!containerRef.current || nodes.length === 0) return;

    const graph = new Graph({ multi: false, allowSelfLoops: false });

    nodes.forEach(node => {
      graph.addNode(node.id, {
        label: node.name,
        size: nodeSize(node.severity),
        color: nodeColor(node.label),
        // ✅ DO NOT set `type: node.label` — Sigma only accepts registered renderer types
        // Store label info as a custom attribute instead
        nodeLabel: node.label,
        severity: node.severity || 5,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
      });
    });

    edges.forEach(edge => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
        // Avoid duplicate edges in a simple graph
        if (!graph.hasEdge(edge.from, edge.to)) {
          graph.addEdge(edge.from, edge.to, {
            label: `${edge.type} (${(edge.prob * 100).toFixed(0)}%)`,
            size: Math.max(1, edge.prob * 3),
            color: `rgba(200,200,200,${Math.max(0.2, edge.prob * 0.5)})`,
          });
        }
      }
    });

    // Apply force-directed layout synchronously
    if (graph.order > 0) {
      try {
        assign(graph, {
          iterations: 150,
          settings: {
            gravity: 1,
            scalingRatio: 15,
            strongGravityMode: true,
          },
        });
      } catch (e) {
        console.warn('ForceAtlas2 layout error:', e);
        // Fallback: random positions are already set above
      }
    }

    try {
      sigmaRef.current = new Sigma(graph, containerRef.current, {
        renderEdgeLabels: false,
        defaultEdgeType: 'arrow',
        labelDensity: 0.07,
        labelGridCellSize: 60,
        minCameraRatio: 0.1,
        maxCameraRatio: 4,
        allowInvalidContainer: true, // ✅ prevents "no width" crash
      });

      sigmaRef.current.on('clickNode', ({ node }) => {
        const attrs = graph.getNodeAttributes(node);
        alert(`📍 ${attrs.label}\nType: ${attrs.nodeLabel}\nSeverity: ${attrs.severity}/10`);
      });
    } catch (e) {
      console.error('Sigma init error:', e);
    }

    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return (
      <div className="graph-container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        fontSize: '14px',
      }}>
        Select a scenario to view the cascade graph
      </div>
    );
  }

  return <div ref={containerRef} className="graph-container" />;
};

export default GraphView;
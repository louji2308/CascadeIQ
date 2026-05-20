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
    if (!containerRef.current || nodes.length === 0) return;

    const graph = new Graph({ multi: false, allowSelfLoops: false });

    nodes.forEach(node => {
      graph.addNode(node.id, {
        label: node.name,
        size: nodeSize(node.severity),
        color: nodeColor(node.label),
        type: node.label,
        severity: node.severity || 5,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
      });
    });

    edges.forEach(edge => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
        graph.addEdge(edge.from, edge.to, {
          label: `${edge.type} (${(edge.prob * 100).toFixed(0)}%)`,
          type: 'arrow',
          size: 2,
          color: '#aaa',
        });
      } else {
        console.warn(`Edge missing node: ${edge.from} -> ${edge.to}`);
      }
    });

    assign(graph, { 
  iterations: 200, 
  settings: { 
    gravity: 0.5,
    scalingRatio: 10
  } 
});

    sigmaRef.current = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: true,
      defaultEdgeType: 'arrow',
      labelDensity: 0.07,
      labelGridCellSize: 60,
      minCameraRatio: 0.1,
      maxCameraRatio: 4,
    });

    sigmaRef.current.on('clickNode', ({ node }) => {
      const attrs = graph.getNodeAttributes(node);
      alert(`📍 ${attrs.label}\nType: ${attrs.type}\nSeverity: ${attrs.severity}/10`);
    });

    return () => {
      sigmaRef.current?.kill();
      sigmaRef.current = null;
    };
  }, [nodes, edges]);

  return <div ref={containerRef} className="graph-container" />;
};

export default GraphView;
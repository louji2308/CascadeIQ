import React, { useRef, useEffect } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
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
  mechanism?: string;
}

interface GraphViewProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
  highlightPath?: string[];
}

const NODE_COLORS: Record<string, string> = {
  Hazard: '#FF5F1F',
  Infrastructure: '#3D8EF0',
  Resource: '#E04545',
  Failure: '#8B0000',
  Event: '#F4A020',
};

const DIM_COLOR = 'rgba(40,50,70,0.8)';

const GraphView: React.FC<GraphViewProps> = ({ nodes, edges, onNodeClick, highlightPath = [] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodesDataRef = useRef<Node[]>([]);

  // Build / rebuild graph on nodes/edges change
  useEffect(() => {
    if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
    if (!containerRef.current || nodes.length === 0) return;

    nodesDataRef.current = nodes;
    const graph = new Graph({ multi: false, allowSelfLoops: false });
    graphRef.current = graph;

    nodes.forEach(n => {
      const size = 8 + (n.severity || 5) * 1.2;
      graph.addNode(n.id, {
        label: n.name,
        size,
        color: NODE_COLORS[n.label] || '#AAAAAA',
        originalColor: NODE_COLORS[n.label] || '#AAAAAA',
        nodeLabel: n.label,
        severity: n.severity || 5,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
      });
    });

    edges.forEach(e => {
      if (graph.hasNode(e.from) && graph.hasNode(e.to) && !graph.hasEdge(e.from, e.to)) {
        const alpha = Math.max(0.15, e.prob * 0.55);
        graph.addEdge(e.from, e.to, {
          label: `${e.type} (${Math.round(e.prob * 100)}%)`,
          size: Math.max(1, e.prob * 2.5),
          color: `rgba(180,190,210,${alpha})`,
          originalColor: `rgba(180,190,210,${alpha})`,
          type: 'arrow',
        });
      }
    });

    if (graph.order > 1) {
      try {
        forceAtlas2.assign(graph, {
          iterations: 200,
          settings: {
            gravity: 1.2,
            scalingRatio: 18,
            strongGravityMode: true,
            barnesHutOptimize: graph.order > 50,
          },
        });
      } catch (_) { /* fallback to random positions */ }
    }

    try {
      sigmaRef.current = new Sigma(graph, containerRef.current, {
        renderEdgeLabels: false,
        defaultEdgeType: 'arrow',
        labelFont: "'Share Tech Mono', monospace",
        labelSize: 11,
        labelWeight: '400',
        labelColor: { color: 'rgba(180,190,210,0.75)' },
        labelDensity: 0.06,
        labelGridCellSize: 80,
        minCameraRatio: 0.08,
        maxCameraRatio: 5,
        allowInvalidContainer: true,
        stagePadding: 40,
      });

      sigmaRef.current.on('clickNode', ({ node }) => {
        const nodeData = nodesDataRef.current.find(n => n.id === node);
        if (nodeData && onNodeClick) onNodeClick(nodeData);
      });

      sigmaRef.current.on('enterNode', ({ node }) => {
        const attrs = graph.getNodeAttributes(node);
        containerRef.current!.style.cursor = 'pointer';
        // Highlight connected edges
        graph.forEachEdge((edge, edgeAttrs) => {
          const [src, tgt] = graph.extremities(edge);
          const connected = src === node || tgt === node;
          graph.setEdgeAttribute(edge, 'color',
            connected ? '#FF5F1F' : `rgba(40,50,70,0.3)`);
          graph.setEdgeAttribute(edge, 'size',
            connected ? Math.max(2, edgeAttrs.size * 1.4) : edgeAttrs.size * 0.6);
        });
        graph.setNodeAttribute(node, 'highlighted', true);
        sigmaRef.current?.refresh();
      });

      sigmaRef.current.on('leaveNode', () => {
        containerRef.current!.style.cursor = 'default';
        graph.forEachEdge((edge) => {
          graph.setEdgeAttribute(edge, 'color', graph.getEdgeAttribute(edge, 'originalColor'));
          graph.setEdgeAttribute(edge, 'size',
            Math.max(1, (graph.getEdgeAttribute(edge, 'prob') || 0.5) * 2.5));
        });
        graph.forEachNode(node => {
          graph.setNodeAttribute(node, 'highlighted', false);
        });
        sigmaRef.current?.refresh();
      });
    } catch (e) {
      console.error('Sigma init error:', e);
    }

    return () => {
      if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
    };
  }, [nodes, edges]);

  // Handle simulation highlight path
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    if (highlightPath.length === 0) {
      // Reset all colors
      graph.forEachNode(node => {
        graph.setNodeAttribute(node, 'color', graph.getNodeAttribute(node, 'originalColor'));
      });
      graph.forEachEdge(edge => {
        graph.setEdgeAttribute(edge, 'color', graph.getEdgeAttribute(edge, 'originalColor'));
      });
    } else {
      const pathSet = new Set(highlightPath);
      graph.forEachNode(node => {
        if (pathSet.has(node)) {
          graph.setNodeAttribute(node, 'color', graph.getNodeAttribute(node, 'originalColor'));
          graph.setNodeAttribute(node, 'size',
            graph.getNodeAttribute(node, 'size') * 1.3);
        } else {
          graph.setNodeAttribute(node, 'color', DIM_COLOR);
        }
      });
      graph.forEachEdge(edge => {
        const [src, tgt] = graph.extremities(edge);
        const onPath = pathSet.has(src) && pathSet.has(tgt);
        graph.setEdgeAttribute(edge, 'color',
          onPath ? '#FF5F1F' : 'rgba(40,50,70,0.2)');
        graph.setEdgeAttribute(edge, 'size',
          onPath ? 3 : 0.8);
      });
    }

    sigma.refresh();
  }, [highlightPath]);

  if (nodes.length === 0) {
    return <div ref={containerRef} className="sigma-container" />;
  }

  return <div ref={containerRef} className="sigma-container" />;
};

export default GraphView;
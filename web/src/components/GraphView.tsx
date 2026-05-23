import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  simRunning?: boolean;
  simStep?: number;
}

const NODE_COLORS: Record<string, string> = {
  Hazard: '#FF5F1F',
  Infrastructure: '#3D8EF0',
  Resource: '#E04545',
  Failure: '#8B0000',
  Event: '#F4A020',
};

const DIM_COLOR = 'rgba(18,24,42,0.85)';
const PATH_EDGE_COLOR = '#FF5F1F';
const PATH_GLOW_EDGE = 'rgba(255,95,31,0.3)';

/* ── Color interpolation helper ── */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (c: string) => {
    const m = c.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (m) return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
    const r = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (r) return [+r[1], +r[2], +r[3]];
    return [200,200,200];
  };
  const ca = parse(a), cb = parse(b);
  const r = Math.round(ca[0] + (cb[0]-ca[0])*t);
  const g = Math.round(ca[1] + (cb[1]-ca[1])*t);
  const bl = Math.round(ca[2] + (cb[2]-ca[2])*t);
  return `rgb(${r},${g},${bl})`;
}

/* ── Easing ── */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const GraphView: React.FC<GraphViewProps> = ({
  nodes, edges, onNodeClick,
  highlightPath = [], simRunning = false, simStep = -1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodesDataRef = useRef<Node[]>([]);
  const [tooltip, setTooltip] = useState<{ node: Node; x: number; y: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const edgeParticlesRef = useRef<Map<string, number>>(new Map());
  const hoveredNodeRef = useRef<string | null>(null);
  const simHighlightedRef = useRef<Set<string>>(new Set());

  // ── Smooth hover animation system ──
  const hoverProgressRef = useRef<number>(0);             // 0 → 1
  const hoverAnimFrameRef = useRef<number>(0);
  const hoverAnimRunningRef = useRef<boolean>(false);
  const lastHoveredNodeRef = useRef<string | null>(null); // track which node to animate out

  const startHoverAnim = useCallback(() => {
    if (hoverAnimRunningRef.current) return;
    hoverAnimRunningRef.current = true;

    const tick = () => {
      const hasHover = hoveredNodeRef.current !== null;
      const current = hoverProgressRef.current;

      if (hasHover && current < 1) {
        // Ease in — fast at first, slow near 1
        hoverProgressRef.current = Math.min(1, current + 0.07);
      } else if (!hasHover && current > 0) {
        // Ease out
        hoverProgressRef.current = Math.max(0, current - 0.04);
      }

      // Refresh sigma to trigger nodeReducer with new progress
      if (sigmaRef.current) sigmaRef.current.refresh();

      // Continue until we reach target steady state
      if ((hasHover && hoverProgressRef.current < 1) || (!hasHover && hoverProgressRef.current > 0)) {
        hoverAnimFrameRef.current = requestAnimationFrame(tick);
      } else {
        hoverAnimRunningRef.current = false;
      }
    };

    hoverAnimFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Build / rebuild graph on nodes/edges change ──
  useEffect(() => {
    if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
    if (!containerRef.current || nodes.length === 0) return;

    nodesDataRef.current = nodes;
    const graph = new Graph({ multi: false, allowSelfLoops: false });
    graphRef.current = graph;

    nodes.forEach(n => {
      const sev = n.severity || 5;
      const size = 6 + sev * 1.8;
      graph.addNode(n.id, {
        label: n.name,
        size,
        originalSize: size,
        color: NODE_COLORS[n.label] || '#AAAAAA',
        originalColor: NODE_COLORS[n.label] || '#AAAAAA',
        nodeLabel: n.label,
        severity: sev,
        x: (Math.random() - 0.5) * 300,
        y: (Math.random() - 0.5) * 300,
      });
    });

    edges.forEach(e => {
      if (graph.hasNode(e.from) && graph.hasNode(e.to) && !graph.hasEdge(e.from, e.to)) {
        const alpha = Math.max(0.2, e.prob * 0.65);
        graph.addEdge(e.from, e.to, {
          label: `${e.type} (${Math.round(e.prob * 100)}%)`,
          size: Math.max(0.8, e.prob * 3),
          originalSize: Math.max(0.8, e.prob * 3),
          prob: e.prob,
          delay_hrs: e.delay_hrs,
          color: `rgba(180,195,220,${alpha})`,
          originalColor: `rgba(180,195,220,${alpha})`,
          type: 'arrow',
        });
      }
    });

    if (graph.order > 1) {
      try {
        forceAtlas2.assign(graph, {
          iterations: 300,
          settings: {
            gravity: 1.5,
            scalingRatio: 20,
            strongGravityMode: true,
            barnesHutOptimize: graph.order > 40,
          },
        });
      } catch { /* fallback */ }
    }

    try {
      const nodeReducer = (node: string, data: Record<string, unknown>) => {
        const isHovered = hoveredNodeRef.current === node;
        const isSimHighlighted = simHighlightedRef.current.has(node);
        const baseColor = data.originalColor as string;
        const baseSize = data.originalSize as number;
        const progress = hoverProgressRef.current; // 0..1 for smooth transition

        let color = baseColor;
        let size = baseSize;
        let borderColor = 'transparent';
        let borderSize = 0;
        let forceLabel = false;
        let labelSize = 11;
        let labelColorObj = { color: 'rgba(180,190,210,0.6)' };

        // Only apply hover transition to hovered node OR the last hovered node fading out
        const isLeavingHover = !isHovered && lastHoveredNodeRef.current === node && progress > 0;
        if (isHovered || isLeavingHover) {
          // Smoothly interpolate toward hover state
          const p = isHovered ? Math.max(progress, 0.05) : (1 - progress);
          color = isHovered
            ? lerpColor(baseColor, '#FFFFFF', easeOutCubic(p))
            : lerpColor('#FFFFFF', baseColor, easeOutCubic(1 - progress));
          size = baseSize * (1 + p * 1.2);
          borderColor = `rgba(255,95,31,${p * 1})`;
          borderSize = p * 4;
          forceLabel = true;
          labelSize = 11 + p * 3;
          labelColorObj = {
            color: isHovered
              ? `rgba(255,255,255,${0.6 + p * 0.4})`
              : `rgba(180,190,210,${0.6 - (1 - progress) * 0.5})`,
          };
        } else if (isSimHighlighted) {
          size = baseSize * 1.6;
          color = baseColor;
          borderColor = 'rgba(255,95,31,0.8)';
          borderSize = 3;
          forceLabel = true;
          labelSize = 11;
          labelColorObj = { color: 'rgba(180,190,210,0.6)' };
        }

        return {
          ...data,
          color,
          size,
          borderColor,
          borderSize,
          forceLabel,
          label: forceLabel ? (data.label as string) : '',
          labelFont: "'Share Tech Mono', monospace",
          labelSize,
          labelColor: labelColorObj,
        };
      };

      const edgeReducer = (_edge: string, data: Record<string, unknown>) => {
        const origColor = data.originalColor as string;
        const origSize = data.originalSize as number;
        return { ...data, color: origColor, size: origSize, forceLabel: false };
      };

      sigmaRef.current = new Sigma(graph, containerRef.current, {
        renderEdgeLabels: false,
        defaultEdgeType: 'arrow',
        nodeReducer,
        edgeReducer,
        labelFont: "'Share Tech Mono', monospace",
        labelSize: 11,
        labelWeight: '400',
        labelColor: { color: 'rgba(180,190,210,0.75)' },
        labelDensity: 0.05,
        labelGridCellSize: 100,
        minCameraRatio: 0.05,
        maxCameraRatio: 6,
        allowInvalidContainer: true,
        stagePadding: 50,
        enableEdgeEvents: true,
      });

      // Node click
      sigmaRef.current.on('clickNode', ({ node }) => {
        const nodeData = nodesDataRef.current.find(n => n.id === node);
        if (nodeData && onNodeClick) onNodeClick(nodeData);
      });

      // Hover — smooth enter
      sigmaRef.current.on('enterNode', ({ node }) => {
        lastHoveredNodeRef.current = node;
        hoveredNodeRef.current = node;
        containerRef.current!.style.cursor = 'pointer';
        startHoverAnim();

        const nodeData = nodesDataRef.current.find(n => n.id === node);
        if (nodeData) {
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({
            node: nodeData,
            x: rect.left + rect.width / 2,
            y: rect.top + 60,
          });
        }

        // Highlight connected edges
        graph.forEachEdge((edge, edgeAttrs) => {
          const [src, tgt] = graph.extremities(edge);
          const connected = src === node || tgt === node;
          graph.setEdgeAttribute(edge, 'color',
            connected ? '#FF5F1F' : `rgba(24,32,52,0.25)`);
          graph.setEdgeAttribute(edge, 'size',
            connected ? Math.max(2.5, edgeAttrs.size * 2) : edgeAttrs.size * 0.4);
        });
      });

      // Hover — smooth leave
      sigmaRef.current.on('leaveNode', () => {
        hoveredNodeRef.current = null;
        containerRef.current!.style.cursor = 'default';
        setTooltip(null);
        // Don't call startHoverAnim — the RAF will smoothly transition out
        // because hoveredNodeRef is now null, progress will decrease
        startHoverAnim();

        graph.forEachEdge((edge) => {
          graph.setEdgeAttribute(edge, 'color', graph.getEdgeAttribute(edge, 'originalColor'));
          graph.setEdgeAttribute(edge, 'size', graph.getEdgeAttribute(edge, 'originalSize'));
        });
      });

      sigmaRef.current.on('clickStage', () => {
        setTooltip(null);
      });

    } catch (e) {
      console.error('Sigma init error:', e);
    }

    return () => {
      if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(hoverAnimFrameRef.current);
    };
  }, [nodes, edges, onNodeClick, startHoverAnim]);

  // Handle simulation highlight path with animated edge particles
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    simHighlightedRef.current = new Set(highlightPath);

    if (highlightPath.length === 0) {
      // Reset all
      graph.forEachNode(node => {
        graph.setNodeAttribute(node, 'color', graph.getNodeAttribute(node, 'originalColor'));
        graph.setNodeAttribute(node, 'size', graph.getNodeAttribute(node, 'originalSize'));
        graph.setNodeAttribute(node, 'highlighted', false);
      });
      graph.forEachEdge(edge => {
        graph.setEdgeAttribute(edge, 'color', graph.getEdgeAttribute(edge, 'originalColor'));
        graph.setEdgeAttribute(edge, 'size', graph.getEdgeAttribute(edge, 'originalSize'));
      });
      edgeParticlesRef.current.clear();
    } else if (!simRunning) {
      // Static highlight of full path
      const pathSet = new Set(highlightPath);
      graph.forEachNode(node => {
        if (pathSet.has(node)) {
          graph.setNodeAttribute(node, 'color', graph.getNodeAttribute(node, 'originalColor'));
          graph.setNodeAttribute(node, 'size',
            graph.getNodeAttribute(node, 'originalSize') * 1.5);
          graph.setNodeAttribute(node, 'highlighted', true);
        } else {
          graph.setNodeAttribute(node, 'color', DIM_COLOR);
          graph.setNodeAttribute(node, 'size', graph.getNodeAttribute(node, 'originalSize') * 0.7);
          graph.setNodeAttribute(node, 'highlighted', false);
        }
      });
      graph.forEachEdge(edge => {
        const [src, tgt] = graph.extremities(edge);
        const onPath = pathSet.has(src) && pathSet.has(tgt);
        graph.setEdgeAttribute(edge, 'color',
          onPath ? PATH_EDGE_COLOR : 'rgba(18,24,42,0.3)');
        graph.setEdgeAttribute(edge, 'size',
          onPath ? 3.5 : 0.6);
      });
    } else {
      // Active simulation - only highlight up to simStep
      const activeSet = new Set(highlightPath.slice(0, Math.max(1, simStep + 1)));
      graph.forEachNode(node => {
        if (activeSet.has(node)) {
          graph.setNodeAttribute(node, 'color', graph.getNodeAttribute(node, 'originalColor'));
          graph.setNodeAttribute(node, 'size',
            graph.getNodeAttribute(node, 'originalSize') * 1.8);
          graph.setNodeAttribute(node, 'highlighted', true);
        } else {
          graph.setNodeAttribute(node, 'color', DIM_COLOR);
          graph.setNodeAttribute(node, 'size', graph.getNodeAttribute(node, 'originalSize') * 0.5);
          graph.setNodeAttribute(node, 'highlighted', false);
        }
      });

      // Edge animation particles
      const currentEdges = new Set<string>();
      for (let i = 0; i < Math.min(simStep, highlightPath.length - 1); i++) {
        const src = highlightPath[i];
        const tgt = highlightPath[i + 1];
        graph.forEachEdge((edge, _edgeAttrs, _s, _t) => {
          if ((_s === src && _t === tgt) || (_s === tgt && _t === src)) {
            if (i < simStep) {
              currentEdges.add(edge);
              graph.setEdgeAttribute(edge, 'color', PATH_EDGE_COLOR);
              graph.setEdgeAttribute(edge, 'size', 4);
            } else if (i === simStep - 1) {
              currentEdges.add(edge);
              graph.setEdgeAttribute(edge, 'color', PATH_GLOW_EDGE);
              graph.setEdgeAttribute(edge, 'size', 3);
            }
          }
        });
      }

      // Dim non-active edge
      graph.forEachEdge(edge => {
        if (!currentEdges.has(edge)) {
          graph.setEdgeAttribute(edge, 'color',
            graph.getEdgeAttribute(edge, 'originalColor'));
          graph.setEdgeAttribute(edge, 'size',
            graph.getEdgeAttribute(edge, 'originalSize') * 0.5);
        }
      });
    }

    sigma.refresh();
  }, [highlightPath, simRunning, simStep]);

  return (
    <div
      ref={containerRef}
      className={`sigma-container ${simRunning ? 'sim-active' : ''}`}
    >
      {tooltip && (
        <div
          className="graph-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, 0)',
          }}
        >
          <div className="graph-tooltip-name">{tooltip.node.name}</div>
          <div
            className="graph-tooltip-type"
            style={{
              color: NODE_COLORS[tooltip.node.label] || '#AAAAAA',
            }}
          >
            {tooltip.node.label}
          </div>
          {tooltip.node.severity !== undefined && (
            <div className="graph-tooltip-row">
              <span>SEVERITY</span>
              <span>{tooltip.node.severity}/10</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GraphView;
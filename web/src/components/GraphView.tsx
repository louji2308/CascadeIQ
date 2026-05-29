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
  onReady?: (resetCamera: () => void) => void;
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

/* ── Easing ── */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Stable hash so same node always starts at same position
function stableHash(str: string, range: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return ((hash % range) + range) % range - range / 2;
}

const GraphView: React.FC<GraphViewProps> = ({
  nodes, edges, onNodeClick,
  highlightPath = [], simRunning = false, simStep = -1, onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodesDataRef = useRef<Node[]>([]);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [tooltip, setTooltip] = useState<{ node: Node; x: number; y: number; color: string } | null>(null);
  const animFrameRef = useRef<number>(0);
  const edgeParticlesRef = useRef<Map<string, number>>(new Map());
  const hoveredNodeRef = useRef<string | null>(null);
  const hoveredNodeColorRef = useRef<string>('#FF5F1F');
  const connectedNodesRef = useRef<Set<string>>(new Set());
  const connectedEdgesRef = useRef<Set<string>>(new Set());
  const simHighlightedRef = useRef<Set<string>>(new Set());

  // ── Smooth hover animation system ──
  const hoverProgressRef = useRef<number>(0);             // 0 → 1
  const hoverAnimFrameRef = useRef<number>(0);
  const hoverAnimRunningRef = useRef<boolean>(false);
  const lastHoveredNodeRef = useRef<string | null>(null); // track which node to animate out
  // Click pulse animation
  const clickedNodesRef = useRef<Map<string, number>>(new Map()); // nodeId -> startTime
  const clickAnimFrameRef = useRef<number>(0);

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

  const CLICK_PULSE_DURATION = 600; // ms
  const startClickLoop = useCallback(() => {
    if (clickAnimFrameRef.current) return;

    const tick = () => {
      // Remove expired clicks
      const now = performance.now();
      for (const [node, t] of Array.from(clickedNodesRef.current.entries())) {
        if (now - t > CLICK_PULSE_DURATION) clickedNodesRef.current.delete(node);
      }

      if (sigmaRef.current) sigmaRef.current.refresh();

      if (clickedNodesRef.current.size > 0) {
        clickAnimFrameRef.current = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(clickAnimFrameRef.current);
        clickAnimFrameRef.current = 0;
      }
    };

    clickAnimFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Graph init (once) + incremental updates (preserving positions) ──
  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;

    const graph = graphRef.current;
    if (!graph || !sigmaRef.current) {
      // ── First-time build ──
      nodesDataRef.current = nodes;
      const g = new Graph({ multi: false, allowSelfLoops: false });
      graphRef.current = g;

      nodes.forEach(n => {
        if (g.hasNode(n.id)) return;
        const sev = n.severity || 5;
        const size = 6 + sev * 1.8;
        g.addNode(n.id, {
          label: n.name,
          size,
          originalSize: size,
          color: NODE_COLORS[n.label] || '#AAAAAA',
          originalColor: NODE_COLORS[n.label] || '#AAAAAA',
          nodeLabel: n.label,
          severity: sev,
          x: stableHash(n.id, 300),
          y: stableHash(n.id + '_y', 300),
        });
      });

      edges.forEach(e => {
        if (g.hasNode(e.from) && g.hasNode(e.to) && !g.hasEdge(e.from, e.to)) {
          const alpha = Math.max(0.2, e.prob * 0.65);
          g.addEdge(e.from, e.to, {
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

      if (g.order > 1) {
        try {
          forceAtlas2.assign(g, {
            iterations: 300,
            settings: {
              gravity: 1.5,
              scalingRatio: 20,
              strongGravityMode: true,
              barnesHutOptimize: g.order > 40,
            },
          });
        } catch { /* fallback */ }
      }

      g.forEachNode((id, attrs) => {
        nodePositionsRef.current.set(id, {
          x: attrs.x as number,
          y: attrs.y as number,
        });
      });

      try {
        const nodeReducer = (node: string, data: Record<string, unknown>) => {
          const isHovered = hoveredNodeRef.current === node;
          const isConnected = connectedNodesRef.current.has(node);
          const isSimHighlighted = simHighlightedRef.current.has(node);
          const baseColor = data.originalColor as string;
          const baseSize = data.originalSize as number;
          const progress = hoverProgressRef.current;

          let color = baseColor;
          let size = baseSize;
          let borderColor = 'transparent';
          let borderSize = 0;
          let labelSize = 11;
          let labelOpacity = 0;
          let labelColor = 'rgba(180,190,210,0)';

          const isLeavingHover = !isHovered && lastHoveredNodeRef.current === node && progress > 0;
          if (isHovered || isLeavingHover) {
            const p = isHovered ? Math.max(progress, 0.05) : (1 - progress);
            color = baseColor;
            size = baseSize * (1 + p * 0.15);
            borderColor = baseColor;
            borderSize = p * 3;
            labelSize = 11 * (1 + p * 0.5);
            labelOpacity = isHovered ? (0.6 + p * 0.4) : (0.6 - (1 - progress) * 0.5);
            labelColor = `rgba(180,190,210,${labelOpacity})`;
          } else if (isConnected && !isHovered) {
            color = baseColor;
            labelOpacity = 0;
          } else if (!hoveredNodeRef.current) {
            color = baseColor;
            labelOpacity = 0;
          } else {
            const isHex = typeof baseColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(baseColor);
            if (isHex) {
              const [r, g, b] = [parseInt(baseColor.slice(1, 3), 16), parseInt(baseColor.slice(3, 5), 16), parseInt(baseColor.slice(5, 7), 16)];
              color = `rgba(${r}, ${g}, ${b}, 0.2)`;
            } else {
              color = 'rgba(160,170,200,0.15)';
            }
            labelOpacity = 0;
          }

          if (isSimHighlighted) {
            size = baseSize * 1.6;
            color = baseColor;
            borderColor = 'rgba(255,95,31,0.8)';
            borderSize = 3;
            labelSize = 11;
            labelOpacity = 0.6;
          }

          const clickStart = clickedNodesRef.current.get(node);
          if (clickStart) {
            const now = performance.now();
            const elapsed = now - clickStart;
            if (elapsed < CLICK_PULSE_DURATION) {
              const pClick = 1 - Math.min(1, elapsed / CLICK_PULSE_DURATION);
              const pulse = easeOutCubic(pClick);
              size = size + baseSize * (pulse * 0.9);
              borderSize = Math.max(borderSize, pulse * 6);
              borderColor = `rgba(255,95,31,${Math.min(0.95, pulse * 0.95)})`;
              labelSize = Math.max(labelSize, 11 * 1.5);
              labelOpacity = 0.65 + pulse * 0.35;
              labelColor = `rgba(180,190,210,${labelOpacity})`;
            }
          }

          return {
            ...data,
            color,
            size,
            borderColor,
            borderSize,
            label: data.label as string,
            labelFont: "'Rajdhani', 'DM Sans', system-ui, sans-serif",
            labelSize,
            labelColor: { color: labelColor },
          };
        };

        const edgeReducer = (edge: string, data: Record<string, unknown>) => {
          const origColor = data.originalColor as string;
          const origSize = data.originalSize as number;
          const isConnected = connectedEdgesRef.current.has(edge);

          if (hoveredNodeRef.current && isConnected) {
            return {
              ...data,
              color: hoveredNodeColorRef.current,
              size: 2,
            };
          } else if (hoveredNodeRef.current && !isConnected) {
            const color = origColor.replace(/[\d.]+\)$/g, '0.2)');
            return {
              ...data,
              color,
              size: 0.8,
            };
          }
          return { ...data, color: origColor, size: origSize };
        };

        sigmaRef.current = new Sigma(g, containerRef.current, {
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

        sigmaRef.current.on('clickNode', ({ node }) => {
          const nodeData = nodesDataRef.current.find(n => n.id === node);
          clickedNodesRef.current.set(node, performance.now());
          startClickLoop();
          if (nodeData && onNodeClick) onNodeClick(nodeData);
        });

        sigmaRef.current.on('enterNode', ({ node }) => {
          lastHoveredNodeRef.current = node;
          hoveredNodeRef.current = node;
          if (containerRef.current) containerRef.current.style.cursor = 'pointer';

          const nodeData = g.getNodeAttributes(node);
          hoveredNodeColorRef.current = nodeData.originalColor || '#FF5F1F';

          const connected = new Set<string>();
          const connectedEdges = new Set<string>();
          g.forEachEdge((edge, _edgeAttrs, src, tgt) => {
            if (src === node || tgt === node) {
              connectedEdges.add(edge);
              if (src === node) connected.add(tgt);
              if (tgt === node) connected.add(src);
            }
          });
          connectedNodesRef.current = connected;
          connectedEdgesRef.current = connectedEdges;

          startHoverAnim();

          const foundNode = nodesDataRef.current.find(n => n.id === node);
          if (foundNode && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setTooltip({
              node: foundNode,
              x: rect.width / 2,
              y: 60,
              color: hoveredNodeColorRef.current,
            });
          }
        });

        sigmaRef.current.on('leaveNode', () => {
          hoveredNodeRef.current = null;
          connectedNodesRef.current.clear();
          connectedEdgesRef.current.clear();
          if (containerRef.current) containerRef.current.style.cursor = 'default';
          setTooltip(null);
          startHoverAnim();
        });

        sigmaRef.current.on('clickStage', () => {
          setTooltip(null);
        });

      } catch (e) {
        console.error('Sigma init error:', e);
      }

      // IMPORTANT: no cleanup returned — cleanup is in a separate effect
      return;
    }

    // ── Incremental update (preserving positions, no layout) ──
    nodesDataRef.current = nodes;
    const nodeIds = new Set(nodes.map(n => n.id));

    // Remove stale nodes
    Array.from(graph.nodes()).forEach(id => {
      if (!nodeIds.has(id)) {
        nodePositionsRef.current.set(id, {
          x: graph.getNodeAttribute(id, 'x'),
          y: graph.getNodeAttribute(id, 'y'),
        });
        graph.dropNode(id);
      }
    });

    // Add or update nodes
    nodes.forEach(n => {
      if (graph.hasNode(n.id)) {
        const oldLabel = graph.getNodeAttribute(n.id, 'label');
        if (oldLabel !== n.name) graph.setNodeAttribute(n.id, 'label', n.name);
        const oldColor = graph.getNodeAttribute(n.id, 'originalColor');
        const newColor = NODE_COLORS[n.label] || '#AAAAAA';
        if (oldColor !== newColor) {
          graph.setNodeAttribute(n.id, 'color', newColor);
          graph.setNodeAttribute(n.id, 'originalColor', newColor);
        }
      } else {
        const sev = n.severity || 5;
        const size = 6 + sev * 1.8;
        const savedPosition = nodePositionsRef.current.get(n.id);
        graph.addNode(n.id, {
          label: n.name,
          size,
          originalSize: size,
          color: NODE_COLORS[n.label] || '#AAAAAA',
          originalColor: NODE_COLORS[n.label] || '#AAAAAA',
          nodeLabel: n.label,
          severity: sev,
          x: savedPosition?.x ?? stableHash(n.id, 300),
          y: savedPosition?.y ?? stableHash(n.id + '_y', 300),
        });
      }
    });

    graph.forEachNode((id, attrs) => {
      nodePositionsRef.current.set(id, {
        x: attrs.x as number,
        y: attrs.y as number,
      });
    });

    // Remove stale edges, add new edges
    const edgeKeys = new Set(edges.map(e => `${e.from}->${e.to}`));
    Array.from(graph.edges()).forEach(edgeId => {
      const [s, t] = graph.extremities(edgeId);
      if (!edgeKeys.has(`${s}->${t}`)) graph.dropEdge(edgeId);
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

    sigmaRef.current.refresh();
  }, [nodes, edges, onNodeClick, startHoverAnim]);

  // ── Cleanup on unmount only ──
  useEffect(() => {
    return () => {
      if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(hoverAnimFrameRef.current);
      if (clickAnimFrameRef.current) cancelAnimationFrame(clickAnimFrameRef.current);
      hoverAnimRunningRef.current = false;
      hoverAnimFrameRef.current = 0;
      clickAnimFrameRef.current = 0;
      hoveredNodeRef.current = null;
      connectedNodesRef.current.clear();
      connectedEdgesRef.current.clear();
    };
  }, []);

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

  // Expose reset camera function to parent
  useEffect(() => {
    if (onReady && sigmaRef.current) {
      onReady(() => {
        sigmaRef.current?.getCamera().animatedReset();
      });
    }
  }, [onReady]);

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
            '--accent-color': tooltip.color,
          } as React.CSSProperties & { '--accent-color': string }}
        >
          <div className="graph-tooltip-scan-line"></div>

          <div className="graph-tooltip-header">
            <div className="graph-tooltip-name">{tooltip.node.name}</div>
            <div
              className="graph-tooltip-type-badge"
              style={{ backgroundColor: `${tooltip.color}40` }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: tooltip.color,
                  display: 'inline-block',
                  marginRight: '6px',
                }}
              ></span>
              {tooltip.node.label}
            </div>
          </div>

          <div className="graph-tooltip-body">
            <div className="graph-tooltip-row">
              <span className="graph-tooltip-label">SEVERITY</span>
              <div className="graph-tooltip-bar-container">
                <div
                  className="graph-tooltip-progress-bar"
                  style={{
                    width: `${((tooltip.node.severity || 5) / 10) * 100}%`,
                    backgroundColor: tooltip.color,
                  }}
                ></div>
              </div>
            </div>
            <div className="graph-tooltip-row">
              <span className="graph-tooltip-label">RISK CONTRIB</span>
              <span className="graph-tooltip-value">—</span>
            </div>
            <div className="graph-tooltip-row">
              <span className="graph-tooltip-label">CONNECTED</span>
              <span className="graph-tooltip-value">{connectedNodesRef.current.size}</span>
            </div>
            <div className="graph-tooltip-row">
              <span className="graph-tooltip-label">PATHS</span>
              <span className="graph-tooltip-value">—</span>
            </div>
          </div>

          <div className="graph-tooltip-footer">
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: tooltip.color,
                display: 'inline-block',
                marginRight: '8px',
              }}
            ></span>
            <span className="graph-tooltip-location">Location · 2026</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphView;

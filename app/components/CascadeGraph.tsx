import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, View, Dimensions, StyleSheet, Text } from 'react-native';
import Svg, { Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { CascadePath, PositionedNode, RenderedEdge } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_WIDTH = SCREEN_WIDTH - 40;
const GRAPH_HEIGHT = 320;
const CENTER_X = GRAPH_WIDTH / 2;
const CENTER_Y = GRAPH_HEIGHT / 2;
const RING_RADIUS = 95;

// Color for each node label type
const NODE_COLORS: Record<string, string> = {
  Hazard: '#FF5F1F',
  Infrastructure: '#3D8EF0',
  Resource: '#E04545',
  Event: '#F4A020',
  Failure: '#8B0000',
  Scenario: '#9F7DFC',
};

// Extract unique nodes and edges from all cascade paths
// Build a depth map: how many hops from the start node
function extractGraphData(paths: CascadePath[]): {
  nodes: PositionedNode[];
  edges: RenderedEdge[];
} {
  const nodeMap = new Map<string, { node: CascadeNode; depth: number }>();
  const edgeSet = new Set<string>();
  const edgeList: Array<{ from: string; to: string; prob: number; type: string; mechanism: string }> = [];

  paths.forEach(path => {
    path.nodes.forEach((node, i) => {
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, { node, depth: i });
      }
    });

    path.edges.forEach((edge, i) => {
      const fromId = path.nodes[i]?.id;
      const toId = path.nodes[i + 1]?.id;
      if (!fromId || !toId) return;
      const key = `${fromId}→${toId}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edgeList.push({ from: fromId, to: toId, prob: edge.prob, type: edge.type, mechanism: edge.mechanism });
      }
    });
  });

  // Group nodes by depth for radial positioning
  const byDepth = new Map<number, Array<{ node: any; depth: number }>>();
  nodeMap.forEach(entry => {
    const d = entry.depth;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(entry);
  });

  // Calculate x,y position for each node in concentric rings
  const positionedNodes: PositionedNode[] = [];
  const posMap = new Map<string, { x: number; y: number }>();

  byDepth.forEach((entries, depth) => {
    const count = entries.length;
    const radius = depth === 0 ? 0 : depth * RING_RADIUS;

    entries.forEach((entry, i) => {
      const angle = count === 1
        ? -Math.PI / 2  // single node goes straight up
        : ((2 * Math.PI) / count) * i - Math.PI / 2;

      const x = CENTER_X + radius * Math.cos(angle);
      const y = CENTER_Y + radius * Math.sin(angle);

      positionedNodes.push({ ...entry.node, x, y, depth });
      posMap.set(entry.node.id, { x, y });
    });
  });

  // Build rendered edges with actual coordinates
  const renderedEdges: RenderedEdge[] = edgeList
    .filter(e => posMap.has(e.from) && posMap.has(e.to))
    .map(e => ({
      fromX: posMap.get(e.from)!.x,
      fromY: posMap.get(e.from)!.y,
      toX: posMap.get(e.to)!.x,
      toY: posMap.get(e.to)!.y,
      prob: e.prob,
      type: e.type,
      mechanism: e.mechanism,
    }));

  return { nodes: positionedNodes, edges: renderedEdges };
}

// Import the type separately to avoid circular reference
import { CascadeNode } from '../types';

interface Props {
  paths: CascadePath[];
  onNodePress?: (node: PositionedNode) => void;
}

export default function CascadeGraph({ paths, onNodePress }: Props) {
  const { nodes, edges } = useMemo(() => extractGraphData(paths), [paths]);

  // One Animated.Value per node — controls opacity and scale
  const anims = useRef<Animated.Value[]>([]).current;

  // Initialize animation values if needed
  if (anims.length !== nodes.length) {
    anims.length = 0;
    nodes.forEach(() => anims.push(new Animated.Value(0)));
  }

  useEffect(() => {
    if (nodes.length === 0) return;

    // Reset all to invisible
    anims.forEach(a => a.setValue(0));

    // Calculate delay for each node based on its depth
    // Each ring = 800ms later, simulating real cascade timing
    const animations = nodes.map((node, i) => {
      const delay = node.depth * 800;
      return Animated.timing(anims[i], {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      });
    });

    Animated.parallel(animations).start();
  }, [paths]);

  if (nodes.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No cascade data</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT}>
        {/* Draw edges first so they appear behind nodes */}
        {edges.map((edge, i) => (
          <G key={`edge-${i}`}>
            <Line
              x1={edge.fromX}
              y1={edge.fromY}
              x2={edge.toX}
              y2={edge.toY}
              stroke={`rgba(255,255,255,${Math.max(0.15, edge.prob * 0.4)})`}
              strokeWidth={Math.max(1, edge.prob * 3)}
              strokeDasharray={edge.prob < 0.7 ? '4 4' : undefined}
            />
          </G>
        ))}

        {/* Draw node circles — positioned but opacity controlled by Animated */}
        {nodes.map((node, i) => {
          const color = NODE_COLORS[node.label] || '#ffffff';
          const radius = node.depth === 0 ? 28 : 20;
          const fontSize = node.depth === 0 ? 8 : 7;

          return (
            <G key={`node-${node.id}`}>
              {/* Glow ring behind node */}
              <Circle
                cx={node.x}
                cy={node.y}
                r={radius + 6}
                fill={`${color}22`}
              />
              {/* Main node circle */}
              <Circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={color}
                opacity={0.9}
                onPress={() => onNodePress?.(node)}
              />
              {/* Severity number inside node (only for Hazards) */}
              {node.severity && (
                <SvgText
                  x={node.x}
                  y={node.y - 3}
                  textAnchor="middle"
                  fill="white"
                  fontSize={fontSize + 2}
                  fontWeight="bold"
                >
                  {node.severity}
                </SvgText>
              )}
              {/* Node label below circle */}
              <SvgText
                x={node.x}
                y={node.y + radius + 12}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                fontSize={fontSize}
              >
                {node.name.length > 12 ? node.name.substring(0, 12) + '…' : node.name}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {Object.entries(NODE_COLORS).slice(0, 4).map(([label, color]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#0a0b0d',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  empty: {
    height: GRAPH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: 8,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
});
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ActivityIndicator, TouchableOpacity,
  Animated, Dimensions, StatusBar, ScrollView,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { fetchScenarioDetails, fetchCascade } from '../api/client';
import type { CascadeNode, CascadeEdge } from '../api/client';
import type { RootStackParamList } from '../types';
import RiskBadge from '../components/RiskBadge';

const SCREEN_W = Dimensions.get('window').width;
const SVG_SIZE = SCREEN_W;
const CENTER = SVG_SIZE / 2;
const VIEWBOX_SIZE = 400;

const NODE_COLORS: Record<string, string> = {
  Hazard: '#FF5F1F',
  Infrastructure: '#3D8EF0',
  Resource: '#E04545',
  Failure: '#8B0000',
  Event: '#F4A020',
};

function getNodeColor(label: string): string {
  return NODE_COLORS[label] || '#6b7280';
}

interface Position { x: number; y: number }

function computeDepths(nodes: CascadeNode[], edges: CascadeEdge[], hazardId: string): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: hazardId, depth: 0 }];
  depths.set(hazardId, 0);
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    for (const neighbor of adj.get(id) || []) {
      if (!depths.has(neighbor)) {
        depths.set(neighbor, depth + 1);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }
  for (const n of nodes) {
    if (!depths.has(n.id)) depths.set(n.id, 1);
  }
  return depths;
}

function computePositions(nodes: CascadeNode[], depths: Map<string, number>): Map<string, Position> {
  const byDepth = new Map<number, CascadeNode[]>();
  let maxDepth = 0;
  for (const n of nodes) {
    const d = depths.get(n.id) ?? 1;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n);
    maxDepth = Math.max(maxDepth, d);
  }
  const baseRadius = 50;
  const radiusStep = Math.min(140, (VIEWBOX_SIZE * 0.38) / Math.max(maxDepth, 1));
  const positions = new Map<string, Position>();
  for (const [depth, ns] of byDepth.entries()) {
    const radius = depth === 0 ? 0 : baseRadius + depth * radiusStep;
    const count = ns.length;
    const angleStep = (2 * Math.PI) / count;
    const startAngle = depth % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + angleStep / 2;
    ns.forEach((n, i) => {
      const angle = startAngle + i * angleStep;
      positions.set(n.id, {
        x: CENTER + radius * Math.cos(angle),
        y: CENTER + radius * Math.sin(angle),
      });
    });
  }
  return positions;
}

export default function CascadeScreen({
  navigation,
  route,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Cascade'>;
  route: RouteProp<RootStackParamList, 'Cascade'>;
}) {
  const { scenarioId, scenarioName } = route.params;
  const [nodes, setNodes] = useState<CascadeNode[]>([]);
  const [edges, setEdges] = useState<CascadeEdge[]>([]);
  const [hazardId, setHazardId] = useState<string | null>(null);
  const [riskScore, setRiskScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const animValues = useRef<Animated.Value[]>([]);
  const [animReady, setAnimReady] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnimReady(false);
    try {
      const details = await fetchScenarioDetails(scenarioId);
      const hazardNode = details.nodes.find(n => n.label === 'Hazard');
      if (!hazardNode) throw new Error('No hazard node found in scenario');
      setHazardId(hazardNode.id);
      setNodes(details.nodes);
      setEdges(details.edges);
      const cascade = await fetchCascade(hazardNode.id);
      setRiskScore(cascade.riskScore);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cascade data');
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => { loadData(); }, [loadData]);

  const depths = useMemo(() => {
    if (nodes.length === 0 || !hazardId) return new Map();
    return computeDepths(nodes, edges, hazardId);
  }, [nodes, edges, hazardId]);

  const positions = useMemo(() => {
    if (nodes.length === 0) return new Map();
    return computePositions(nodes, depths);
  }, [nodes, depths]);

  useEffect(() => {
    if (nodes.length === 0) return;
    animValues.current = nodes.map(() => new Animated.Value(0));
    const anims = animValues.current.map(av =>
      Animated.timing(av, { toValue: 1, duration: 300, useNativeDriver: false })
    );
    Animated.stagger(300, anims).start(() => setAnimReady(true));
  }, [nodes.length]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#07080a" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5F1F" />
          <Text style={styles.statusText}>Loading cascade data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#07080a" />
        <View style={styles.center}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const maxDepth = nodes.reduce((m, n) => Math.max(m, depths.get(n.id) ?? 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#07080a" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{scenarioName}</Text>
          <Text style={styles.headerSub}>{nodes.length} nodes · depth {maxDepth}</Text>
        </View>
        {hazardId && (
          <TouchableOpacity
            style={styles.timelineBtn}
            onPress={() => navigation.navigate('Timeline', { scenarioId, scenarioName, hazardId })}
          >
            <Text style={styles.timelineBtnText}>Timeline</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.graphWrap}>
          <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
            {edges.map((e, i) => {
              const from = positions.get(e.from);
              const to = positions.get(e.to);
              if (!from || !to) return null;
              return (
                <Line
                  key={`edge-${i}`}
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  stroke="#ffffff"
                  strokeOpacity={Math.max(0.15, e.prob * 0.7)}
                  strokeWidth={1.5}
                />
              );
            })}
            {nodes.map((n, i) => {
              const pos = positions.get(n.id);
              if (!pos) return null;
              const radius = Math.max(6, Math.min(22, (n.severity ?? 5) * 2.2));
              const color = getNodeColor(n.label);
              const animVal = animValues.current[i];
              return (
                <AnimatedSvgCircle
                  key={n.id}
                  cx={pos.x} cy={pos.y}
                  r={radius}
                  fill={color}
                  opacity={animVal ?? 1}
                />
              );
            })}
            {nodes.map((n, i) => {
              const pos = positions.get(n.id);
              if (!pos) return null;
              const radius = Math.max(6, Math.min(22, (n.severity ?? 5) * 2.2));
              const animVal = animValues.current[i];
              return (
                <AnimatedSvgText
                  key={`label-${n.id}`}
                  x={pos.x}
                  y={pos.y + radius + 12}
                  fill="#9ca3af"
                  fontSize={9}
                  textAnchor="middle"
                  opacity={animVal ?? 1}
                >
                  {n.name.length > 20 ? n.name.slice(0, 18) + '…' : n.name}
                </AnimatedSvgText>
              );
            })}
          </Svg>
        </View>
        <RiskBadge score={riskScore} />
        <View style={styles.legend}>
          {Object.entries(NODE_COLORS).map(([label, color]) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const AnimatedSvgCircle = Animated.createAnimatedComponent(Circle);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  backBtn: {
    paddingRight: 8,
  },
  backText: {
    color: '#FF5F1F',
    fontSize: 15,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 1,
  },
  timelineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3D8EF0',
  },
  timelineBtnText: {
    color: '#3D8EF0',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  graphWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    color: '#6b7280',
    marginTop: 12,
    fontSize: 13,
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorText: {
    color: '#FF3D3D',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF5F1F',
  },
  retryText: {
    color: '#FF5F1F',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 8,
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
    color: '#6b7280',
    fontSize: 11,
  },
});

import React, { useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, StatusBar
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, CascadeNode } from '../types';
import RiskBadge from '../components/RiskBadge';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Timeline'>;
  route: RouteProp<RootStackParamList, 'Timeline'>;
};

const NODE_COLORS: Record<string, string> = {
  Hazard: '#FF5F1F',
  Infrastructure: '#3D8EF0',
  Resource: '#E04545',
  Event: '#F4A020',
  Failure: '#8B0000',
};

interface TimelineEvent {
  node: CascadeNode;
  cumulativeHours: number;
  mechanism: string;
  probability: number;
}

// Build a chronological list of unique cascade events
// sorted by the earliest time they appear in any path
function buildTimeline(paths: any[]): TimelineEvent[] {
  const eventMap = new Map<string, TimelineEvent>();

  paths.forEach(path => {
    let cumHours = 0;
    path.nodes.forEach((node: CascadeNode, i: number) => {
      const edge = path.edges[i - 1];
      if (edge) cumHours += (edge.delay_hrs || 0);

      if (!eventMap.has(node.id) || eventMap.get(node.id)!.cumulativeHours > cumHours) {
        eventMap.set(node.id, {
          node,
          cumulativeHours: cumHours,
          mechanism: edge?.mechanism || 'Initial disaster event',
          probability: path.probability_pct,
        });
      }
    });
  });

  return Array.from(eventMap.values()).sort((a, b) => a.cumulativeHours - b.cumulativeHours);
}

function formatHours(hours: number): string {
  if (hours === 0) return 'Hour 0 — Impact';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours === 1) return '1 hour later';
  if (hours < 24) return `${hours} hours later`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return remaining > 0 ? `${days}d ${remaining}h later` : `${days} days later`;
}

export default function TimelineScreen({ navigation, route }: Props) {
  const { paths, riskScore, scenarioName } = route.params;
  const timeline = useMemo(() => buildTimeline(paths), [paths]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={timeline}
        keyExtractor={(item, i) => `${item.node.id}-${i}`}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.backArrow}>← Back to Graph</Text>
              </TouchableOpacity>
              <Text style={styles.screenLabel}>CASCADE TIMELINE</Text>
              <Text style={styles.scenarioName}>{scenarioName}</Text>
            </View>

            {/* Risk Summary */}
            <View style={styles.summaryCard}>
              <RiskBadge score={riskScore} size={72} />
              <View style={styles.summaryText}>
                <Text style={styles.summaryTitle}>Overall Risk Score</Text>
                <Text style={styles.summaryDesc}>
                  {timeline.length} cascade events identified across{' '}
                  {paths.length} failure paths
                </Text>
                <Text style={styles.summaryTime}>
                  Full cascade spans{' '}
                  {timeline[timeline.length - 1]?.cumulativeHours || 0} hours
                </Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>EVENTS IN ORDER OF OCCURRENCE</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const color = NODE_COLORS[item.node.label] || '#ffffff';
          const isFirst = index === 0;
          const isLast = index === timeline.length - 1;

          return (
            <View style={styles.timelineRow}>
              {/* Left side — line and dot */}
              <View style={styles.timelineLeft}>
                {!isFirst && <View style={[styles.lineTop, { backgroundColor: `${color}44` }]} />}
                <View style={[styles.dot, { backgroundColor: color }]} />
                {!isLast && <View style={[styles.lineBottom, { backgroundColor: `${color}44` }]} />}
              </View>

              {/* Right side — content */}
              <View style={[styles.eventCard, isFirst && { borderColor: `${color}55` }]}>
                <Text style={[styles.timeLabel, { color }]}>
                  {formatHours(item.cumulativeHours)}
                </Text>

                <Text style={styles.eventName}>{item.node.name}</Text>

                <View style={styles.eventMeta}>
                  <View style={[styles.labelBadge, { backgroundColor: `${color}22` }]}>
                    <Text style={[styles.labelBadgeText, { color }]}>{item.node.label}</Text>
                  </View>
                  {item.node.severity && (
                    <Text style={styles.severityText}>Severity {item.node.severity}/10</Text>
                  )}
                </View>

                <Text style={styles.mechanism}>{item.mechanism}</Text>

                <Text style={styles.probability}>
                  {item.probability.toFixed(1)}% probability path
                </Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              End of cascade chain. {timeline.length} systems affected.
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07080a' },
  list: { paddingBottom: 40 },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backArrow: { color: '#FF5F1F', fontSize: 14, fontWeight: '600', marginBottom: 14 },
  screenLabel: { color: '#FF5F1F', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  scenarioName: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#0e1014', marginHorizontal: 20,
    borderRadius: 12, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  summaryText: { flex: 1 },
  summaryTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  summaryDesc: { color: '#6b7280', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  summaryTime: { color: '#9ca3af', fontSize: 11 },
  sectionLabel: {
    color: '#FF5F1F', fontSize: 10, fontWeight: '800',
    letterSpacing: 2, marginHorizontal: 20, marginBottom: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    minHeight: 100,
  },
  timelineLeft: {
    width: 32, alignItems: 'center',
  },
  lineTop: { flex: 1, width: 2, marginBottom: 2 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    zIndex: 1,
  },
  lineBottom: { flex: 1, width: 2, marginTop: 2 },
  eventCard: {
    flex: 1, marginLeft: 12, marginBottom: 8,
    backgroundColor: '#0e1014',
    borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  timeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  eventName: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  labelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  labelBadgeText: { fontSize: 10, fontWeight: '700' },
  severityText: { color: '#6b7280', fontSize: 11 },
  mechanism: { color: '#9ca3af', fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginBottom: 6 },
  probability: { color: '#4b5563', fontSize: 11 },
  footer: { alignItems: 'center', padding: 24 },
  footerText: { color: '#374151', fontSize: 12 },
});
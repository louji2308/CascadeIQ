import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator,
  TouchableOpacity, StatusBar,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { fetchCascade } from '../api/client';
import type { CascadePath } from '../api/client';
import type { RootStackParamList } from '../types';

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

function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

interface TimelineEntry {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeLabel: string;
  mechanism: string;
  hours: number;
  depth: number;
}

function buildTimeline(paths: CascadePath[]): TimelineEntry[] {
  const seen = new Set<string>();
  const entries: TimelineEntry[] = [];
  for (const path of paths) {
    let cumTime = 0;
    for (let i = 1; i < path.nodes.length; i++) {
      const node = path.nodes[i];
      const edge = path.edges[i - 1];
      cumTime += edge?.delay_hrs ?? 0;
      const key = node.id;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({
          id: `${path.depth}-${i}-${node.id}`,
          nodeId: node.id,
          nodeName: node.name,
          nodeLabel: node.label,
          mechanism: edge?.mechanism ?? '',
          hours: cumTime,
          depth: path.depth,
        });
      }
    }
  }
  entries.sort((a, b) => a.hours - b.hours || a.depth - b.depth);
  return entries;
}

export default function TimelineScreen({
  navigation,
  route,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Timeline'>;
  route: RouteProp<RootStackParamList, 'Timeline'>;
}) {
  const { scenarioName, hazardId } = route.params;
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cascade = await fetchCascade(hazardId);
      setEntries(buildTimeline(cascade.paths));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [hazardId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#07080a" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5F1F" />
          <Text style={styles.statusText}>Loading timeline...</Text>
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
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#07080a" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{scenarioName}</Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const color = getNodeColor(item.nodeLabel);
          const isLast = index === entries.length - 1;
          return (
            <View style={styles.entry}>
              <View style={styles.dotCol}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                {!isLast && <View style={styles.line} />}
              </View>
              <View style={styles.content}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.nodeName, { color }]}>{item.nodeName}</Text>
                  <Text style={styles.time}>{formatTime(item.hours)}</Text>
                </View>
                <Text style={styles.nodeLabel}>{item.nodeLabel}</Text>
                {item.mechanism ? (
                  <Text style={styles.mechanism}>{item.mechanism}</Text>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No cascade entries found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

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
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  list: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  entry: {
    flexDirection: 'row',
    minHeight: 60,
  },
  dotCol: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: '#1f2937',
    marginVertical: 2,
  },
  content: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 20,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  time: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  nodeLabel: {
    color: '#6b7280',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  mechanism: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
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
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },
});

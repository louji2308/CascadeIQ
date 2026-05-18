import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, StatusBar
} from 'react-native';
import axios from 'axios';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { ENDPOINTS } from '../constants/api';
import { CascadeResponse, PositionedNode, RootStackParamList } from '../types';
import CascadeGraph from '../components/CascadeGraph';
import RiskBadge from '../components/RiskBadge';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Cascade'>;
  route: RouteProp<RootStackParamList, 'Cascade'>;
};

export default function CascadeScreen({ navigation, route }: Props) {
  const { hazardId, scenarioName } = route.params;
  const [data, setData] = useState<CascadeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);

  useEffect(() => {
    async function fetchCascade() {
      try {
        const res = await axios.get(ENDPOINTS.cascade(hazardId), { timeout: 15000 });
        setData(res.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchCascade();
  }, [hazardId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#FF5F1F" size="large" />
        <Text style={styles.loadingText}>Analyzing cascade paths...</Text>
        <Text style={styles.loadingSubtext}>Querying Neo4j graph database</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load cascade data</Text>
        <Text style={styles.errorSub}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.scenarioName}>{scenarioName}</Text>
          <Text style={styles.hazardName}>{data.hazard.name}</Text>
        </View>

        {/* Risk Score + Stats Row */}
        <View style={styles.statsRow}>
          <RiskBadge score={data.riskScore} size={90} />
          <View style={styles.statsRight}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{data.pathCount}</Text>
              <Text style={styles.statLbl}>cascade paths</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{data.hazard.severity}/10</Text>
              <Text style={styles.statLbl}>severity</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>
                {data.paths.length > 0
                  ? `${Math.max(...data.paths.map(p => p.depth))} hops`
                  : '—'}
              </Text>
              <Text style={styles.statLbl}>max depth</Text>
            </View>
          </View>
        </View>

        {/* Graph */}
        <Text style={styles.sectionLabel}>CASCADE GRAPH</Text>
        <CascadeGraph
          paths={data.paths}
          onNodePress={setSelectedNode}
        />

        {/* Selected Node Detail Panel */}
        {selectedNode && (
          <View style={styles.nodePanel}>
            <View style={styles.nodePanelHeader}>
              <Text style={styles.nodePanelTitle}>{selectedNode.name}</Text>
              <TouchableOpacity onPress={() => setSelectedNode(null)}>
                <Text style={styles.nodePanelClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.nodePanelLabel}>{selectedNode.label}</Text>
            {selectedNode.severity && (
              <Text style={styles.nodePanelDetail}>Severity: {selectedNode.severity}/10</Text>
            )}
            {selectedNode.type && (
              <Text style={styles.nodePanelDetail}>Type: {selectedNode.type}</Text>
            )}
          </View>
        )}

        {/* Top Cascade Paths */}
        <Text style={styles.sectionLabel}>TOP CASCADE PATHS</Text>
        {data.paths.slice(0, 5).map((path, i) => (
          <View key={i} style={styles.pathCard}>
            <View style={styles.pathHeader}>
              <Text style={styles.pathProb}>{path.probability_pct}%</Text>
              <Text style={styles.pathDepth}>{path.depth} hops · {path.hours_to_end}hrs</Text>
            </View>
            <Text style={styles.pathChain}>
              {path.nodes.map(n => n.name).join(' → ')}
            </Text>
            {path.edges[path.edges.length - 1]?.mechanism && (
              <Text style={styles.pathMechanism}>
                "{path.edges[path.edges.length - 1].mechanism}"
              </Text>
            )}
          </View>
        ))}

        {/* View Timeline Button */}
        <TouchableOpacity
          style={styles.timelineBtn}
          onPress={() => navigation.navigate('Timeline', {
            paths: data.paths,
            riskScore: data.riskScore,
            scenarioName,
          })}
        >
          <Text style={styles.timelineBtnText}>View Chronological Timeline →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07080a' },
  center: {
    flex: 1, backgroundColor: '#07080a',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  scroll: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 20 },
  backArrow: { color: '#FF5F1F', fontSize: 14, marginBottom: 12, fontWeight: '600' },
  scenarioName: { color: '#6b7280', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  hazardName: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 24, gap: 20,
  },
  statsRight: { flex: 1, gap: 10 },
  statItem: {},
  statNum: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  statLbl: { color: '#6b7280', fontSize: 11 },
  sectionLabel: {
    color: '#FF5F1F', fontSize: 10, fontWeight: '800',
    letterSpacing: 2, marginBottom: 10, marginTop: 4,
  },
  nodePanel: {
    backgroundColor: '#0e1014', borderRadius: 10,
    padding: 14, marginTop: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#FF5F1F44',
  },
  nodePanelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  nodePanelTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', flex: 1 },
  nodePanelClose: { color: '#6b7280', fontSize: 16, paddingLeft: 8 },
  nodePanelLabel: { color: '#FF5F1F', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  nodePanelDetail: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  pathCard: {
    backgroundColor: '#0e1014', borderRadius: 10,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  pathHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  pathProb: { color: '#FF5F1F', fontSize: 15, fontWeight: '800' },
  pathDepth: { color: '#6b7280', fontSize: 12 },
  pathChain: { color: '#ffffff', fontSize: 12, lineHeight: 18 },
  pathMechanism: { color: '#6b7280', fontSize: 11, fontStyle: 'italic', marginTop: 6 },
  timelineBtn: {
    backgroundColor: '#FF5F1F', borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 16, marginBottom: 20,
  },
  timelineBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  loadingText: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 16 },
  loadingSubtext: { color: '#6b7280', fontSize: 12, marginTop: 6 },
  errorText: { color: '#ef4444', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  errorSub: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginBottom: 20 },
  backBtn: { backgroundColor: '#1a1b1e', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: '#ffffff', fontWeight: '600' },
});
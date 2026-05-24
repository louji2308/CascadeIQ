import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, StatusBar, RefreshControl
} from 'react-native';
import axios from 'axios';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ENDPOINTS } from '../constants/api';
import { Scenario, RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

// Map disaster type to a starting hazard ID
// The cascade screen needs a hazardId to start the path query
const SCENARIO_HAZARD_MAP: Record<string, string> = {
  'lahaina_2023': 'hazard_wildfire_lahaina',
  'turkey_eq_2023': 'hazard_eq_turkey',
  'pakistan_floods_2022': 'hazard_rainfall_pakistan',
  'live_wildfires_satellite': '',  // filled dynamically
};

const TYPE_COLORS: Record<string, string> = {
  wildfire: '#FF5F1F',
  earthquake: '#F4A020',
  flood: '#3D8EF0',
};


function getScenarioType(id: string): string {
  if (id.includes('wildfire') || id.includes('lahaina')) return 'wildfire';
  if (id.includes('eq') || id.includes('earthquake') || id.includes('turkey')) return 'earthquake';
  if (id.includes('flood') || id.includes('pakistan')) return 'flood';
  return 'wildfire';
}

export default function HomeScreen({ navigation }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchScenarios() {
    try {
      setError(null);
      const res = await axios.get(ENDPOINTS.scenarios, { timeout: 10000 });
      setScenarios(res.data.data);
    } catch (err: any) {
      setError(
        err.code === 'ECONNREFUSED' || err.message.includes('Network')
          ? 'Cannot reach API. Is your server running?\nCheck constants/api.ts has your correct IP.'
          : err.message
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchScenarios(); }, []);

  function handleScenarioPress(scenario: Scenario) {
    // Special case: live scenario needs to fetch its hazard dynamically
    if (scenario.id === 'live_wildfires_satellite') {
      navigation.navigate('Cascade', {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        hazardId: 'live_fire',
        hazardName: 'Live Satellite Fire',
      });
      return;
    }

    const hazardId = SCENARIO_HAZARD_MAP[scenario.id];
    if (!hazardId) {
      alert(`No hazard mapped for scenario: ${scenario.id}`);
      return;
    }
    navigation.navigate('Cascade', {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      hazardId,
      hazardName: scenario.name,
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#FF5F1F" size="large" />
        <Text style={styles.loadingText}>Connecting to CascadeIQ...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Connection Failed</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchScenarios}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>CascadeIQ</Text>
        <Text style={styles.subtitle}>Graph-native disaster intelligence</Text>
        <View style={styles.divider} />
        <Text style={styles.instruction}>Select a disaster scenario to analyze its cascade</Text>
      </View>

      {/* Scenario Cards */}
      <FlatList
        data={scenarios}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchScenarios(); }}
            tintColor="#FF5F1F"
          />
        }
        renderItem={({ item }) => {
          const type = getScenarioType(item.id);
          const color = TYPE_COLORS[type] || '#FF5F1F';

          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: color }]}
              onPress={() => handleScenarioPress(item)}
              activeOpacity={0.75}
            >
              <View style={styles.cardTop}>
                <View style={[styles.typeBadge, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
                  <Text style={[styles.typeText, { color }]}>{type.toUpperCase()}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={[styles.cardYear, { color }]}>{item.year}</Text>
                  <Text style={styles.cardLocation}>{item.location}</Text>
                </View>
                <View style={[styles.cardBadge, { backgroundColor: `${color}22` }]}>
                  <Text style={[styles.cardBadgeText, { color }]}>ANALYZE →</Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>

              <View style={styles.cardStats}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {item.deaths?.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>casualties</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    ${(item.damage_usd / 1e9).toFixed(1)}B
                  </Text>
                  <Text style={styles.statLabel}>damage</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{item.year}</Text>
                  <Text style={styles.statLabel}>year</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07080a' },
  center: {
    flex: 1, backgroundColor: '#07080a',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  title: {
    color: '#ffffff', fontSize: 34, fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: { color: '#FF5F1F', fontSize: 13, fontWeight: '600', marginTop: 2 },
  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 14,
  },
  instruction: { color: '#6b7280', fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#0e1014',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  typeBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
    minWidth: 70,
  },
  typeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardMeta: { flex: 1 },
  cardYear: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  cardLocation: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  cardBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  cardBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardTitle: {
    color: '#ffffff', fontSize: 18, fontWeight: '800',
    marginBottom: 6,
  },
  cardDescription: { color: '#6b7280', fontSize: 13, lineHeight: 18, marginBottom: 14 },
  cardStats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  statLabel: { color: '#6b7280', fontSize: 10, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.07)' },
  loadingText: { color: '#6b7280', marginTop: 14, fontSize: 13 },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  errorMsg: { color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  retryBtn: {
    backgroundColor: '#FF5F1F', paddingHorizontal: 28,
    paddingVertical: 12, borderRadius: 8,
  },
  retryText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});

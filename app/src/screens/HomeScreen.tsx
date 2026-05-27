import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet, SafeAreaView,
  TouchableOpacity, StatusBar,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchScenarios } from '../api/client';
import type { Scenario } from '../api/client';
import type { RootStackParamList } from '../types';
import ScenarioCard from '../components/ScenarioCard';

export default function HomeScreen({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList, 'Home'> }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScenarios();
      setScenarios(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#07080a" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5F1F" />
          <Text style={styles.loadingText}>Loading scenarios...</Text>
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
        <Text style={styles.title}>CASCADE<Text style={styles.titleAccent}>IQ</Text></Text>
        <Text style={styles.subtitle}>Disaster Cascade Scenarios</Text>
      </View>
      <FlatList
        data={scenarios}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ScenarioCard
            scenario={item}
            onPress={() => navigation.navigate('Cascade', { scenarioId: item.id, scenarioName: item.name })}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
  },
  titleAccent: {
    color: '#FF5F1F',
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 2,
  },
  list: {
    paddingBottom: 24,
  },
  loadingText: {
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
});

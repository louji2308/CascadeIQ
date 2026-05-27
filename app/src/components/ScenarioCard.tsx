import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Scenario } from '../api/client';

export default function ScenarioCard({ scenario, onPress }: { scenario: Scenario; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{scenario.name}</Text>
        <Text style={styles.year}>{scenario.year}</Text>
      </View>
      <Text style={styles.location}>{scenario.location}</Text>
      <View style={styles.stats}>
        <Text style={styles.statLabel}>Deaths</Text>
        <Text style={styles.statValue}>{scenario.deaths.toLocaleString()}</Text>
      </View>
      {scenario.description && (
        <Text style={styles.description} numberOfLines={2}>{scenario.description}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#14181f',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  year: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  location: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 10,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: '#FF5F1F',
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
});

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export function getRiskLevel(score: number): string {
  if (score < 40) return 'LOW';
  if (score < 65) return 'MODERATE';
  if (score < 85) return 'HIGH';
  return 'CRITICAL';
}

export function getRiskColor(score: number): string {
  if (score < 40) return '#00E676';
  if (score < 65) return '#FFD740';
  if (score < 85) return '#FF9800';
  return '#FF3D3D';
}

export default function RiskBadge({ score }: { score: number }) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const displayValue = useRef(0);
  const [displayed, setDisplayed] = React.useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    displayValue.current = 0;
    setDisplayed(0);
    const listener = animatedValue.addListener(({ value }) => {
      const current = Math.round(value * score);
      if (current !== displayValue.current) {
        displayValue.current = current;
        setDisplayed(current);
      }
    });
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    return () => animatedValue.removeListener(listener);
  }, [score, animatedValue]);

  const level = getRiskLevel(score);
  const color = getRiskColor(score);
  const bgOpacity = level === 'LOW' ? '0.15' : level === 'MODERATE' ? '0.15' : level === 'HIGH' ? '0.15' : '0.15';
  const bgColors: Record<string, string> = {
    LOW: 'rgba(0,230,118,0.15)',
    MODERATE: 'rgba(255,215,64,0.15)',
    HIGH: 'rgba(255,152,0,0.15)',
    CRITICAL: 'rgba(255,61,61,0.15)',
  };

  return (
    <View style={styles.container}>
      <View style={styles.scoreRow}>
        <Text style={[styles.score, { color }]}>{displayed}</Text>
        <Text style={styles.label}>RISK INDEX</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: bgColors[level] || 'transparent', borderColor: color + '40' }]}>
        <Text style={[styles.badgeText, { color }]}>{level}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  scoreRow: {
    alignItems: 'center',
  },
  score: {
    fontSize: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: '#6b7280',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: -4,
    textTransform: 'uppercase',
  },
  badge: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

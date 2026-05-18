import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface Props {
  score: number;  // 0-100
  size?: number;
}

function getRiskColor(score: number): string {
  if (score < 40) return '#22c55e'; // green
  if (score < 70) return '#f59e0b'; // amber
  if (score < 85) return '#f97316'; // orange
  return '#ef4444';                 // red
}

function getRiskLabel(score: number): string {
  if (score < 40) return 'LOW';
  if (score < 70) return 'MODERATE';
  if (score < 85) return 'HIGH';
  return 'CRITICAL';
}

export default function RiskBadge({ score, size = 90 }: Props) {
  const animatedScore = useRef(new Animated.Value(0)).current;
  const displayScore = useRef(0);
  const color = getRiskColor(score);

  useEffect(() => {
    Animated.timing(animatedScore, {
      toValue: score,
      duration: 1500,
      useNativeDriver: false,
    }).start();

    animatedScore.addListener(({ value }) => {
      displayScore.current = Math.round(value);
    });

    return () => animatedScore.removeAllListeners();
  }, [score]);

  return (
    <View style={[styles.container, {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderColor: color,
    }]}>
      <Text style={[styles.score, { color, fontSize: size * 0.32 }]}>
        {score}
      </Text>
      <Text style={[styles.label, { color, fontSize: size * 0.12 }]}>
        {getRiskLabel(score)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  score: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -4,
  },
});
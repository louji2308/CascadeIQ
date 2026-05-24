import React, { useState, useEffect } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

export default function App() {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    // If the user explicitly sets an IP via environment variables, use it.
    if (process.env.EXPO_PUBLIC_WEB_URL) {
      setUrl(process.env.EXPO_PUBLIC_WEB_URL);
      return;
    }

    // Attempt to dynamically get the IP of the dev machine
    let host = 'localhost';
    
    // In Expo Go, Constants.experienceUrl contains the IP address of the bundler
    if (Constants.experienceUrl && Constants.experienceUrl.startsWith('exp://')) {
      const match = Constants.experienceUrl.match(/exp:\/\/([^:]+)/);
      if (match && match[1]) {
        host = match[1];
      }
    } else if (Constants.expoConfig?.hostUri) {
      host = Constants.expoConfig.hostUri.split(':')[0];
    }
    
    // We assume the Vite dev server is running on port 5173
    setUrl(`http://${host}:5173`);
  }, []);

  if (!url) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5F1F" />
        <Text style={styles.loadingText}>Resolving connection...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#07080a" />
      <WebView 
        source={{ uri: url }} 
        style={styles.webview}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={[styles.loadingContainer, StyleSheet.absoluteFill]}>
            <ActivityIndicator size="large" color="#FF5F1F" />
            <Text style={styles.loadingText}>Connecting to Web App...</Text>
          </View>
        )}
        bounces={false}
        allowsInlineMediaPlayback={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080a',
  },
  webview: {
    flex: 1,
    backgroundColor: '#07080a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07080a',
  },
  loadingText: {
    color: '#6b7280',
    marginTop: 14,
    fontSize: 13,
  }
});
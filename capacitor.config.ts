import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.biggestchad.cubegame',
  appName: 'Cube Game',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#000000',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

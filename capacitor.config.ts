import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.singsing.safetyapp',
  appName: '파크골프 여름철 쌩쌩 안전앱',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.learnable.orbis',
  appName: 'Orbis',
  webDir: 'dist',
  backgroundColor: '#fff3dc',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    // Shrink the web view above the keyboard instead of letting iOS scroll the page.
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#fff3dc',
      showSpinner: false,
    },
  },
};

export default config;

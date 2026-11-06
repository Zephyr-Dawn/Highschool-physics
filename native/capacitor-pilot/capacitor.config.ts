import type { CapacitorConfig } from '@capacitor/cli';

// Native pilot only. The web/PWA build remains the primary product.
// Do not point server.url at a remote site: the pilot must validate bundled assets offline.
const config: CapacitorConfig = {
  appId: 'com.emplab.physicslab.pilot',
  appName: 'EM Physics Lab Pilot',
  webDir: '../../dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

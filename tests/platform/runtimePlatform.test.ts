import { describe, expect, it } from 'vitest';
import { detectRuntimePlatform, shouldRegisterServiceWorker } from '../../src/platform/runtimePlatform';

describe('Round 18 runtime platform detection', () => {
  it('detects ordinary browser, standalone PWA and Capacitor native shell separately', () => {
    expect(detectRuntimePlatform({ matchMedia: () => ({ matches: false }) }, {}).platform).toBe('browser');
    expect(detectRuntimePlatform({ matchMedia: () => ({ matches: true }) }, {}).platform).toBe('pwa');
    const native = detectRuntimePlatform({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', version: '8.6.0' },
      matchMedia: () => ({ matches: false }),
    }, {});
    expect(native.platform).toBe('capacitor');
    expect(native.isNativeShell).toBe(true);
    expect(native.capacitorVersion).toBe('8.6.0');
  });

  it('keeps webdriver and native status observable without claiming a real device', () => {
    const simulated = detectRuntimePlatform({ matchMedia: () => ({ matches: false }) }, { webdriver: true });
    expect(simulated.platform).toBe('browser');
    expect(simulated.webdriver).toBe(true);
    const standalone = detectRuntimePlatform({ matchMedia: () => ({ matches: true }) }, { webdriver: false });
    expect(standalone.isStandalone).toBe(true);
    expect(standalone.webdriver).toBe(false);
    expect(shouldRegisterServiceWorker({ isNativeShell: false })).toBe(true);
    expect(shouldRegisterServiceWorker({ isNativeShell: true })).toBe(false);
  });
});

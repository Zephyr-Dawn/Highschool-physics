export type RuntimePlatform = 'browser' | 'pwa' | 'capacitor';

export interface RuntimeInfo {
  platform: RuntimePlatform;
  isNativeShell: boolean;
  isStandalone: boolean;
  displayMode: string;
  capacitorVersion: string | null;
  webdriver: boolean;
}

interface CapacitorLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  version?: string;
}

interface RuntimeWindowLike {
  Capacitor?: CapacitorLike;
  matchMedia?: (query: string) => { matches: boolean };
}

interface RuntimeNavigatorLike {
  standalone?: boolean;
  webdriver?: boolean;
}

export function detectRuntimePlatform(
  win: RuntimeWindowLike | undefined = typeof window === 'undefined' ? undefined : window,
  nav: RuntimeNavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): RuntimeInfo {
  const capacitor = win?.Capacitor;
  const native = typeof capacitor?.isNativePlatform === 'function'
    ? capacitor.isNativePlatform() === true
    : false;
  const displayMode = win?.matchMedia?.('(display-mode: standalone)')?.matches ? 'standalone' : 'browser';
  const standalone = native || displayMode === 'standalone' || nav?.standalone === true;
  const platform: RuntimePlatform = native ? 'capacitor' : standalone ? 'pwa' : 'browser';
  return {
    platform,
    isNativeShell: native,
    isStandalone: standalone,
    displayMode: native ? 'native-webview' : displayMode,
    capacitorVersion: native && typeof capacitor?.version === 'string' ? capacitor.version : null,
    webdriver: nav?.webdriver === true,
  };
}

export function shouldRegisterServiceWorker(runtime: Pick<RuntimeInfo, 'isNativeShell'>): boolean {
  return runtime.isNativeShell !== true;
}

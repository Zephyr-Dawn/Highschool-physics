export interface WebGLSupport {
  available: boolean;
  version: 1 | 2 | null;
  renderer: string | null;
  reason: string | null;
}

function forcedFallback(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = (window as unknown as { __P01_FORCE_FALLBACK__?: boolean }).__P01_FORCE_FALLBACK__ === true;
  const query = `${window.location.search} ${window.location.hash}`;
  const disabledByQuery = /(?:^|[?&])p01-webgl=off(?:&|$)/.test(query);
  let disabledByStorage = false;
  try {
    disabledByStorage = window.localStorage.getItem('emplab.p01.force2d') === '1';
  } catch {
    disabledByStorage = false;
  }
  return forced || disabledByQuery || disabledByStorage;
}

export function detectWebGL(): WebGLSupport {
  if (typeof document === 'undefined') {
    return { available: false, version: null, renderer: null, reason: '当前环境没有浏览器 DOM，无法初始化 WebGL。' };
  }
  if (forcedFallback()) {
    return {
      available: false,
      version: null,
      renderer: null,
      reason: '按当前设置强制使用 2D 备用视图；物理数据仍可继续使用。',
    };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) as WebGLRenderingContext | null);
    if (!gl) {
      return {
        available: false,
        version: null,
        renderer: null,
        reason: '浏览器未提供可用的 WebGL 上下文（可能被禁用或设备不支持）。',
      };
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? '')
      : String(gl.getParameter(gl.RENDERER) ?? '');
    return {
      available: true,
      version: gl instanceof WebGL2RenderingContext ? 2 : 1,
      renderer: renderer || null,
      reason: null,
    };
  } catch (error) {
    return {
      available: false,
      version: null,
      renderer: null,
      reason: `WebGL 初始化失败：${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { APP_BUILD_LABEL, APP_VERSION } from '../lib/appInfo';
import { usePersistentState } from '../hooks/usePersistentState';
import { detectRuntimePlatform } from '../platform/runtimePlatform';

type CheckStatus = 'NOT_TESTED' | 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A';
type AutomatedStatus = 'NOT_TESTED' | 'SIMULATED_PASS' | 'SIMULATED_FAIL' | 'UNSUPPORTED';
type EvidenceSource = 'simulated' | 'physical-device-self-reported';
type DeviceTarget = 'ipados-safari' | 'android-chrome' | 'desktop-simulated' | 'unspecified';

interface ManualCheck {
  id: string;
  label: string;
  hint: string;
}

const MANUAL_CHECKS: ManualCheck[] = [
  { id: 'touch-handles', label: '触控手柄命中（P01/P02/P07/P08）', hint: '≥44 CSS px；手指拖动不穿透/不误触' },
  { id: 'pinch-rotate', label: '双指缩放 / P01 相机旋转', hint: '第二指取消草稿；缩放不改变物理量' },
  { id: 'velocity-vector', label: '速度矢量与初态编辑', hint: '编辑 A 时 B/C 继续运动；松手只重发射 A' },
  { id: 'keyboard', label: '数值输入与软键盘', hint: '表达式 √3/2、1/3、2π 可输入；键盘不遮住提交/舞台' },
  { id: 'background', label: '切后台再回来', hint: '时钟、场景、粒子状态不丢失或乱跳' },
  { id: 'persistence', label: '场景持久化', hint: '刷新后恢复参数；旧 v2 存档不被破坏' },
  { id: 'case-return', label: '案例实验返回恢复个人场景', hint: '进入案例实验前的个人配置在返回后恢复' },
  { id: 'teacher-authoring', label: '教师自建题：本机创建/编辑/预览', hint: '无代码创建 A17 模板草稿，修改参数后学生视图答案更新' },
  { id: 'update-preserve', label: 'PWA 更新保留旧数据', hint: '场景、132 题进度、内置案例进度与教师私有草稿均保留' },
  { id: 'font-safe-area', label: '大字号 / 横竖屏 / 安全区', hint: '无横向溢出；核心按钮可见可点' },
  { id: 'screen-reader', label: 'VoiceOver / TalkBack 焦点', hint: '按钮名称可读；焦点顺序合理' },
  { id: 'warm-run', label: '15 分钟课堂暖机', hint: '发热、掉电、Safari/Android 会话存活；记录机型与环境' },
];

function inferDeviceTarget(): DeviceTarget {
  if (typeof navigator === 'undefined') return 'unspecified';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua) && /Chrome/i.test(ua)) return 'android-chrome';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ipados-safari';
  if (navigator.webdriver) return 'desktop-simulated';
  return 'unspecified';
}

function inferEvidenceSource(): EvidenceSource {
  return typeof navigator !== 'undefined' && navigator.webdriver
    ? 'simulated'
    : 'physical-device-self-reported';
}

interface ManualEntry {
  status: CheckStatus;
  note: string;
}

interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  viewport: string;
  dpr: number;
  orientation: string;
  screen: string;
  secureContext: boolean;
  online: boolean;
  standalone: boolean;
  serviceWorker: string;
  webgl: AutomatedStatus;
  webglRenderer: string;
  deviceMemory: string;
  hardwareConcurrency: string;
  webdriver: boolean;
  maxTouchPoints: number;
  runtimePlatform: string;
  nativeShell: boolean;
  displayMode: string;
}

const EMPTY_DEVICE: DeviceInfo = {
  userAgent: '',
  platform: '',
  language: '',
  viewport: '',
  dpr: 0,
  orientation: '',
  screen: '',
  secureContext: false,
  online: false,
  standalone: false,
  serviceWorker: 'NOT_TESTED',
  webgl: 'NOT_TESTED',
  webglRenderer: '',
  deviceMemory: '',
  hardwareConcurrency: '',
  webdriver: false,
  maxTouchPoints: 0,
  runtimePlatform: 'browser',
  nativeShell: false,
  displayMode: 'browser',
};

function defaultManual(): Record<string, ManualEntry> {
  return Object.fromEntries(MANUAL_CHECKS.map((check) => [check.id, { status: 'NOT_TESTED', note: '' }]));
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function DeviceCheckPage() {
  const [device, setDevice] = useState<DeviceInfo>(EMPTY_DEVICE);
  const [manual, setManual] = usePersistentState<Record<string, ManualEntry>>(
    'emplab.deviceCheck.manual.v1',
    defaultManual(),
  );
  const [userModel, setUserModel] = usePersistentState('emplab.deviceCheck.model.v1', '');
  const [userOs, setUserOs] = usePersistentState('emplab.deviceCheck.os.v1', '');
  const [deviceTarget, setDeviceTarget] = usePersistentState<DeviceTarget>('emplab.deviceCheck.target.v1', inferDeviceTarget());
  const [evidenceSource, setEvidenceSource] = usePersistentState<EvidenceSource>('emplab.deviceCheck.source.v1', inferEvidenceSource());
  const [probeState, setProbeState] = useState<'idle' | 'running' | 'done'>('idle');
  const [probeSeconds, setProbeSeconds] = useState(10);
  const [probe, setProbe] = useState<{ frames: number; p50: number; p95: number; p99: number; max: number; heapMB: number | null } | null>(null);
  const [webglLoss, setWebglLoss] = useState<AutomatedStatus>('NOT_TESTED');
  const [webglLossNote, setWebglLossNote] = useState('');
  const probeCancel = useRef(false);

  useEffect(() => {
    document.title = '课堂设备检测｜EM Physics Lab';
    const gather = async () => {
      const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
      const runtime = detectRuntimePlatform();
      const canvas = document.createElement('canvas');
      let webgl: AutomatedStatus = 'UNSUPPORTED';
      let renderer = '';
      try {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (gl) {
          webgl = 'SIMULATED_PASS';
          const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL?: number } | null;
          const debug = ext?.UNMASKED_RENDERER_WEBGL;
          if (debug) {
            const value = gl.getParameter(debug);
            renderer = typeof value === 'string' ? value : String(value ?? '');
          }
        }
      } catch {
        webgl = 'SIMULATED_FAIL';
      }
      let sw = 'NOT_TESTED';
      try {
        if (!('serviceWorker' in navigator)) sw = 'UNSUPPORTED';
        else if (navigator.serviceWorker.controller) sw = 'SIMULATED_PASS';
        else {
          const registration = await navigator.serviceWorker.getRegistration();
          sw = registration ? 'SIMULATED_PASS' : 'NOT_TESTED';
        }
      } catch {
        sw = 'SIMULATED_FAIL';
      }
      setDevice({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        viewport: `${window.innerWidth} × ${window.innerHeight}`,
        dpr: window.devicePixelRatio || 1,
        orientation: screen.orientation?.type ?? (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait'),
        screen: `${screen.width} × ${screen.height}`,
        secureContext: window.isSecureContext,
        online: navigator.onLine,
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        serviceWorker: sw,
        webgl,
        webglRenderer: renderer,
        deviceMemory: nav.deviceMemory ? `${nav.deviceMemory} GB` : '未知',
        hardwareConcurrency: nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : '未知',
        webdriver: navigator.webdriver === true,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        runtimePlatform: runtime.platform,
        nativeShell: runtime.isNativeShell,
        displayMode: runtime.displayMode,
      });
    };
    void gather();
  }, []);

  const runWebglLossTest = () => {
    setWebglLoss('NOT_TESTED');
    setWebglLossNote('');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      setWebglLoss('UNSUPPORTED');
      setWebglLossNote('当前浏览器不支持 WebGL，P01 应使用 2D/HTML 回退。');
      return;
    }
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) {
      setWebglLoss('SIMULATED_FAIL');
      setWebglLossNote('WebGL 可用，但无法触发/恢复上下文丢失扩展；需在真机复测。');
      return;
    }
    let lost = false;
    let restored = false;
    canvas.addEventListener('webglcontextlost', () => { lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { restored = true; });
    ext.loseContext();
    window.setTimeout(() => {
      try {
        ext.restoreContext();
      } catch {
        // ignore restore failures
      }
      window.setTimeout(() => {
        setWebglLoss(lost && restored ? 'SIMULATED_PASS' : 'SIMULATED_FAIL');
        setWebglLossNote(lost && restored ? '上下文丢失后恢复事件已到达；仍需真机验证 P01 3D 画面恢复。' : '未观察到完整的丢失/恢复事件链。');
      }, 400);
    }, 400);
  };

  const runFrameProbe = async (seconds: number) => {
    setProbeState('running');
    setProbeSeconds(seconds);
    probeCancel.current = false;
    const frames: number[] = [];
    let last = performance.now();
    const start = last;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (probeCancel.current) {
          resolve();
          return;
        }
        frames.push(now - last);
        last = now;
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (frames.length > 1) {
      const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
      setProbe({
        frames: frames.length,
        p50: percentile(frames, 0.5),
        p95: percentile(frames, 0.95),
        p99: percentile(frames, 0.99),
        max: Math.max(...frames),
        heapMB: memory.memory ? memory.memory.usedJSHeapSize / 1048576 : null,
      });
    }
    setProbeState('done');
    probeCancel.current = false;
  };

  const updateManual = (id: string, patch: Partial<ManualEntry>) => {
    setManual((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? { status: 'NOT_TESTED', note: '' }), ...patch },
    }));
  };

  const exportReport = () => {
    const report = {
      schemaVersion: 2,
      source: {
        evidenceSource,
        deviceTarget,
        description: evidenceSource === 'simulated'
          ? '自动化/模拟环境记录，不能计入真实设备 PASS。'
          : '由测试者在本机填写并勾选的真机自述记录；未由服务器或系统自动认证。',
      },
      appVersion: APP_VERSION,
      build: APP_BUILD_LABEL,
      exportedAt: new Date().toISOString(),
      device: {
        ...device,
        userModel: userModel || '未填写',
        userOs: userOs || '未填写',
      },
      runtime: {
        platform: device.runtimePlatform,
        nativeShell: device.nativeShell,
        displayMode: device.displayMode,
        sourceNote: device.nativeShell ? 'Capacitor WebView 自述运行环境；未在真实设备验证' : '浏览器/PWA 运行环境',
      },
      automated: {
        webglLossRecovery: webglLoss,
        webglLossNote,
        frameProbe: probe
          ? { seconds: probeSeconds, frames: probe.frames, p50: probe.p50, p95: probe.p95, p99: probe.p99, max: probe.max, heapMB: probe.heapMB }
          : null,
      },
      manual,
      privacy: {
        containsTeacherContent: false,
        containsQuestionAnswers: false,
        containsSceneData: false,
        containsPreciseLocation: false,
        containsIpOrAccount: false,
        uploadedAutomatically: false,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `emplab-device-check-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const manualDone = useMemo(
    () => MANUAL_CHECKS.filter((check) => (manual[check.id]?.status ?? 'NOT_TESTED') !== 'NOT_TESTED').length,
    [manual],
  );

  return (
    <div className="device-check-page" data-testid="device-check-page">
      <header className="cases-hero">
        <div>
          <p className="eyebrow">课堂设备检测 · 仅本地</p>
          <h1>先诊断设备，再宣布真机通过</h1>
          <p className="page-lede">
            本页只在当前浏览器内采集信息；导出仅在你点击按钮时发生，不包含题目答案、场景数据、位置、IP 或账号。
            自动化结果是 SIMULATED，不代表真实 iPad/Android 验收；硬件项默认 NOT_TESTED。
          </p>
        </div>
        <div className="cases-hero-actions">
          <button type="button" className="primary-button" onClick={exportReport} data-testid="device-export">
            <Icon name="download" size={17} />导出脱敏 JSON
          </button>
          <span className="status-pill">{APP_VERSION}</span>
        </div>
      </header>

      <div className="device-grid">
        <section className="case-panel" aria-labelledby="device-info-title">
          <h2 id="device-info-title">环境</h2>
          <div className="device-field-row">
            <label>设备型号<input value={userModel} onChange={(event) => setUserModel(event.target.value)} placeholder="例如 iPad Air 5 / 小米平板 6" /></label>
            <label>系统 / 浏览器<input value={userOs} onChange={(event) => setUserOs(event.target.value)} placeholder="例如 iPadOS 18.1 Safari / Android 15 Chrome" /></label>
          </div>
          <div className="device-field-row">
            <label>
              目标设备
              <select value={deviceTarget} onChange={(event) => setDeviceTarget(event.target.value as DeviceTarget)} data-testid="device-target">
                <option value="ipados-safari">iPadOS Safari</option>
                <option value="android-chrome">Android Chrome</option>
                <option value="desktop-simulated">桌面/模拟环境</option>
                <option value="unspecified">未指定</option>
              </select>
            </label>
            <label>
              证据来源
              <select value={evidenceSource} onChange={(event) => setEvidenceSource(event.target.value as EvidenceSource)} data-testid="device-evidence-source">
                <option value="physical-device-self-reported">真机自述记录</option>
                <option value="simulated">模拟 / 自动化</option>
              </select>
            </label>
          </div>
          {evidenceSource === 'simulated' ? (
            <p className="case-answer-status is-wrong" data-testid="device-simulated-warning">
              当前标记为模拟/自动化证据；不得计入真实 iPad/Android PASS。
            </p>
          ) : (
            <p className="case-restore-notice" data-testid="device-self-reported-note">
              真机自述记录需要写明设备型号、系统/浏览器版本和测试日期；系统不会自动认证硬件结果。
            </p>
          )}
          <dl className="device-dl" data-testid="device-info">
            <div><dt>视口</dt><dd>{device.viewport} · DPR {device.dpr}</dd></div>
            <div><dt>屏幕</dt><dd>{device.screen} · {device.orientation}</dd></div>
            <div><dt>安全上下文</dt><dd>{device.secureContext ? '是（HTTPS/localhost）' : '否（Service Worker 不可用）'}</dd></div>
            <div><dt>Service Worker</dt><dd>{device.serviceWorker}</dd></div>
            <div><dt>网络</dt><dd>{device.online ? '在线' : '离线'}</dd></div>
            <div><dt>运行平台</dt><dd>{device.runtimePlatform} · {device.displayMode}{device.nativeShell ? ' · 原生壳' : ''}</dd></div>
            <div><dt>Standalone</dt><dd>{device.standalone ? '是' : '否'}</dd></div>
            <div><dt>WebGL</dt><dd>{device.webgl}{device.webglRenderer ? ` · ${device.webglRenderer}` : ''}</dd></div>
            <div><dt>CPU / 内存</dt><dd>{device.hardwareConcurrency} 核 · {device.deviceMemory}</dd></div>
            <div><dt>自动化标记 / 触点数</dt><dd>{device.webdriver ? 'webdriver=true' : 'webdriver=false'} · {device.maxTouchPoints} 点</dd></div>
            <div><dt>证据来源</dt><dd>{evidenceSource} · {deviceTarget}</dd></div>
            <div><dt>UA</dt><dd className="device-ua">{device.userAgent}</dd></div>
          </dl>
          <div className="case-action-row">
            <button type="button" className="secondary-button case-action" onClick={runWebglLossTest} data-testid="device-webgl-loss">测试 WebGL 丢失/恢复</button>
            <span className={`case-answer-status ${webglLoss === 'SIMULATED_PASS' ? 'is-correct' : webglLoss === 'SIMULATED_FAIL' ? 'is-wrong' : ''}`}>{webglLoss}{webglLossNote ? ` · ${webglLossNote}` : ''}</span>
          </div>
        </section>

        <section className="case-panel" aria-labelledby="device-frame-title">
          <h2 id="device-frame-title">帧调度代理（不是 GPU FPS）</h2>
          <p>rAF 间隔只反映当前浏览器/设备的调度与主线程占用；无头 Chrome 不锁 VSync，不能当作真机 60 fps、发热或续航结论。</p>
          <div className="case-action-row">
            <button type="button" className="secondary-button case-action" onClick={() => void runFrameProbe(10)} disabled={probeState === 'running'} data-testid="device-probe-10">
              10 s 采样
            </button>
            <button type="button" className="secondary-button case-action" onClick={() => void runFrameProbe(60)} disabled={probeState === 'running'} data-testid="device-probe-60">
              60 s 采样
            </button>
            {probeState === 'running' ? <button type="button" className="secondary-button" onClick={() => { probeCancel.current = true; }}>停止</button> : null}
          </div>
          <p className="device-probe-result" data-testid="device-probe-result">
            {probeState === 'running'
              ? `采样中（最多 ${probeSeconds} s）…`
              : probe
                ? `frames ${probe.frames} · p50 ${probe.p50.toFixed(2)} ms · p95 ${probe.p95.toFixed(2)} ms · p99 ${probe.p99.toFixed(2)} ms · max ${probe.max.toFixed(2)} ms${probe.heapMB ? ` · heap ${probe.heapMB.toFixed(1)} MB` : ''}`
                : '尚未采样'}
          </p>
        </section>
      </div>

      <section className="case-panel" aria-labelledby="device-manual-title">
        <h2 id="device-manual-title">真机检查清单（默认 NOT_TESTED）</h2>
        <p>已完成 {manualDone}/{MANUAL_CHECKS.length} 项。没有真实 iPad/Android 证据时，不要把任何硬件项改成 PASS。</p>
        <div className="device-checklist">
          {MANUAL_CHECKS.map((check) => {
            const entry = manual[check.id] ?? { status: 'NOT_TESTED' as CheckStatus, note: '' };
            return (
              <article className="device-check-item" key={check.id} data-testid={`device-check-${check.id}`}>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.hint}</p>
                </div>
                <select
                  aria-label={`${check.label} 状态`}
                  value={entry.status}
                  onChange={(event) => updateManual(check.id, { status: event.target.value as CheckStatus })}
                >
                  {(['NOT_TESTED', 'PASS', 'FAIL', 'BLOCKED', 'N/A'] as const).map((status) => (
                    <option value={status} key={status}>{status}</option>
                  ))}
                </select>
                <input
                  aria-label={`${check.label} 备注`}
                  value={entry.note}
                  onChange={(event) => updateManual(check.id, { note: event.target.value })}
                  placeholder="备注/机型/系统版本"
                />
              </article>
            );
          })}
        </div>
      </section>

      <section className="boundary-note" aria-label="诊断隐私说明">
        <div className="boundary-icon"><Icon name="info" size={22} /></div>
        <div>
          <h2>隐私与证据边界</h2>
          <p>导出报告只在点击按钮时生成；不包含教师题目、题目答案、场景 JSON、精确位置、IP、账号或学生身份。自动结果标为 SIMULATED；硬件项需在真实设备上人工执行。</p>
          <p>离线时本页仍可打开；导出按钮不联网。真实设备未执行时，最终状态保持 NOT_TESTED。</p>
        </div>
      </section>
    </div>
  );
}

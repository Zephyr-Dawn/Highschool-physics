import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { P01_SIM, P02_SIM, P03_SIM, P04_SIM, P05_SIM, P06_SIM, P07_SIM, P08_SIM, I01_SIM, I02_SIM, I03_SIM, I04_SIM, I05_SIM, I06_SIM, I07_SIM, I08_SIM, PLANNED_SIMS } from '../simulations/registry';
import { QUESTION_STATS } from '../content/questionStats';
import { createUniformBModel } from '../physics/particles/uniformB';
import { P02_DEFAULT, p02Input } from '../simulations/particle/params';
import { formatLength, formatTime } from '../lib/format';

const defaultP02 = createUniformBModel(p02Input(P02_DEFAULT));

function OrbitPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <g stroke="#4f46e5" fill="none" opacity="0.25">
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 13 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${12 + col * 20} ${12 + row * 20})`}>
              <circle r="3.2" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <circle cx="150" cy="92" r="48" fill="none" stroke="#94a3b8" strokeDasharray="5 5" />
      <circle cx="150" cy="92" r="2.4" fill="#475569" />
      <path d="M150 44a48 48 0 0 1 45 32" fill="none" stroke="#1e3a5f" strokeWidth="3" strokeLinecap="round" />
      <circle cx="150" cy="44" r="7" fill="#b45309" stroke="#fff" strokeWidth="2" />
      <path d="M154 44h10" stroke="#0f766e" strokeWidth="2.5" markerEnd="url(#preview-v)" />
      <path d="M150 52v10" stroke="#c2410c" strokeWidth="2.5" strokeDasharray="4 3" markerEnd="url(#preview-f)" />
      <text x="112" y="88" fontSize="10" fill="#475569">r</text>
      <text x="62" y="34" fontSize="10" fill="#5e6f82">⊙ B 出纸面</text>
      <defs>
        <marker id="preview-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#0f766e" />
        </marker>
        <marker id="preview-f" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#c2410c" />
        </marker>
      </defs>
    </svg>
  );
}

function LoopPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="124" y="8" width="112" height="144" fill="#eef2ff" />
      <g stroke="#4f46e5" fill="none" opacity="0.3">
        {Array.from({ length: 6 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${142 + col * 18} ${20 + row * 22})`}>
              <circle r="3" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <line x1="124" y1="8" x2="124" y2="152" stroke="#4f46e5" strokeDasharray="5 4" opacity="0.6" />
      <line x1="236" y1="8" x2="236" y2="152" stroke="#4f46e5" strokeDasharray="5 4" opacity="0.6" />
      <rect x="70" y="56" width="94" height="52" fill="none" stroke="#b45309" strokeWidth="4" />
      <rect x="124" y="56" width="40" height="52" fill="rgba(124,58,237,.24)" stroke="none" />
      <path d="M140 82h24" stroke="#b45309" strokeWidth="2.5" markerEnd="url(#preview-i)" />
      <text x="146" y="72" fontSize="10" fill="#b45309">I</text>
      <text x="46" y="42" fontSize="10" fill="#5e6f82">Φ 增大</text>
      <path d="M60 100h22" stroke="#0f766e" strokeWidth="2.5" markerEnd="url(#preview-v2)" />
      <text x="64" y="94" fontSize="10" fill="#0f766e">v</text>
      <defs>
        <marker id="preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#b45309" />
        </marker>
        <marker id="preview-v2" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#0f766e" />
        </marker>
      </defs>
    </svg>
  );
}

function HalfPlanePreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="128" y="8" width="124" height="144" fill="#eef2ff" />
      <g stroke="#4f46e5" fill="none" opacity="0.28">
        {Array.from({ length: 6 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${144 + col * 18} ${22 + row * 22})`}>
              <circle r="3" />
              <path d="M-2,-2L2,2M2,-2L-2,2" stroke="#4f46e5" strokeWidth="0.9" />
            </g>
          )),
        )}
      </g>
      <line x1="128" y1="8" x2="128" y2="152" stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d="M52 106 H128" stroke="#0f766e" strokeWidth="2.5" markerEnd="url(#p03-preview-v)" />
      <path d="M128 106 Q170 76 128 46" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeDasharray="5 5" />
      <path d="M128 46 H80" stroke="#1e3a5f" strokeWidth="2.5" />
      <circle cx="52" cy="106" r="6" fill="#b45309" stroke="#fff" strokeWidth="2" />
      <circle cx="128" cy="106" r="4" fill="#fff" stroke="#0f766e" strokeWidth="2" />
      <rect x="124" y="42" width="8" height="8" fill="#fff" stroke="#0f766e" strokeWidth="2" transform="rotate(45 128 46)" />
      <text x="34" y="96" fontSize="10" fill="#475569">P₀</text>
      <text x="137" y="118" fontSize="10" fill="#0f766e">E</text>
      <text x="137" y="42" fontSize="10" fill="#0f766e">X</text>
      <text x="162" y="30" fontSize="10" fill="#4f46e5">× B</text>
      <text x="74" y="78" fontSize="10" fill="#5e6f82">预测轨迹</text>
      <defs>
        <marker id="p03-preview-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#0f766e" />
        </marker>
      </defs>
    </svg>
  );
}

function LorentzForcePreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <line x1="42" y1="122" x2="98" y2="122" stroke="#94a3b8" strokeWidth="1.2" markerEnd="url(#p01-axis)" />
      <line x1="42" y1="122" x2="42" y2="62" stroke="#94a3b8" strokeWidth="1.2" markerEnd="url(#p01-axis)" />
      <line x1="42" y1="122" x2="18" y2="144" stroke="#94a3b8" strokeWidth="1.2" markerEnd="url(#p01-axis)" />
      <text x="100" y="126" fontSize="9" fill="#5e6f82">x</text>
      <text x="46" y="58" fontSize="9" fill="#5e6f82">y</text>
      <text x="8" y="150" fontSize="9" fill="#5e6f82">z</text>
      <line x1="68" y1="104" x2="150" y2="104" stroke="#0f766e" strokeWidth="2.6" markerEnd="url(#p01-v)" />
      <line x1="68" y1="104" x2="112" y2="104" stroke="#4f46e5" strokeWidth="2.6" strokeDasharray="5 3" markerEnd="url(#p01-b)" />
      <line x1="68" y1="104" x2="68" y2="38" stroke="#c2410c" strokeWidth="2.6" markerEnd="url(#p01-f)" />
      <circle cx="68" cy="104" r="7" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
      <text x="154" y="108" fontSize="10" fill="#0f766e">v</text>
      <text x="105" y="96" fontSize="10" fill="#4f46e5">B</text>
      <text x="74" y="40" fontSize="10" fill="#c2410c">F_B</text>
      <text x="118" y="148" fontSize="10" fill="#5e6f82">三维瞬时 v×B · 不画伪轨迹</text>
      <defs>
        {[
          ['p01-axis', '#94a3b8'],
          ['p01-v', '#0f766e'],
          ['p01-b', '#4f46e5'],
          ['p01-f', '#c2410c'],
        ].map(([id, color]) => (
          <marker key={id} id={id} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0L7,3.5L0,7z" fill={color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

function FluxLenzPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="66" y="30" width="130" height="100" rx="8" fill="#eef2ff" stroke="#b45309" strokeWidth="4" transform="skewY(-5)" />
      <g stroke="#4f46e5" fill="none" opacity="0.35">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 5 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${82 + col * 24} ${48 + row * 21})`}>
              <circle r="3" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <line x1="131" y1="80" x2="131" y2="30" stroke="#7c3aed" strokeWidth="2.2" markerEnd="url(#i01-normal)" />
      <path d="M100 58c12-18 36-18 48 0" fill="none" stroke="#b45309" strokeWidth="2.2" markerEnd="url(#i01-current)" />
      <text x="138" y="30" fontSize="10" fill="#7c3aed">+n</text>
      <text x="146" y="120" fontSize="10" fill="#b45309">I</text>
      <text x="24" y="44" fontSize="10" fill="#5e6f82">Φ=BzA cosθ</text>
      <text x="74" y="150" fontSize="10" fill="#5e6f82">B / A / θ 三种连续改变</text>
      <defs>
        <marker id="i01-normal" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#7c3aed" />
        </marker>
        <marker id="i01-current" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#b45309" />
        </marker>
      </defs>
    </svg>
  );
}

function MovingRodPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="24" y="34" width="214" height="92" fill="#eef2ff" />
      <g stroke="#4f46e5" fill="none" opacity="0.28">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 8 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${42 + col * 26} ${48 + row * 22})`}>
              <circle r="3" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <line x1="38" y1="62" x2="228" y2="62" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
      <line x1="38" y1="118" x2="228" y2="118" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
      <line x1="38" y1="62" x2="38" y2="82" stroke="#b45309" strokeWidth="4" />
      <line x1="38" y1="98" x2="38" y2="118" stroke="#b45309" strokeWidth="4" />
      <rect x="28" y="82" width="20" height="16" rx="3" fill="#fff" stroke="#b45309" strokeWidth="2" />
      <line x1="178" y1="62" x2="178" y2="118" stroke="#b45309" strokeWidth="6" strokeLinecap="round" />
      <line x1="188" y1="90" x2="214" y2="90" stroke="#0f766e" strokeWidth="2.6" markerEnd="url(#i02-preview-v)" />
      <path d="M170 82v-12" stroke="#c2410c" strokeWidth="2.6" strokeDasharray="4 3" markerEnd="url(#i02-preview-f)" />
      <path d="M178 72v10" stroke="#b45309" strokeWidth="2.2" markerEnd="url(#i02-preview-i)" />
      <text x="203" y="84" fontSize="10" fill="#0f766e">v</text>
      <text x="148" y="66" fontSize="10" fill="#c2410c">F安</text>
      <text x="184" y="102" fontSize="10" fill="#b45309">I</text>
      <text x="44" y="78" fontSize="9" fill="#5e6f82">R</text>
      <text x="54" y="148" fontSize="10" fill="#5e6f82">Φ = B L x · 导体棒切割磁感线</text>
      <defs>
        <marker id="i02-preview-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#0f766e" />
        </marker>
        <marker id="i02-preview-f" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#c2410c" />
        </marker>
        <marker id="i02-preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#b45309" />
        </marker>
      </defs>
    </svg>
  );
}

function TimeVaryingPreview() {  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="46" y="30" width="120" height="100" fill="none" stroke="#b45309" strokeWidth="4" />
      <g stroke="#4f46e5" fill="none" opacity="0.36">
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${58 + col * 20} ${42 + row * 20})`}>
              <circle r="3.1" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <path d="M54 40h26" stroke="#b45309" strokeWidth="2.4" markerEnd="url(#i04-preview-i)" />
      <text x="64" y="34" fontSize="10" fill="#b45309">I</text>
      <path d="M190 86c14-34 28-34 42 0s28 34 42 0" fill="none" stroke="#7c3aed" strokeWidth="2.2" transform="translate(-12 30) scale(.78 1)" />
      <text x="186" y="42" fontSize="10" fill="#7c3aed">B(t)</text>
      <text x="76" y="148" fontSize="10" fill="#5e6f82">固定线圈 · 时变磁场</text>
      <defs>
        <marker id="i04-preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#b45309" />
        </marker>
      </defs>
    </svg>
  );
}



function CoupledLoopPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="128" y="14" width="118" height="132" fill="#eef2ff" />
      <g stroke="#4f46e5" fill="none" opacity="0.3">
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 5 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${144 + col * 22} ${28 + row * 24})`}>
              <circle r="3" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <line x1="128" y1="14" x2="128" y2="146" stroke="#4f46e5" strokeDasharray="5 4" />
      <line x1="246" y1="14" x2="246" y2="146" stroke="#4f46e5" strokeDasharray="5 4" />
      <rect x="62" y="46" width="94" height="64" fill="none" stroke="#b45309" strokeWidth="4" />
      <rect x="128" y="46" width="28" height="64" fill="rgba(124,58,237,.22)" />
      <path d="M146 56h22" stroke="#b45309" strokeWidth="2.3" markerEnd="url(#i05-preview-i)" />
      <path d="M54 122h27" stroke="#0f766e" strokeWidth="2.4" markerEnd="url(#i05-preview-v)" />
      <path d="M158 24c12-16 28 16 38 0" fill="none" stroke="#7c3aed" strokeWidth="2" />
      <text x="150" y="18" fontSize="9" fill="#7c3aed">B(t)</text>
      <text x="88" y="152" fontSize="10" fill="#5e6f82">ε = ε_t + ε_m · 同一能量账本</text>
      <defs>
        <marker id="i05-preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#b45309" /></marker>
        <marker id="i05-preview-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#0f766e" /></marker>
      </defs>
    </svg>
  );
}

function DualRodsPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="18" y="26" width="224" height="112" fill="#eef2ff" />
      <g stroke="#4f46e5" fill="none" opacity="0.3">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 8 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${34 + col * 28} ${40 + row * 28})`}>
              <circle r="3" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <line x1="30" y1="52" x2="230" y2="52" stroke="#1e3a5f" strokeWidth="4" strokeLinecap="round" />
      <line x1="30" y1="112" x2="230" y2="112" stroke="#1e3a5f" strokeWidth="4" strokeLinecap="round" />
      <line x1="96" y1="52" x2="96" y2="112" stroke="#b45309" strokeWidth="6" strokeLinecap="round" />
      <line x1="178" y1="52" x2="178" y2="112" stroke="#b45309" strokeWidth="6" strokeLinecap="round" />
      <path d="M96 112h82" stroke="#b45309" strokeWidth="2" markerEnd="url(#i06-preview-i)" />
      <path d="M186 92h22" stroke="#0f766e" strokeWidth="2.4" markerEnd="url(#i06-preview-v)" />
      <path d="M88 74h-22" stroke="#c2410c" strokeWidth="2.4" markerEnd="url(#i06-preview-f)" />
      <text x="76" y="146" fontSize="10" fill="#5e6f82">两根杆 · 同一电流 · 动量与能量</text>
      <defs>
        <marker id="i06-preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#b45309" /></marker>
        <marker id="i06-preview-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#0f766e" /></marker>
        <marker id="i06-preview-f" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#c2410c" /></marker>
      </defs>
    </svg>
  );
}

function BeamlinePreview() {
  return (
    <svg viewBox="0 0 280 160" className="model-preview-svg" aria-hidden="true">
      <rect x="14" y="18" width="252" height="124" rx="8" fill="#f8fafc" stroke="#dbe4f0" />
      <rect x="82" y="18" width="68" height="124" fill="#eef1ff" opacity="0.9" />
      <rect x="150" y="18" width="52" height="124" fill="#f3edff" opacity="0.85" />
      <rect x="202" y="18" width="44" height="124" fill="#ecfdf5" opacity="0.75" />
      <line x1="82" y1="18" x2="82" y2="66" stroke="#5e6f82" strokeWidth="4" />
      <line x1="82" y1="94" x2="82" y2="142" stroke="#5e6f82" strokeWidth="4" />
      <line x1="150" y1="18" x2="150" y2="66" stroke="#5e6f82" strokeWidth="4" />
      <line x1="150" y1="94" x2="150" y2="142" stroke="#5e6f82" strokeWidth="4" />
      <line x1="252" y1="46" x2="252" y2="114" stroke="#7c3aed" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 80H82H150C174 80 190 62 202 62L252 54" fill="none" stroke="#1e3a5f" strokeWidth="3" strokeLinecap="round" />
      <circle cx="252" cy="54" r="5.5" fill="#b45309" stroke="#fff" strokeWidth="2" />
      <circle cx="252" cy="54" r="10" fill="none" stroke="#b45309" strokeWidth="1.4" opacity="0.55" />
      <text x="92" y="34" fontSize="9" fill="#475569">E+B 选速</text>
      <text x="157" y="34" fontSize="9" fill="#6d28d9">磁分析</text>
      <text x="208" y="34" fontSize="9" fill="#0f766e">末段电场</text>
      <text x="238" y="132" fontSize="9" fill="#7c3aed" textAnchor="middle">屏幕</text>
      <circle cx="21" cy="80" r="4" fill="#1d4ed8" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

function CombinedFieldsPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="8" y="14" width="116" height="132" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 4" />
      <rect x="124" y="14" width="128" height="132" fill="#eef2ff" />
      <line x1="124" y1="14" x2="124" y2="146" stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="5 4" />
      <g stroke="#c2410c" strokeWidth="1.2" opacity="0.6">
        {Array.from({ length: 5 }).map((_, row) => (
          <line key={row} x1={20} y1={28 + row * 24} x2={44} y2={28 + row * 24} markerEnd="url(#p06-preview-e)" />
        ))}
      </g>
      <g fill="none" stroke="#4f46e5" opacity="0.35">
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 5 }).map((__, col) => (
            <g key={`${row}-${col}`} transform={`translate(${136 + col * 24} ${28 + row * 24})`}>
              <circle r="3.2" />
              <circle r="0.9" fill="#4f46e5" stroke="none" />
            </g>
          )),
        )}
      </g>
      <path d="M22 112 Q80 88 126 76" fill="none" stroke="#1d4ed8" strokeWidth="2.2" />
      <path d="M22 122 Q90 116 126 76" fill="none" stroke="#c2410c" strokeWidth="2.2" strokeDasharray="5 4" />
      <circle cx="22" cy="112" r="5" fill="#b45309" stroke="#fff" strokeWidth="2" />
      <circle cx="22" cy="122" r="5" fill="#0f766e" stroke="#fff" strokeWidth="2" />
      <text x="46" y="150" fontSize="10" fill="#5e6f82">E 加速 → B 偏转</text>
      <text x="148" y="150" fontSize="10" fill="#4f46e5">E + B 同区</text>
      <defs>
        <marker id="p06-preview-e" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0L6,3L0,6z" fill="#c2410c" />
        </marker>
      </defs>
    </svg>
  );
}

function FiniteFieldPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="62" y="28" width="142" height="104" rx="6" fill="#eef2ff" stroke="#4f46e5" strokeWidth="1.8" />
      <g fill="#4f46e5" opacity="0.32">
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => <circle key={`${row}-${col}`} cx={82 + col * 24} cy={48 + row * 26} r="1.8" />),
        )}
      </g>
      <path d="M30 104 Q54 104 62 80 Q76 48 112 54 Q156 64 172 28" fill="none" stroke="#0f766e" strokeWidth="2.6" strokeDasharray="6 5" />
      <circle cx="30" cy="104" r="5" fill="#b45309" stroke="#fff" strokeWidth="2" />
      <circle cx="172" cy="28" r="5" fill="#fff" stroke="#0f766e" strokeWidth="2.4" />
      <text x="86" y="150" fontSize="10" fill="#5e6f82">条形 / 矩形 · 出射边 / 相切 / 角点</text>
    </svg>
  );
}

function AlternatingFieldsPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="16" y="20" width="104" height="120" fill="#f1f5f9" />
      <rect x="120" y="20" width="124" height="120" fill="#eef2ff" />
      <line x1="120" y1="20" x2="120" y2="140" stroke="#4f46e5" strokeWidth="1.8" strokeDasharray="6 5" />
      <path d="M18 70 Q70 28 120 70 Q170 112 244 70" fill="none" stroke="#0f766e" strokeWidth="2.6" />
      <circle cx="120" cy="70" r="4.5" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
      <text x="48" y="40" fontSize="10" fill="#4f46e5">B1 = −B</text>
      <text x="166" y="40" fontSize="10" fill="#4f46e5">B2 = +B</text>
      <text x="62" y="150" fontSize="10" fill="#5e6f82">多次跨界 · 区内时间 · launchTime</text>
    </svg>
  );
}


function OppositeFieldsPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <rect x="26" y="12" width="96" height="136" fill="#dbeafe" />
      <rect x="122" y="12" width="96" height="136" fill="#fee2e2" />
      <g fill="#2563eb" opacity="0.6" fontSize="12">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 4 }).map((__, col) => (
            <text key={`p-${row}-${col}`} x={44 + col * 22} y={34 + row * 30}>⊙</text>
          )),
        )}
      </g>
      <g fill="#dc2626" opacity="0.65" fontSize="12">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 4 }).map((__, col) => (
            <text key={`n-${row}-${col}`} x={140 + col * 22} y={34 + row * 30}>×</text>
          )),
        )}
      </g>
      <line x1="122" y1="12" x2="122" y2="148" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="5 4" />
      <rect x="82" y="58" width="70" height="44" fill="none" stroke="#b45309" strokeWidth="4" />
      <rect x="122" y="58" width="30" height="44" fill="rgba(124,58,237,.22)" />
      <path d="M96 114h24" stroke="#b45309" strokeWidth="2.2" markerEnd="url(#i07-preview-i)" />
      <text x="90" y="52" fontSize="9" fill="#334155">Φ=0, ε≠0</text>
      <line x1="224" y1="24" x2="224" y2="136" stroke="#1e293b" strokeWidth="5" />
      <text x="196" y="150" fontSize="9" fill="#475569">挡板 e</text>
      <defs>
        <marker id="i07-preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7z" fill="#b45309" />
        </marker>
      </defs>
    </svg>
  );
}

function ConstraintPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <g stroke="#0f766e" opacity="0.5">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => (
            <line key={`${row}-${col}`} x1={34 + col * 34} y1={116 - row * 26} x2={44 + col * 34} y2={116 - row * 26} markerEnd="url(#p08-preview-e)" />
          )),
        )}
      </g>
      <path d="M66 120 Q160 10 196 92" fill="none" stroke="#1d4ed8" strokeWidth="2.4" strokeDasharray="5 4" />
      <line x1="178" y1="18" x2="178" y2="142" stroke="#b45309" strokeWidth="3.5" strokeDasharray="7 4" />
      <circle cx="178" cy="72" r="6" fill="#b45309" stroke="#fff" strokeWidth="2" />
      <text x="186" y="66" fontSize="9" fill="#b45309">相切/穿越？</text>
      <text x="30" y="26" fontSize="9" fill="#0f766e">E 场</text>
      <text x="142" y="150" fontSize="9" fill="#5e6f82">目标线段</text>
      <defs>
        <marker id="p08-preview-e" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0L6,3L0,6z" fill="#0f766e" />
        </marker>
      </defs>
    </svg>
  );
}


function AcGeneratorPreview() {
  return (
    <svg viewBox="0 0 260 160" className="model-preview-svg" aria-hidden="true">
      <g stroke="#2563eb" opacity="0.55">
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 5 }).map((__, col) => (
            <line key={`${row}-${col}`} x1={30 + col * 42} y1={44 + row * 24} x2={48 + col * 42} y2={44 + row * 24} markerEnd="url(#i08-preview-b)" />
          )),
        )}
      </g>
      <circle cx="126" cy="86" r="52" fill="none" stroke="#cbd5e1" strokeDasharray="4 4" />
      <rect x="98" y="54" width="56" height="64" fill="rgba(255,255,255,.55)" stroke="#1e293b" strokeWidth="3" transform="rotate(-14 126 86)" />
      <line x1="126" y1="86" x2="172" y2="58" stroke="#7e22ce" strokeWidth="2.4" markerEnd="url(#i08-preview-n)" />
      <path d="M78 126h42" stroke="#b45309" strokeWidth="2.5" markerEnd="url(#i08-preview-i)" />
      <rect x="196" y="112" width="48" height="30" rx="6" fill="#fff" stroke="#0f766e" />
      <text x="220" y="131" textAnchor="middle" fontSize="9" fill="#0f766e">R_L</text>
      <text x="34" y="28" fontSize="9" fill="#2563eb">B</text>
      <text x="150" y="48" fontSize="9" fill="#7e22ce">n</text>
      <text x="76" y="142" fontSize="9" fill="#b45309">ε/I</text>
      <defs>
        <marker id="i08-preview-b" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6z" fill="#2563eb" /></marker>
        <marker id="i08-preview-n" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#7e22ce" /></marker>
        <marker id="i08-preview-i" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7z" fill="#b45309" /></marker>
      </defs>
    </svg>
  );
}

export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">EM PHYSICS LAB · 平板优先 · PHASE 1</p>
          <h1 className="hero-title">
            <span className="hero-title-line">把电磁学的「为什么」</span>
            <span className="title-accent">拖到眼前。</span>
          </h1>
          <p className="hero-lede">
            为 iPad 与 Android 平板设计的高中电磁学交互实验室。先做预测，再调整参数，沿边界事件停帧观察，
            最后用原创分层练习检验理解——而不是看完一段动画就结束。
          </p>
          <div className="hero-actions">
            <Link className="primary-button hero-cta" to={P02_SIM.route}>
              开始 P02 圆周运动
              <Icon name="arrowRight" size={18} />
            </Link>
            <Link className="secondary-button hero-cta" to={I03_SIM.route}>
              打开 I03 线框进出
            </Link>
          </div>
          <ul className="hero-meta" aria-label="产品特点">
            <li><Icon name="pointer" size={15} />触控 / 触控笔</li>
            <li><Icon name="download" size={15} />PWA 离线缓存</li>
            <li><Icon name="check" size={15} />本地进度，无账号</li>
            <li><Icon name="book" size={15} />原创题 + 讲解</li>
          </ul>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="lab-preview">
            <div className="preview-bar">
              <span className="preview-dot" />
              <span className="preview-dot" />
              <span className="preview-dot" />
              <span className="preview-title">P02 · LIVE MODEL</span>
              <span className="preview-live">● 课堂演示</span>
            </div>
            <div className="preview-canvas">
              <div className="preview-grid" />
              <svg viewBox="0 0 460 280" className="hero-orbit-svg">
                <g fill="none" stroke="#8da2c4" opacity="0.45">
                  {Array.from({ length: 6 }).map((_, row) =>
                    Array.from({ length: 10 }).map((__, col) => (
                      <g key={`${row}-${col}`} transform={`translate(${30 + col * 45} ${28 + row * 44})`}>
                        <circle r="4.2" />
                        <circle r="1.2" fill="#8da2c4" stroke="none" />
                      </g>
                    )),
                  )}
                </g>
                <circle cx="230" cy="152" r="94" fill="none" stroke="#94a3b8" strokeDasharray="6 7" opacity="0.8" />
                <path d="M230 58a94 94 0 0 1 76 40" fill="none" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 8" />
                <path d="M230 58a94 94 0 0 1 66 34" fill="none" stroke="#1e3a5f" strokeWidth="5" strokeLinecap="round" />
                <circle cx="230" cy="152" r="3.4" fill="#475569" />
                <circle cx="230" cy="58" r="11" fill="#fbbf24" stroke="#fff" strokeWidth="3" />
                <path d="M238 58h28" stroke="#0f766e" strokeWidth="4" markerEnd="url(#hero-v)" />
                <path d="M230 72v28" stroke="#c2410c" strokeWidth="4" strokeDasharray="6 4" markerEnd="url(#hero-f)" />
                <text x="270" y="52" fill="#0f766e" fontSize="13" fontWeight="600">v</text>
                <text x="240" y="116" fill="#c2410c" fontSize="13" fontWeight="600">F</text>
                <text x="164" y="154" fill="#475569" fontSize="12">r</text>
                <text x="208" y="176" fill="#475569" fontSize="12">O</text>
                <defs>
                  <marker id="hero-v" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0L8,4L0,8z" fill="#0f766e" />
                  </marker>
                  <marker id="hero-f" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0L8,4L0,8z" fill="#c2410c" />
                  </marker>
                </defs>
              </svg>
              <div className="preview-hud">
                <span><b>⊙</b> B 出纸面 · 0.50 T</span>
                <span>q = +1.00 e</span>
                <span>顺时针 ↻</span>
              </div>
              <div className="preview-stats">
                <span>r <strong>{formatLength(defaultP02.radiusM)}</strong></span>
                <span>T <strong>{formatTime(defaultP02.periodS)}</strong></span>
                <span>v 恒定</span>
              </div>
            </div>
            <div className="preview-controls">
              <span className="preview-play"><Icon name="play" size={14} /> 播放</span>
              <span className="preview-timeline"><span /></span>
              <span className="preview-speed">1×</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section path-entry-section" aria-labelledby="case-entry-title">
        <div className="path-entry-card">
          <div>
            <p className="eyebrow">题目实验 · 原创高考风格</p>
            <h2 id="case-entry-title">从题目直接进入真实模拟器</h2>
            <p>九个原创案例带参数映射、独立验算、预测、变式和最终检查；A17-01 在同一个舞台完成电场加速、有限磁场与屏幕探测，状态交接有独立解析与自动化检查。</p>
          </div>
          <div className="path-entry-actions">
            <Link className="primary-button" to="/cases">打开题目实验<Icon name="arrowRight" size={17} /></Link>
            <Link className="secondary-button" to="/device-check">课堂设备检测</Link>
          </div>
        </div>
      </section>

      <section className="home-section path-entry-section" aria-labelledby="teacher-entry-title">
        <div className="path-entry-card">
          <div>
            <p className="eyebrow">教师工作台 · 本机私有</p>
            <h2 id="teacher-entry-title">把新的复杂题接进真实物理，而不是复制一套演示</h2>
            <p>用 A17 模板编辑题干、逐问推导、参数变式与答案绑定；A17-01 跨求解器连续交接，A17-02 展示感应多事件与能量分账。题目可复算、可导出，但不会被自动标成官方真题。</p>
          </div>
          <div className="path-entry-actions">
            <Link className="primary-button" to="/teacher/problems">打开教师题目工作台<Icon name="arrowRight" size={17} /></Link>
            <Link className="secondary-button" to="/cases/case-a17-electric-magnetic-screen">查看 A17-01</Link>
          </div>
        </div>
      </section>

      <section className="home-section path-entry-section" aria-labelledby="path-entry-title">
        <div className="path-entry-card">
          <div>
            <p className="eyebrow">不知道该从哪开始？</p>
            <h2 id="path-entry-title">按知识路线，从实验走到练习</h2>
            <p>两条推荐路线串起 16 个真实模型；每个模型都能直接打开实验、阅读讲解、只筛选本模型题目。</p>
          </div>
          <div className="path-entry-actions">
            <Link className="primary-button" to="/path">打开学习路线<Icon name="arrowRight" size={17} /></Link>
            <Link className="secondary-button" to="/practice">全部原创练习</Link>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="available-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">可用模型 · 已完成</p>
            <h2 id="available-title">从一个完整切片开始，而不是一排空壳</h2>
          </div>
          <p className="section-lede">
            十六个模型都包含触控参数、分步讲解、实时数据、原创练习与物理引擎测试。
          </p>
        </div>
        <div className="model-grid">
          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P01</span>
                <h3>{P01_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <LorentzForcePreview />
            </div>
            <p>{P01_SIM.description}</p>
            <div className="tag-row">
              {P01_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">{QUESTION_STATS.byModel.p01} 道原创题 · 真实 3D + 2D 运动</span>
              <Link className="model-link" to={P01_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P02</span>
                <h3>{P02_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <OrbitPreview />
            </div>
            <p>{P02_SIM.description}</p>
            <div className="tag-row">
              {P02_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 含多粒子对比</span>
              <Link className="model-link" to={P02_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P03</span>
                <h3>{P03_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <HalfPlanePreview />
            </div>
            <p>{P03_SIM.description}</p>
            <div className="tag-row">
              {P03_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 含多粒子事件对比</span>
              <Link className="model-link" to={P03_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P04</span>
                <h3>{P04_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <FiniteFieldPreview />
            </div>
            <p>{P04_SIM.description}</p>
            <div className="tag-row">
              {P04_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创题 · 条形 / 矩形 / 临界</span>
              <Link className="model-link" to={P04_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P05</span>
                <h3>{P05_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <AlternatingFieldsPreview />
            </div>
            <p>{P05_SIM.description}</p>
            <div className="tag-row">
              {P05_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创题 · 多次跨界与时序</span>
              <Link className="model-link" to={P05_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P06</span>
                <h3>{P06_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <CombinedFieldsPreview />
            </div>
            <p>{P06_SIM.description}</p>
            <div className="tag-row">
              {P06_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 两模式 + 多粒子</span>
              <Link className="model-link" to={P06_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P07</span>
                <h3>{P07_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <BeamlinePreview />
            </div>
            <p>{P07_SIM.description}</p>
            <div className="tag-row">
              {P07_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创题 · 真实狭缝 / 光斑 / 时序</span>
              <Link className="model-link" to={P07_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I01</span>
                <h3>{I01_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <FluxLenzPreview />
            </div>
            <p>{I01_SIM.description}</p>
            <div className="tag-row">
              {I01_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · B / A / θ 三模式</span>
              <Link className="model-link" to={I01_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I02</span>
                <h3>{I02_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <MovingRodPreview />
            </div>
            <p>{I02_SIM.description}</p>
            <div className="tag-row">
              {I02_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 四模式 + 实时推拉</span>
              <Link className="model-link" to={I02_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I03</span>
                <h3>{I03_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <LoopPreview />
            </div>
            <p>{I03_SIM.description}</p>
            <div className="tag-row">
              {I03_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">6 道原创分层题 · 事件与能量校验</span>
              <Link className="model-link" to={I03_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I04</span>
                <h3>{I04_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <TimeVaryingPreview />
            </div>
            <p>{I04_SIM.description}</p>
            <div className="tag-row">
              {I04_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 解析导数与连续调磁</span>
              <Link className="model-link" to={I04_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I05</span>
                <h3>{I05_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <CoupledLoopPreview />
            </div>
            <p>{I05_SIM.description}</p>
            <div className="tag-row">
              {I05_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 四模式 + 能量账本</span>
              <Link className="model-link" to={I05_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I06</span>
                <h3>{I06_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <DualRodsPreview />
            </div>
            <p>{I06_SIM.description}</p>
            <div className="tag-row">
              {I06_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 双棒解析 + 接触停止</span>
              <Link className="model-link" to={I06_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I07</span>
                <h3>{I07_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <OppositeFieldsPreview />
            </div>
            <p>{I07_SIM.description}</p>
            <div className="tag-row">
              {I07_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 真实弹板与能量分账</span>
              <Link className="model-link" to={I07_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">I08</span>
                <h3>{I08_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <AcGeneratorPreview />
            </div>
            <p>{I08_SIM.description}</p>
            <div className="tag-row">
              {I08_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 正弦交流 / 有效值 / 能量</span>
              <Link className="model-link" to={I08_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>

          <article className="model-card is-ready">
            <div className="model-card-head">
              <div>
                <span className="model-number">P08</span>
                <h3>{P08_SIM.title}</h3>
              </div>
              <span className="status-pill status-ready">可用 · 已自检</span>
            </div>
            <div className="model-preview">
              <ConstraintPreview />
            </div>
            <p>{P08_SIM.description}</p>
            <div className="tag-row">
              {P08_SIM.topics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}
            </div>
            <div className="model-card-footer">
              <span className="model-meta">8 道原创分层题 · 目标约束 + 正向复核反求</span>
              <Link className="model-link" to={P08_SIM.route}>
                进入实验 <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="home-section" aria-labelledby="loop-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">学习闭环</p>
            <h2 id="loop-title">先预测，再动手，最后说清楚</h2>
          </div>
        </div>
        <div className="learning-loop">
          {[
            ['01', '预测', '在显示答案之前先选一个方向或变化趋势。提示需要主动点开。'],
            ['02', '调参数', '拖入射点、方向或线框；滑块和数值输入提供精细、可复现的控制。'],
            ['03', '观察与停帧', '播放、倍速、时间轴、上一/下一关键帧。暂停在边界事件上读几何与方程。'],
            ['04', '练习与复盘', '原创题分层提示、解析与实验回链，记录只保存在本机并可导出。'],
          ].map(([number, title, text]) => (
            <article className="loop-card" key={number}>
              <span className="loop-number">{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {PLANNED_SIMS.length > 0 ? (
        <section className="home-section" aria-labelledby="planned-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">路线图 · 规划中</p>
              <h2 id="planned-title">后续模型</h2>
            </div>
            <p className="section-lede">以下模块只展示状态，不提供虚假的可点击演示。</p>
          </div>
          <div className="planned-grid">
            {PLANNED_SIMS.map((sim) => (
              <article className="planned-card" key={sim.id}>
                <div className="planned-head">
                  <span className="model-number">{sim.id.toUpperCase()}</span>
                  <span className="status-pill">规划中</span>
                </div>
                <h3>{sim.title}</h3>
                <p>{sim.description}</p>
                <span className="planned-phase">{sim.phase} 计划</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="boundary-note" aria-label="当前范围与限制">
        <div className="boundary-icon"><Icon name="info" size={22} /></div>
        <div>
          <h2>已经实现 vs. 仍待完成</h2>
          <p>
            <strong>已实现：</strong>P01、P02、P03、P04、P05、P06、P07、P08、I01、I02、I03、I04、I05、I06、I07、I08 的可运行垂直切片，{QUESTION_STATS.total} 道原创题（P01 {QUESTION_STATS.byModel.p01} 道，P02–P08/I01/I02/I05/I06/I07/I08 各 {QUESTION_STATS.byModel.p02} 道，I03 {QUESTION_STATS.byModel.i03} 道，I04 {QUESTION_STATS.byModel.i04} 道），
            本地答案与收藏记录、平板横竖屏布局、路由分包、真实 WebGL 3D 与 PWA 构建。
          </p>
          <p>
            <strong>待完成：</strong>真题参数核对与授权题目录入、离线真实设备实测、
            分步填空题与教师自定义预设。真题索引均标注为“外链 / 未在线复核”，不转载题干或答案。
          </p>
        </div>
      </section>
    </div>
  );
}

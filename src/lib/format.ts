export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3) {
    return toSuperscript(value.toExponential(digits - 1));
  }
  const rounded = Number(value.toFixed(Math.max(0, digits - Math.floor(Math.log10(abs)) - 1)));
  return String(rounded);
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '',
};

function toSuperscript(exponential: string): string {
  const [mantissa, exponentRaw] = exponential.split('e');
  const exponent = exponentRaw.replace('+', '');
  return `${mantissa}×10${[...exponent].map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
}

const PREFIXES: Array<{ factor: number; prefix: string }> = [
  { factor: 1e9, prefix: 'G' },
  { factor: 1e6, prefix: 'M' },
  { factor: 1e3, prefix: 'k' },
  { factor: 1, prefix: '' },
  { factor: 1e-3, prefix: 'm' },
  { factor: 1e-6, prefix: 'µ' },
  { factor: 1e-9, prefix: 'n' },
  { factor: 1e-12, prefix: 'p' },
];

export function formatSI(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  let chosen = PREFIXES[PREFIXES.length - 1];
  for (const p of PREFIXES) {
    if (abs >= p.factor) {
      chosen = p;
      break;
    }
  }
  const scaled = value / chosen.factor;
  return `${formatNumber(scaled, digits)} ${chosen.prefix}${unit}`;
}

export function formatLength(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  const abs = Math.abs(meters);
  if (abs === 0) return '0 m';
  if (abs >= 1) return `${formatNumber(meters, 3)} m`;
  if (abs >= 0.01) return `${formatNumber(meters * 100, 3)} cm`;
  if (abs >= 0.001) return `${formatNumber(meters * 1000, 3)} mm`;
  return formatSI(meters, 'm');
}

export function formatTime(seconds: number): string {
  return formatSI(seconds, 's');
}

export function formatVelocity(mps: number): string {
  if (!Number.isFinite(mps)) return '—';
  const abs = Math.abs(mps);
  if (abs === 0) return '0 m/s';
  if (abs >= 1e5) return `${(mps / 1e6).toFixed(2)} × 10⁶ m/s`;
  if (abs >= 1e3) return `${(mps / 1e3).toFixed(2)} × 10³ m/s`;
  return `${formatNumber(mps, 3)} m/s`;
}

export function formatForce(newtons: number): string {
  if (!Number.isFinite(newtons)) return '—';
  if (newtons === 0) return '0 N';
  return `${formatNumber(newtons, 3)} N`;
}

export function formatArea(squareMeters: number): string {
  if (!Number.isFinite(squareMeters)) return '—';
  const abs = Math.abs(squareMeters);
  if (abs === 0) return '0 m²';
  if (abs >= 1) return `${formatNumber(squareMeters, 3)} m²`;
  if (abs >= 1e-4) return `${formatNumber(squareMeters * 1e4, 3)} cm²`;
  return `${formatNumber(squareMeters * 1e6, 3)} mm²`;
}

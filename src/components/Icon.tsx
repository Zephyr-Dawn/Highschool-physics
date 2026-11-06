import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  stepBack: 'M6 5h2v14H6zM18 5.5v13L9 12z',
  stepForward: 'M18 5h-2v14h2zM6 5.5v13L15 12z',
  reset: 'M4 10a8 8 0 1 1 2.6 5.9M4 4v6h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  hand: 'M8 11V6.5a1.5 1.5 0 0 1 3 0V11m0-1V5a1.5 1.5 0 0 1 3 0v6m0-1V6a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 14a1.6 1.6 0 0 1 2.6-1.8L8 14',
  pointer: 'M6 3l12 9-5.6 1.2L15 20l-2.4 1-2.7-6.6L6 18z',
  heart: 'M12 20s-7-4.35-7-9.5A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.5C19 15.65 12 20 12 20z',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  upload: 'M12 16V5m0 0L8 9m4-4l4 4M5 20h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  check: 'M5 12.5l4.2 4.2L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 11v6M12 7.2v.3',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5H5V6h5',
  bulb: 'M9 18h6M10 21h4M8.2 14.5A6 6 0 1 1 15.8 14.5c-.8.7-1.2 1.4-1.3 2.5h-5c-.1-1.1-.5-1.8-1.3-2.5z',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16zM4 18.5A2.5 2.5 0 0 1 6.5 16H20',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  ruler: 'M4 9h16v6H4zM8 9v3M12 9v4M16 9v3',
  pauseCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 9v6M14 9v6',
  home: 'M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z',
};

export type IconName = keyof typeof paths;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
}

export function Icon({ name, size = 20, className, style, filled = false }: IconProps) {
  const isFilled =
    filled || name === 'play' || name === 'pause' || name === 'stepBack' || name === 'stepForward';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path
        d={paths[name]}
        fill={isFilled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={isFilled ? 0 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

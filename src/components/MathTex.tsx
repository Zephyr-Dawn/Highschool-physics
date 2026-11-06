import { useMemo } from 'react';
import katex from 'katex';

interface MathTexProps {
  children: string;
  block?: boolean;
  className?: string;
}

export function MathTex({ children, block = false, className }: MathTexProps) {
  const html = useMemo(
    () =>
      katex.renderToString(children, {
        throwOnError: false,
        displayMode: block,
        strict: 'ignore',
        trust: false,
      }),
    [block, children],
  );
  return (
    <span
      className={`mathtex ${block ? 'mathtex-block' : ''} ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

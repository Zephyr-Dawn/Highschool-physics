import { useEffect, useRef, useState } from 'react';

export interface Size {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>(fallback: Size = { width: 800, height: 480 }) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize((prev) =>
          Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
            ? prev
            : { width: rect.width, height: rect.height },
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

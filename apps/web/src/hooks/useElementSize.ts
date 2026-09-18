import { useState, useEffect, useRef } from 'react';

export function useElementSize<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setSize({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        });
      }
    });

    observer.observe(node);
    
    // Initial size
    setSize({
      width: node.clientWidth,
      height: node.clientHeight,
    });

    return () => observer.disconnect();
  }, [node]);

  return [setNode, size] as const;
}

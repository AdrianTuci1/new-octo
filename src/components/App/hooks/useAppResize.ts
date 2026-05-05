import { useState, useCallback, useRef } from 'react';

interface ResizeOptions {
  minWidth: number;
  maxWidth: number;
  direction: 'left' | 'right';
  initialWidth: number;
}

export function useAppResize(options: ResizeOptions) {
  const [width, setWidth] = useState(options.initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    
    let newWidth: number;
    if (options.direction === 'left') {
      newWidth = e.clientX;
    } else {
      newWidth = window.innerWidth - e.clientX;
    }

    if (newWidth > options.minWidth && newWidth < options.maxWidth) {
      setWidth(newWidth);
    }
  }, [options.direction, options.minWidth, options.maxWidth]);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, [handleResize]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  }, [handleResize, stopResizing]);

  return {
    width,
    isResizing,
    startResizing
  };
}

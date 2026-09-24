import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reusable hook to track seconds elapsed since last update/event.
 * Eliminates duplicate setInterval boilerplate across drawers and inspectors.
 */
export function useAgoTimer(triggerKey?: unknown) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastTimeRef = useRef<number>(0);

  const resetTimer = useCallback(() => {
    lastTimeRef.current = Date.now();
    setSecondsAgo(0);
  }, []);

  useEffect(() => {
    lastTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [triggerKey]);

  return { secondsAgo, resetTimer };
}

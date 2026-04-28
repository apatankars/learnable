import { useState, useEffect, useRef, useCallback } from 'react';

export function useTimer(initialSeconds: number, noLimit: boolean, onExpire: () => void) {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!running || noLimit) return;
    const id = setInterval(() => {
      setTimeRemaining(t => {
        if (t <= 1) {
          expireRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, noLimit]);

  const start = useCallback(() => {
    setTimeRemaining(initialSeconds);
    setRunning(true);
  }, [initialSeconds]);

  const pause = useCallback(() => setRunning(false), []);
  const resume = useCallback(() => setRunning(true), []);
  const reset = useCallback(() => {
    setRunning(false);
    setTimeRemaining(initialSeconds);
  }, [initialSeconds]);

  return { timeRemaining, running, start, pause, resume, reset };
}

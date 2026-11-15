import { useEffect, useState } from 'react';

/** Wall clock that re-renders every `ms`. */
export const useClock = (ms = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};

export const msLeft = (iso: string | null | undefined, now: number) => (iso ? Date.parse(iso) - now : 0);

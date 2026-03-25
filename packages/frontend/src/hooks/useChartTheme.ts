import { useEffect, useState } from 'react';

/** Returns an integer that increments whenever the active theme (light/dark) changes. */
export function useChartThemeKey(): number {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setKey((k) => k + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return key;
}

import { useCallback, useEffect, useState } from 'react';

type Density = 'comfortable' | 'compact';

function useDensity() {
  const [density, setDensityState] = useState<Density>(() =>
    document.documentElement.classList.contains('compact') ? 'compact' : 'comfortable',
  );

  useEffect(() => {
    if (density === 'compact') {
      document.documentElement.classList.add('compact');
    } else {
      document.documentElement.classList.remove('compact');
    }
  }, [density]);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);
  const toggleDensity = useCallback(
    () => setDensityState((prev) => (prev === 'compact' ? 'comfortable' : 'compact')),
    [],
  );

  return { density, setDensity, toggleDensity } as const;
}

export { useDensity };
export type { Density };

import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribeTheme(callback: () => void): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'class') {
        callback();
        break;
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot);

  const setTheme = useCallback((t: Theme) => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle('dark');
  }, []);

  return { theme, setTheme, toggleTheme } as const;
}

export { useTheme };
export type { Theme };

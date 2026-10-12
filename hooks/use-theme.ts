'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Theme stored on <html data-theme> and in localStorage ("teamchat-theme"). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as Theme);
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('teamchat-theme', t); } catch { /* storage blocked */ }
    listeners.forEach((fn) => fn());
  }, []);
  const toggle = useCallback(() => setTheme(read() === 'light' ? 'dark' : 'light'), [setTheme]);
  return { theme, setTheme, toggle };
}

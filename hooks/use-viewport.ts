'use client';

import { useSyncExternalStore } from 'react';

const subscribe = (fn: () => void) => {
  window.addEventListener('resize', fn);
  return () => window.removeEventListener('resize', fn);
};

/** Breakpoints from the design: mobile < 768 ≤ tablet < 1100 ≤ desktop. */
export function useViewport() {
  const w = useSyncExternalStore(subscribe, () => window.innerWidth, () => 1440);
  return { width: w, mobile: w < 768, tablet: w >= 768 && w < 1100, desktop: w >= 1100 };
}

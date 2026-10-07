'use client';

import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/client/cn';
import { MoonIcon, SunIcon } from './icons';

export function ThemeToggle({ className, size = 18 }: { className?: string; size?: number }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      className={cn(
        'flex size-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-bg text-txt2 outline-none hover:bg-hover',
        className,
      )}
    >
      {theme === 'light' ? <MoonIcon size={size} /> : <SunIcon size={size} />}
    </button>
  );
}

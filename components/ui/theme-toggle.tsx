'use client';

import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/client/cn';
import { MoonIcon, SunIcon } from './icons';

/** 36px rounded-lg on the rail and login, 32px rounded-md in the sidebar header (compact). */
export function ThemeToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      className={cn(
        'flex cursor-pointer items-center justify-center border border-line bg-bg text-txt2 outline-none hover:bg-hover',
        compact ? 'size-8 rounded-md' : 'size-9 rounded-lg',
        className,
      )}
    >
      {theme === 'light' ? <MoonIcon size={compact ? 16 : 18} /> : <SunIcon size={compact ? 16 : 18} />}
    </button>
  );
}

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/client/cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'outline' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  // Primary turns grey while the form isn't ready (as in the design), but stays clickable to show errors.
  primary: 'bg-accent text-white hover:bg-accent-hover data-[idle=true]:bg-line3',
  outline: 'border border-line3 bg-bg text-txt hover:bg-hover',
  ghost: 'bg-transparent text-txt2 hover:bg-hover',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; idle?: boolean };

export function Button({ variant = 'primary', loading, idle, className, children, ...rest }: Props) {
  return (
    <button
      data-idle={idle || undefined}
      className={cn(
        'flex h-11 cursor-pointer items-center justify-center gap-2.5 rounded-lg text-[15px] font-bold outline-none transition-colors disabled:cursor-default',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

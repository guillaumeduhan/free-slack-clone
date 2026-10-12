import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/client/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; invalid?: boolean };

export function TextField({ label, hint, invalid, className, ...rest }: Props) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-bold text-txt2">
      <span className="flex items-baseline gap-1.5">
        {label}
        {hint && <span className="text-xs font-normal text-mute">{hint}</span>}
      </span>
      <input
        className={cn(
          'h-11 rounded-lg border bg-bg px-3.5 text-[15px] font-normal text-txt outline-none placeholder:text-mute read-only:bg-sub',
          invalid ? 'border-danger' : 'border-line3',
          className,
        )}
        {...rest}
      />
    </label>
  );
}

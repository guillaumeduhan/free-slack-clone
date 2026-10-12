'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/client/cn';

type Props = {
  digits: string[];
  onChange: (digits: string[]) => void;
  onComplete: (code: string) => void;
  invalid?: boolean;
};

/** Six one-digit boxes with auto-advance, backspace, arrows and paste. */
export function CodeInput({ digits, onChange, onComplete, invalid }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[i]?.focus();

  const update = (next: string[], focusAt: number | null) => {
    onChange(next);
    if (focusAt != null) setTimeout(() => focus(focusAt), 0);
    if (next.every(Boolean)) onComplete(next.join(''));
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      update(digits.map((d, j) => (j === i - 1 ? '' : d)), i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) focus(i - 1);
    else if (e.key === 'ArrowRight' && i < 5) focus(i + 1);
    else if (e.key === 'Enter') onComplete(digits.join(''));
  };

  const onPaste = (e: ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!t) return;
    e.preventDefault();
    update(Array.from({ length: 6 }, (_, i) => t[i] ?? ''), Math.min(t.length, 5));
  };

  return (
    <div onPaste={onPaste} className="grid grid-cols-6 gap-2">
      {digits.map((v, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={v}
          autoFocus={i === 0}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            update(digits.map((x, j) => (j === i ? d : x)), d && i < 5 ? i + 1 : null);
          }}
          onKeyDown={onKey(i)}
          className={cn(
            'h-14 min-w-0 rounded-lg border bg-sub text-center font-mono text-2xl text-txt outline-none',
            invalid ? 'border-danger' : v ? 'border-accent' : 'border-line3',
          )}
        />
      ))}
    </div>
  );
}

import { cn } from '@/lib/client/cn';

/** Sidebar counters: grey for nav items, red for unread conversations. */
export function CountBadge({ n, tone = 'muted' }: { n: number; tone?: 'muted' | 'unread' }) {
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 text-[11px]',
        tone === 'muted' ? 'bg-line font-bold text-txt2' : 'bg-danger font-medium text-white',
      )}
    >
      {n}
    </span>
  );
}

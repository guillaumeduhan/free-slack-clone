import { cn } from '@/lib/client/cn';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-white/35 border-t-white', className)} />;
}

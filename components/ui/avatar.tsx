import { cn } from '@/lib/client/cn';
import { colorFor, initials } from '@/lib/client/format';

type Props = {
  id: string | null | undefined;
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
  /** Status dot color (e.g. var(--online)); omitted = no dot. */
  dot?: string | null;
  dotSize?: number;
  dotBorder?: number;
  color?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
};

/** Colored initials tile from the design, with an optional presence dot. */
export function Avatar({ id, name, size = 36, radius = 6, fontSize, dot, dotSize = 11, dotBorder = 2, color, className, onClick }: Props) {
  return (
    <span onClick={onClick} className={cn('relative flex-none', onClick && 'cursor-pointer', className)} style={{ width: size, height: size }}>
      <span
        className="flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, borderRadius: radius, background: color ?? colorFor(id), fontSize: fontSize ?? Math.round(size / 3) }}
      >
        {initials(name)}
      </span>
      {dot && (
        <span
          className="absolute rounded-full"
          style={{ right: -3, bottom: -3, width: dotSize, height: dotSize, background: dot, border: `${dotBorder}px solid var(--bg)` }}
        />
      )}
    </span>
  );
}

export const presenceDot = (online: boolean, dnd?: boolean) => (dnd ? 'var(--warn)' : online ? 'var(--online)' : 'var(--mute2)');
